'use client';

import { useCallback } from 'react';
import { useAgentStore } from '@/store/agentStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useConnectionStore } from '@/store/connectionStore';
import type { ChatBlock, ToolBlock } from '@/protocol/types';
import clsx from 'clsx';

// ── ToolCard Component ────────────────────────────────────────

function ToolCard({ block }: { block: ToolBlock }) {
  const highlightedChatBlockId = useTimelineStore((s) => s.highlightedChatBlockId);
  const setHighlightedTimeline = useTimelineStore((s) => s.setHighlightedTimeline);
  const timelineIdByChatBlockId = useTimelineStore((s) => s.timelineIdByChatBlockId);
  const connectionStatus = useConnectionStore((s) => s.status);

  const isHighlighted = highlightedChatBlockId === block.id;
  const isReconnecting = connectionStatus === 'reconnecting' || connectionStatus === 'resuming';

  const handleClick = useCallback(() => {
    const timelineId = timelineIdByChatBlockId.get(block.id);
    if (timelineId) {
      setHighlightedTimeline(timelineId);
      // Scroll timeline row into view
      const el = document.getElementById(`timeline-row-${timelineId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Clear highlight after 1.5s
      setTimeout(() => setHighlightedTimeline(null), 1500);
    }
  }, [block.id, timelineIdByChatBlockId, setHighlightedTimeline]);

  let statusLabel = block.status;
  if (block.status === 'pending' && isReconnecting) {
    statusLabel = 'pending' as const;
  }

  return (
    <div
      className={clsx('tool-card', isHighlighted && 'tool-card--highlighted')}
      id={`tool-card-${block.id}`}
      onClick={handleClick}
    >
      <div className="tool-card__header">
        <span className="tool-card__icon">⚡</span>
        <span className="tool-card__name">{block.toolName}</span>
        <span className={`tool-card__status tool-card__status--${statusLabel}`}>
          {statusLabel === 'pending' && isReconnecting ? '⏳ waiting (reconnecting)' : statusLabel}
        </span>
      </div>
      <div className="tool-card__body">
        <div className="tool-card__section-title">Arguments</div>
        <pre className="tool-card__json">
          {JSON.stringify(block.args, null, 2)}
        </pre>
        {block.result && (
          <>
            <div className="tool-card__section-title">Result</div>
            <pre className="tool-card__json">
              {JSON.stringify(block.result, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

// ── TextBlock Component ───────────────────────────────────────

function TextBlockView({ block, isStreaming }: { block: ChatBlock & { type: 'text' }; isStreaming: boolean }) {
  return (
    <span
      className={clsx('text-block', isStreaming && 'text-block--streaming')}
      id={`text-block-${block.id}`}
    >
      {block.content}
    </span>
  );
}

// ── ChatPanel Component ───────────────────────────────────────

export function ChatPanel() {
  const conversation = useAgentStore((s) => s.conversation);
  const activeStreamId = useAgentStore((s) => s.activeStreamId);

  return (
    <div className="chat-panel" id="chat-panel">
      <div
        className="chat-messages"
        id="chat-messages"
        role="log"
        aria-label="Conversation"
        tabIndex={0}
      >
        {conversation.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">💬</div>
            <div className="empty-state__text">
              Send a message to start. Try &quot;hello&quot;, &quot;summarize the Q3 report&quot;, &quot;analyze the data&quot;, or &quot;search for SLA requirements&quot;.
            </div>
          </div>
        )}

        {conversation.map((entry) => {
          if (entry.type === 'user') {
            return (
              <div key={entry.message.id} className="message-entry message-entry--user">
                <div className="message-bubble message-bubble--user">
                  <div className="message-label">You</div>
                  {entry.message.content}
                </div>
              </div>
            );
          }

          const msg = entry.message;
          const isActiveStream = msg.streamId === activeStreamId;

          return (
            <div key={msg.id} className="message-entry message-entry--agent">
              <div className="message-bubble message-bubble--agent">
                <div className="message-label">Agent</div>
                {msg.blocks.map((block, idx) => {
                  if (block.type === 'text') {
                    const isLastBlock = idx === msg.blocks.length - 1;
                    return (
                      <TextBlockView
                        key={block.id}
                        block={block}
                        isStreaming={isActiveStream && isLastBlock && msg.status === 'streaming'}
                      />
                    );
                  }
                  return <ToolCard key={block.id} block={block} />;
                })}
                {msg.status === 'interrupted' && (
                  <div className="message-interrupted" role="status">
                    Response interrupted after reconnect. The server stayed online but did not resume this stream. You can send another message.
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Scroll anchor */}
        <div id="chat-scroll-anchor" style={{ height: 1, overflow: 'hidden' }} />
      </div>
    </div>
  );
}
