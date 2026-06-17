// ─────────────────────────────────────────────────────────────
// tokenBatcher.ts
//
// Batches consecutive TOKEN events on the same stream_id into
// single timeline rows: "Streamed N tokens (Xms)".
//
// Flush triggers:
// - Non-token event arrives
// - stream_id changes
// - 250ms elapsed since first token in batch
// - STREAM_END fires
// ─────────────────────────────────────────────────────────────

import type { TimelineEntry } from '@/protocol/types';
import { generateId } from './ids';

export interface TokenBatch {
  streamId: string;
  count: number;
  totalText: string;
  startTime: number;
  endTime: number;
  firstSeq: number;
  lastSeq: number;
  chatBlockId: string | null;
}

const FLUSH_INTERVAL_MS = 250;

export class TokenBatcher {
  private currentBatch: TokenBatch | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private onFlush: (entry: TimelineEntry) => void;

  constructor(onFlush: (entry: TimelineEntry) => void) {
    this.onFlush = onFlush;
  }

  /**
   * Add a token event to the current batch.
   * Returns true if the batch was flushed (and a new one started).
   */
  addToken(
    streamId: string,
    seq: number,
    text: string,
    chatBlockId: string | null
  ): void {
    // If stream changed, flush the old batch
    if (this.currentBatch && this.currentBatch.streamId !== streamId) {
      this.flush();
    }

    if (!this.currentBatch) {
      this.currentBatch = {
        streamId,
        count: 0,
        totalText: '',
        startTime: Date.now(),
        endTime: Date.now(),
        firstSeq: seq,
        lastSeq: seq,
        chatBlockId,
      };
      this.scheduleFlush();
    }

    this.currentBatch.count++;
    this.currentBatch.totalText += text;
    this.currentBatch.endTime = Date.now();
    this.currentBatch.lastSeq = seq;
    if (chatBlockId) {
      this.currentBatch.chatBlockId = chatBlockId;
    }
  }

  /**
   * Flush on non-token event or stream end.
   */
  flushOnNonToken(): void {
    if (this.currentBatch) {
      this.flush();
    }
  }

  /**
   * Force flush (e.g., on STREAM_END or reset).
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (!this.currentBatch) return;

    const batch = this.currentBatch;
    const durationMs = batch.endTime - batch.startTime;

    const entry: TimelineEntry = {
      id: generateId('tl'),
      type: 'TOKEN_BATCH',
      timestamp: batch.startTime,
      seq: batch.firstSeq,
      summary: `Streamed ${batch.count} token${batch.count !== 1 ? 's' : ''} (${durationMs}ms)`,
      detail: {
        tokenCount: batch.count,
        durationMs,
        streamId: batch.streamId,
        firstSeq: batch.firstSeq,
        lastSeq: batch.lastSeq,
        text: batch.totalText,
      },
      chatBlockId: batch.chatBlockId,
      linkedCallId: null,
    };

    this.currentBatch = null;
    this.onFlush(entry);
  }

  /** Reset (new turn). */
  reset(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.currentBatch = null;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }
}
