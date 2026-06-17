// ─────────────────────────────────────────────────────────────
// timelineStore.ts
//
// Timeline events with token batching. Stores entries and
// bidirectional linking maps between timeline rows and chat blocks.
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { TimelineEntry, TimelineEventType } from '@/protocol/types';

interface TimelineState {
  entries: TimelineEntry[];
  highlightedTimelineId: string | null;
  highlightedChatBlockId: string | null;
  filters: Set<TimelineEventType>;
  searchQuery: string;

  // Bidirectional linking
  timelineIdByChatBlockId: Map<string, string>;
  chatBlockIdByTimelineId: Map<string, string>;

  // Actions
  addEntry: (entry: TimelineEntry) => void;
  setHighlightedTimeline: (id: string | null) => void;
  setHighlightedChatBlock: (id: string | null) => void;
  toggleFilter: (type: TimelineEventType) => void;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  entries: [],
  highlightedTimelineId: null,
  highlightedChatBlockId: null,
  filters: new Set<TimelineEventType>(),
  searchQuery: '',
  timelineIdByChatBlockId: new Map(),
  chatBlockIdByTimelineId: new Map(),

  addEntry: (entry: TimelineEntry) =>
    set((state) => {
      const newTimelineById = new Map(state.timelineIdByChatBlockId);
      const newChatById = new Map(state.chatBlockIdByTimelineId);

      if (entry.chatBlockId) {
        newTimelineById.set(entry.chatBlockId, entry.id);
        newChatById.set(entry.id, entry.chatBlockId);
      }

      return {
        entries: [...state.entries, entry],
        timelineIdByChatBlockId: newTimelineById,
        chatBlockIdByTimelineId: newChatById,
      };
    }),

  setHighlightedTimeline: (id) => set({ highlightedTimelineId: id }),
  setHighlightedChatBlock: (id) => set({ highlightedChatBlockId: id }),

  toggleFilter: (type) =>
    set((state) => {
      const newFilters = new Set(state.filters);
      if (newFilters.has(type)) {
        newFilters.delete(type);
      } else {
        newFilters.add(type);
      }
      return { filters: newFilters };
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  reset: () =>
    set({
      entries: [],
      highlightedTimelineId: null,
      highlightedChatBlockId: null,
      filters: new Set(),
      searchQuery: '',
      timelineIdByChatBlockId: new Map(),
      chatBlockIdByTimelineId: new Map(),
    }),
}));
