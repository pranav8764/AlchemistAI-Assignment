'use client';

import { useState, useRef, useCallback } from 'react';
import { getWebSocketManager } from '@/protocol/WebSocketManager';
import { useConnectionStore } from '@/store/connectionStore';
import { useAgentStore } from '@/store/agentStore';

export function Composer() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const status = useConnectionStore((s) => s.status);
  const activeStreamId = useAgentStore((s) => s.activeStreamId);

  const isConnected = status === 'connected';
  const isStreaming = activeStreamId !== null;
  const canSend = isConnected && !isStreaming && input.trim().length > 0;

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const manager = getWebSocketManager();
    if (!manager) return;

    manager.sendUserMessage(input.trim());
    setInput('');
    inputRef.current?.focus();
  }, [canSend, input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  let placeholder = 'Type a message…';
  if (!isConnected) placeholder = 'Waiting for connection…';
  if (isStreaming) placeholder = 'Agent is responding…';

  return (
    <div className="composer" id="composer">
      <input
        ref={inputRef}
        className="composer__input"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={!isConnected || isStreaming}
        id="composer-input"
        autoComplete="off"
      />
      <button
        className="composer__send"
        onClick={handleSend}
        disabled={!canSend}
        id="composer-send"
      >
        Send
      </button>
    </div>
  );
}
