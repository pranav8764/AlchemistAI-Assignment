// ─────────────────────────────────────────────────────────────
// connectionStore.ts
//
// Tracks WebSocket connection state machine.
// Components subscribe to this for connection status UI.
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { ConnectionStatus } from '@/protocol/types';

interface ConnectionState {
  status: ConnectionStatus;
  lastOrderedSeq: number;
  lastDispatchedSeq: number;
  lastCommittedSeq: number;
  bufferedEvents: number;
  duplicatesIgnored: number;
  lastResumeSent: number | null;
  reconnectAttempts: number;
  serverMode: 'normal' | 'chaos' | 'unknown';

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  updateSeqStats: (lastOrdered: number, buffered: number, duplicates: number) => void;
  markDispatched: (seq: number) => void;
  markCommitted: (seq: number) => void;
  resetSequenceTracking: () => void;
  setLastResumeSent: (seq: number) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setServerMode: (mode: 'normal' | 'chaos' | 'unknown') => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'idle',
  lastOrderedSeq: 0,
  lastDispatchedSeq: 0,
  lastCommittedSeq: 0,
  bufferedEvents: 0,
  duplicatesIgnored: 0,
  lastResumeSent: null,
  reconnectAttempts: 0,
  serverMode: 'unknown',

  setStatus: (status) => set({ status }),

  updateSeqStats: (lastOrdered, buffered, duplicates) =>
    set({
      lastOrderedSeq: lastOrdered,
      bufferedEvents: buffered,
      duplicatesIgnored: duplicates,
    }),

  markDispatched: (seq) =>
    set((state) => ({ lastDispatchedSeq: Math.max(state.lastDispatchedSeq, seq) })),

  markCommitted: (seq) =>
    set((state) => ({ lastCommittedSeq: Math.max(state.lastCommittedSeq, seq) })),

  resetSequenceTracking: () =>
    set({
      lastOrderedSeq: 0,
      lastDispatchedSeq: 0,
      lastCommittedSeq: 0,
      bufferedEvents: 0,
      duplicatesIgnored: 0,
      lastResumeSent: null,
    }),

  setLastResumeSent: (seq) => set({ lastResumeSent: seq }),

  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),

  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),

  setServerMode: (mode) => set({ serverMode: mode }),

  reset: () =>
    set({
      status: 'idle',
      lastOrderedSeq: 0,
      lastDispatchedSeq: 0,
      lastCommittedSeq: 0,
      bufferedEvents: 0,
      duplicatesIgnored: 0,
      lastResumeSent: null,
      reconnectAttempts: 0,
    }),
}));
