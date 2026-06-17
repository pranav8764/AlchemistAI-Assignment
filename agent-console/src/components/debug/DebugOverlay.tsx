'use client';

import { useState } from 'react';
import { useConnectionStore } from '@/store/connectionStore';

export function DebugOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    status,
    lastOrderedSeq,
    lastDispatchedSeq,
    lastCommittedSeq,
    bufferedEvents,
    duplicatesIgnored,
    lastResumeSent,
    reconnectAttempts,
    serverMode,
  } = useConnectionStore();

  if (!isOpen) {
    return (
      <button
        className="debug-overlay__toggle"
        onClick={() => setIsOpen(true)}
        title="Show debug overlay"
        id="debug-toggle"
      >
        🔧
      </button>
    );
  }

  return (
    <div className="debug-overlay" id="debug-overlay">
      <div className="debug-overlay__title">
        <span>Protocol Debug</span>
        <button
          onClick={() => setIsOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
        >
          ✕
        </button>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Mode</span>
        <span className="debug-overlay__value">{serverMode}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Connection</span>
        <span className="debug-overlay__value">{status}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Last ordered seq</span>
        <span className="debug-overlay__value">{lastOrderedSeq}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Last dispatched seq</span>
        <span className="debug-overlay__value">{lastDispatchedSeq}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Last committed seq</span>
        <span className="debug-overlay__value">{lastCommittedSeq}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Buffered events</span>
        <span className="debug-overlay__value">{bufferedEvents}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Duplicates ignored</span>
        <span className="debug-overlay__value">{duplicatesIgnored}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Last RESUME sent</span>
        <span className="debug-overlay__value">{lastResumeSent ?? '—'}</span>
      </div>
      <div className="debug-overlay__row">
        <span className="debug-overlay__label">Reconnect attempts</span>
        <span className="debug-overlay__value">{reconnectAttempts}</span>
      </div>
    </div>
  );
}
