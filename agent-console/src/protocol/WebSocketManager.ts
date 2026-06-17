// ─────────────────────────────────────────────────────────────
// WebSocketManager.ts
//
// Owns the entire WebSocket lifecycle. React components NEVER
// touch the ws instance directly. This module:
//   1. Connects, disconnects, reconnects with exponential backoff
//   2. Parses raw frames through parseServerEvent
//   3. Feeds events to SequenceBuffer for reordering/dedup
//   4. Dispatches ordered events to stores
//   5. Sends PONG, TOOL_ACK, RESUME at the protocol layer
//   6. Reports connection state to connectionStore
//
// TOOL_ACK is sent directly from the dispatch loop (store layer),
// NOT from a useEffect — guarantees < 2s timing.
// ─────────────────────────────────────────────────────────────

import { parseServerEvent } from './parseServerEvent';
import { SequenceBuffer } from './SequenceBuffer';
import type { ClientMessage, ServerEvent } from './types';
import { useConnectionStore } from '@/store/connectionStore';
import { useAgentStore } from '@/store/agentStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useContextStore } from '@/store/contextStore';
import { TokenBatcher } from '@/logic/tokenBatcher';
import { generateId } from '@/logic/ids';

// ── Backoff configuration ─────────────────────────────────────
const BACKOFF_SCHEDULE = [500, 1000, 2000, 4000, 10000]; // ms
const MAX_RECONNECT_ATTEMPTS = 20;
const RESUMED_STREAM_STALL_MS = 12_000;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private sequenceBuffer: SequenceBuffer;
  private tokenBatcher: TokenBatcher;
  private reconnectAttempt: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose: boolean = false;
  private hasHistory: boolean = false; // true if we had a previous session
  private acknowledgedToolCalls: Set<string> = new Set();
  private pongedPingSeqs: Set<number> = new Set();
  private resumedStreamTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
    this.sequenceBuffer = new SequenceBuffer();
    this.tokenBatcher = new TokenBatcher((entry) => {
      useTimelineStore.getState().addEntry(entry);
    });
  }

  // ─────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    useConnectionStore.getState().setStatus('connecting');
    this.createSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, 'client_disconnect');
      this.ws = null;
    }

    useConnectionStore.getState().setStatus('idle');
  }

  sendUserMessage(content: string): void {
    // Reset sequence buffer for new turn (server resets seq to 0)
    this.sequenceBuffer.reset();
    this.tokenBatcher.reset();
    this.acknowledgedToolCalls.clear();
    this.pongedPingSeqs.clear();
    this.clearResumedStreamTimer();
    useConnectionStore.getState().resetSequenceTracking();

    // Reset stores for new turn
    useTimelineStore.getState().reset();
    useContextStore.getState().reset();

    // Add user message to conversation
    useAgentStore.getState().addUserMessage(content);

    // Send to server
    this.send({ type: 'USER_MESSAGE', content });

    // Add timeline entry
    useTimelineStore.getState().addEntry({
      id: generateId('tl'),
      type: 'CONNECTION',
      timestamp: Date.now(),
      seq: null,
      summary: `Sent: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`,
      detail: { content },
      chatBlockId: null,
      linkedCallId: null,
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WebSocketManager] Cannot send — socket not open:', msg.type);
    }
  }

  getLastCommittedSeq(): number {
    return useConnectionStore.getState().lastCommittedSeq;
  }

  destroy(): void {
    this.disconnect();
    this.tokenBatcher.reset();
    this.clearResumedStreamTimer();
  }

  // ─────────────────────────────────────────────────────────
  // Socket lifecycle
  // ─────────────────────────────────────────────────────────

  private createSocket(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error('[WebSocketManager] Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => this.handleOpen();
    this.ws.onmessage = (event) => this.handleMessage(event);
    this.ws.onclose = (event) => this.handleClose(event);
    this.ws.onerror = () => this.handleError();
  }

  private handleOpen(): void {
    console.log('[WebSocketManager] Connected');
    this.reconnectAttempt = 0;
    useConnectionStore.getState().resetReconnectAttempts();

    if (this.hasHistory) {
      // Reconnection — send RESUME as FIRST message
      const lastSeq = this.getLastCommittedSeq();
      useConnectionStore.getState().setStatus('resuming');
      useConnectionStore.getState().setLastResumeSent(lastSeq);

      this.send({ type: 'RESUME', last_seq: lastSeq });

      useTimelineStore.getState().addEntry({
        id: generateId('tl'),
        type: 'RESUME',
        timestamp: Date.now(),
        seq: null,
        summary: `RESUME sent (last_seq: ${lastSeq})`,
        detail: { last_seq: lastSeq },
        chatBlockId: null,
        linkedCallId: null,
      });

      console.log(`[WebSocketManager] Sent RESUME with last_seq=${lastSeq}`);
      this.armResumedStreamTimer();
    }

    useConnectionStore.getState().setStatus('connected');

    // Add timeline entry
    useTimelineStore.getState().addEntry({
      id: generateId('tl'),
      type: 'CONNECTION',
      timestamp: Date.now(),
      seq: null,
      summary: this.hasHistory ? 'Reconnected' : 'Connected',
      detail: { url: this.url },
      chatBlockId: null,
      linkedCallId: null,
    });

    this.hasHistory = true;
  }

  private handleMessage(event: MessageEvent): void {
    const raw = typeof event.data === 'string' ? event.data : '';
    const serverEvent = parseServerEvent(raw);

    if (!serverEvent) {
      return; // Malformed message — already logged by parser
    }

    // ACK on receipt, before sequence gaps drain. Chaos mode can hold an
    // earlier sequence long enough for the server's five-second ACK timeout.
    if (
      serverEvent.type === 'TOOL_CALL' &&
      !this.acknowledgedToolCalls.has(serverEvent.call_id)
    ) {
      this.acknowledgedToolCalls.add(serverEvent.call_id);
      this.send({ type: 'TOOL_ACK', call_id: serverEvent.call_id });
    }

    // PING must be answered immediately, before sequence ordering
    // (it still has a seq but the PONG response is time-critical)
    if (serverEvent.type === 'PING' && !this.pongedPingSeqs.has(serverEvent.seq)) {
      this.pongedPingSeqs.add(serverEvent.seq);
      this.handlePing(serverEvent);
    }

    // Feed to SequenceBuffer for ordering and dedup
    const ready = this.sequenceBuffer.push(serverEvent);

    // Update connection stats
    useConnectionStore.getState().updateSeqStats(
      this.sequenceBuffer.lastOrderedSeq,
      this.sequenceBuffer.pendingCount,
      this.sequenceBuffer.duplicatesIgnored
    );

    // Process events that are ready (in strict seq order)
    for (const event of ready) {
      this.dispatchEvent(event);
      useConnectionStore.getState().markDispatched(event.seq);
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log(`[WebSocketManager] Closed: code=${event.code} reason=${event.reason}`);
    this.ws = null;
    this.clearResumedStreamTimer();

    if (this.intentionalClose) {
      useConnectionStore.getState().setStatus('idle');
      return;
    }

    // Unexpected close — reconnect
    useConnectionStore.getState().setStatus('reconnecting');

    useTimelineStore.getState().addEntry({
      id: generateId('tl'),
      type: 'CONNECTION',
      timestamp: Date.now(),
      seq: null,
      summary: `Connection lost (code: ${event.code})`,
      detail: { code: event.code, reason: event.reason },
      chatBlockId: null,
      linkedCallId: null,
    });

    this.tokenBatcher.flush();
    this.scheduleReconnect();
  }

  private handleError(): void {
    console.error('[WebSocketManager] WebSocket error');
    // onclose will fire after onerror, which handles reconnection
  }

  // ─────────────────────────────────────────────────────────
  // Reconnection with exponential backoff
  // ─────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WebSocketManager] Max reconnect attempts reached');
      useConnectionStore.getState().setStatus('failed');
      return;
    }

    const backoffIndex = Math.min(this.reconnectAttempt, BACKOFF_SCHEDULE.length - 1);
    const delay = BACKOFF_SCHEDULE[backoffIndex]!;

    console.log(`[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      useConnectionStore.getState().incrementReconnectAttempts();
      this.createSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private armResumedStreamTimer(): void {
    this.clearResumedStreamTimer();

    if (!useAgentStore.getState().activeStreamId) return;

    this.resumedStreamTimer = setTimeout(() => {
      const agentStore = useAgentStore.getState();
      if (!agentStore.activeStreamId) return;

      this.tokenBatcher.flush();
      agentStore.interruptActiveStream();

      useTimelineStore.getState().addEntry({
        id: generateId('tl'),
        type: 'ERROR',
        timestamp: Date.now(),
        seq: null,
        summary: 'Stream interrupted: server did not resume generation',
        detail: { timeout_ms: RESUMED_STREAM_STALL_MS },
        chatBlockId: null,
        linkedCallId: null,
      });
    }, RESUMED_STREAM_STALL_MS);
  }

  private clearResumedStreamTimer(): void {
    if (this.resumedStreamTimer) {
      clearTimeout(this.resumedStreamTimer);
      this.resumedStreamTimer = null;
    }
  }

  private noteStreamProgress(): void {
    if (this.resumedStreamTimer) {
      this.armResumedStreamTimer();
    }
  }

  // ─────────────────────────────────────────────────────────
  // PING handler — must respond within 3s
  // ─────────────────────────────────────────────────────────

  private handlePing(event: ServerEvent & { type: 'PING' }): void {
    // Echo challenge verbatim — including empty string (corrupt heartbeat)
    this.send({ type: 'PONG', echo: event.challenge });

    useTimelineStore.getState().addEntry({
      id: generateId('tl'),
      type: 'PONG',
      timestamp: Date.now(),
      seq: event.seq,
      summary: `PONG (echo: "${event.challenge || '(empty)'}")`,
      detail: { echo: event.challenge },
      chatBlockId: null,
      linkedCallId: null,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Event dispatcher — routes ordered events to stores
  // ─────────────────────────────────────────────────────────

  private dispatchEvent(event: ServerEvent): void {
    const agentStore = useAgentStore.getState();
    const timelineStore = useTimelineStore.getState();
    const contextStore = useContextStore.getState();

    switch (event.type) {
      case 'TOKEN': {
        this.noteStreamProgress();
        agentStore.ensureAgentMessage(event.stream_id);
        const blockId = agentStore.appendToken(event.stream_id, event.text);
        this.tokenBatcher.addToken(event.stream_id, event.seq, event.text, blockId);
        break;
      }

      case 'TOOL_CALL': {
        this.noteStreamProgress();
        // Flush token batch before tool call
        this.tokenBatcher.flushOnNonToken();

        agentStore.ensureAgentMessage(event.stream_id);
        const blockId = agentStore.addToolCall(
          event.stream_id,
          event.call_id,
          event.tool_name,
          event.args
        );

        timelineStore.addEntry({
          id: generateId('tl'),
          type: 'TOOL_CALL',
          timestamp: Date.now(),
          seq: event.seq,
          summary: `Tool: ${event.tool_name}`,
          detail: { call_id: event.call_id, tool_name: event.tool_name, args: event.args },
          chatBlockId: blockId,
          linkedCallId: event.call_id,
        });
        break;
      }

      case 'TOOL_RESULT': {
        this.noteStreamProgress();
        this.tokenBatcher.flushOnNonToken();

        agentStore.updateToolResult(event.call_id, event.result);

        // Find the tool block ID for linking
        const conversation = useAgentStore.getState().conversation;
        let toolBlockId: string | null = null;
        for (const entry of conversation) {
          if (entry.type === 'agent') {
            for (const block of entry.message.blocks) {
              if (block.type === 'tool' && block.callId === event.call_id) {
                toolBlockId = block.id;
                break;
              }
            }
          }
          if (toolBlockId) break;
        }

        timelineStore.addEntry({
          id: generateId('tl'),
          type: 'TOOL_RESULT',
          timestamp: Date.now(),
          seq: event.seq,
          summary: `Result for: ${event.call_id}`,
          detail: { call_id: event.call_id, result: event.result },
          chatBlockId: toolBlockId,
          linkedCallId: event.call_id,
        });
        break;
      }

      case 'CONTEXT_SNAPSHOT': {
        this.noteStreamProgress();
        this.tokenBatcher.flushOnNonToken();

        contextStore.addSnapshot(event.context_id, event.seq, event.data);

        const dataSize = JSON.stringify(event.data).length;
        timelineStore.addEntry({
          id: generateId('tl'),
          type: 'CONTEXT_SNAPSHOT',
          timestamp: Date.now(),
          seq: event.seq,
          summary: `Context: ${event.context_id} (${formatBytes(dataSize)})`,
          detail: { context_id: event.context_id, size: dataSize },
          chatBlockId: null,
          linkedCallId: null,
        });
        break;
      }

      case 'PING': {
        // PONG already sent in handlePing (before sequencing).
        // Just add timeline entry for the processed PING.
        this.tokenBatcher.flushOnNonToken();

        timelineStore.addEntry({
          id: generateId('tl'),
          type: 'PING',
          timestamp: Date.now(),
          seq: event.seq,
          summary: `PING (challenge: "${event.challenge || '(empty)'}")`,
          detail: { challenge: event.challenge },
          chatBlockId: null,
          linkedCallId: null,
        });
        break;
      }

      case 'STREAM_END': {
        this.clearResumedStreamTimer();
        this.tokenBatcher.flush();
        agentStore.endStream(event.stream_id);

        timelineStore.addEntry({
          id: generateId('tl'),
          type: 'STREAM_END',
          timestamp: Date.now(),
          seq: event.seq,
          summary: `Stream ended: ${event.stream_id}`,
          detail: { stream_id: event.stream_id },
          chatBlockId: null,
          linkedCallId: null,
        });
        break;
      }

      case 'ERROR': {
        this.tokenBatcher.flushOnNonToken();

        timelineStore.addEntry({
          id: generateId('tl'),
          type: 'ERROR',
          timestamp: Date.now(),
          seq: event.seq,
          summary: `Error: ${event.code} — ${event.message}`,
          detail: { code: event.code, message: event.message },
          chatBlockId: null,
          linkedCallId: null,
        });
        break;
      }
    }
  }
}

// ── Singleton management ──────────────────────────────────────

let instance: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager | null {
  return instance;
}

export function createWebSocketManager(url: string): WebSocketManager {
  if (instance) {
    instance.destroy();
  }
  instance = new WebSocketManager(url);
  return instance;
}

// ── Helpers ───────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
