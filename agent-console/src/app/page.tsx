'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { createWebSocketManager } from '@/protocol/WebSocketManager';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Composer } from '@/components/chat/Composer';
import { TraceTimeline } from '@/components/timeline/TraceTimeline';
import { ContextInspector } from '@/components/context/ContextInspector';
import { ConnectionStatus } from '@/components/connection/ConnectionStatus';
import { DebugOverlay } from '@/components/debug/DebugOverlay';
import { useAgentStore } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4747/ws';

export default function Home() {
  const managerRef = useRef<ReturnType<typeof createWebSocketManager> | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const conversation = useAgentStore((s) => s.conversation);
  const activeStreamId = useAgentStore((s) => s.activeStreamId);
  const lastDispatchedSeq = useConnectionStore((s) => s.lastDispatchedSeq);
  const markCommitted = useConnectionStore((s) => s.markCommitted);

  // Initialize WebSocket connection on mount
  useEffect(() => {
    const manager = createWebSocketManager(WS_URL);
    managerRef.current = manager;
    manager.connect();

    return () => {
      manager.destroy();
    };
  }, []);

  // This effect runs only after React commits the render caused by dispatching
  // an ordered protocol event. RESUME must never advance beyond this watermark.
  useLayoutEffect(() => {
    if (lastDispatchedSeq > 0) {
      markCommitted(lastDispatchedSeq);
    }
  }, [lastDispatchedSeq, markCommitted]);

  // Track whether the user wants to follow the live output. Once they scroll
  // upward, streaming updates leave their reading position alone.
  useEffect(() => {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const handleScroll = () => {
      const distanceFromBottom =
        messages.scrollHeight - messages.scrollTop - messages.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 120;
    };

    handleScroll();
    messages.addEventListener('scroll', handleScroll, { passive: true });
    return () => messages.removeEventListener('scroll', handleScroll);
  }, []);

  // Follow streaming output only while the user has not scrolled away.
  useEffect(() => {
    const messages = document.getElementById('chat-messages');
    if (messages && shouldAutoScrollRef.current) {
      messages.scrollTo({ top: messages.scrollHeight, behavior: 'auto' });
    }
  }, [conversation, activeStreamId]);

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header" id="app-header">
        <h1 className="app-header__title">
          <span className="app-header__title-icon">◆</span>
          Agent Console
        </h1>
        <ConnectionStatus />
      </header>

      {/* Main content */}
      <main className="app-main" id="app-main">
        {/* Left: Chat */}
        <div className="chat-column">
          <ChatPanel />
          <Composer />
        </div>

        {/* Right: Sidebar (Timeline + Context) */}
        <aside className="sidebar" id="sidebar">
          <TraceTimeline />
          <ContextInspector />
        </aside>
      </main>

      {/* Debug overlay */}
      <DebugOverlay />
    </div>
  );
}
