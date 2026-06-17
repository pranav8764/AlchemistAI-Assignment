// ─────────────────────────────────────────────────────────────
// contextStore.ts
//
// Context snapshots organized by context_id with diff history
// and scrubber support.
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { ContextHistory, ContextSnapshot, JsonDiff } from '@/protocol/types';
import { computeJsonDiff } from '@/logic/jsonDiff';

interface ContextState {
  contextsById: Map<string, ContextHistory>;
  activeContextId: string | null;

  // Actions
  addSnapshot: (contextId: string, seq: number, data: Record<string, unknown>) => void;
  setActiveContext: (contextId: string | null) => void;
  scrubTo: (contextId: string, index: number) => void;
  reset: () => void;
}

export const useContextStore = create<ContextState>((set) => ({
  contextsById: new Map(),
  activeContextId: null,

  addSnapshot: (contextId: string, seq: number, data: Record<string, unknown>) => {
    set((state) => {
      const newMap = new Map(state.contextsById);
      const existing = newMap.get(contextId);

      let diffs: JsonDiff[] = [];
      if (existing && existing.snapshots.length > 0) {
        const lastSnapshot = existing.snapshots[existing.snapshots.length - 1];
        if (lastSnapshot) {
          diffs = computeJsonDiff(lastSnapshot.data, data);
        }
      }

      const snapshot: ContextSnapshot = {
        seq,
        data,
        diffFromPrevious: diffs,
        timestamp: Date.now(),
      };

      if (existing) {
        const updatedHistory: ContextHistory = {
          ...existing,
          snapshots: [...existing.snapshots, snapshot],
          currentIndex: existing.snapshots.length, // point to new snapshot
        };
        newMap.set(contextId, updatedHistory);
      } else {
        const newHistory: ContextHistory = {
          contextId,
          snapshots: [snapshot],
          currentIndex: 0,
        };
        newMap.set(contextId, newHistory);
      }

      return {
        contextsById: newMap,
        activeContextId: state.activeContextId ?? contextId,
      };
    });
  },

  setActiveContext: (contextId) => set({ activeContextId: contextId }),

  scrubTo: (contextId: string, index: number) => {
    set((state) => {
      const newMap = new Map(state.contextsById);
      const history = newMap.get(contextId);
      if (!history) return state;

      const clampedIndex = Math.max(0, Math.min(index, history.snapshots.length - 1));
      newMap.set(contextId, { ...history, currentIndex: clampedIndex });
      return { contextsById: newMap };
    });
  },

  reset: () =>
    set({
      contextsById: new Map(),
      activeContextId: null,
    }),
}));
