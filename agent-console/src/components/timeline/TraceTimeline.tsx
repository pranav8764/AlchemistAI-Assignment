'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTimelineStore } from '@/store/timelineStore';
import type { TimelineEventType, TimelineEntry } from '@/protocol/types';
import clsx from 'clsx';

const EVENT_TYPES: TimelineEventType[] = [
  'TOKEN_BATCH',
  'TOOL_CALL',
  'TOOL_RESULT',
  'CONTEXT_SNAPSHOT',
  'PING',
  'PONG',
  'ERROR',
  'CONNECTION',
  'RESUME',
  'STREAM_END',
];

const EVENT_LABELS: Record<TimelineEventType, string> = {
  TOKEN_BATCH: 'TOKEN',
  TOOL_CALL: 'TOOL_CALL',
  TOOL_RESULT: 'TOOL_RESULT',
  CONTEXT_SNAPSHOT: 'CONTEXT',
  PING: 'PING',
  PONG: 'PONG',
  ERROR: 'ERROR',
  CONNECTION: 'CONN',
  RESUME: 'RESUME',
  STREAM_END: 'END',
};

// ── TimelineRow ───────────────────────────────────────────────

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const [expanded, setExpanded] = useState(false);
  const highlightedTimelineId = useTimelineStore((s) => s.highlightedTimelineId);
  const setHighlightedChatBlock = useTimelineStore((s) => s.setHighlightedChatBlock);
  const chatBlockIdByTimelineId = useTimelineStore((s) => s.chatBlockIdByTimelineId);

  const isHighlighted = highlightedTimelineId === entry.id;

  const handleClick = useCallback(() => {
    // Toggle expand for token batches
    if (entry.type === 'TOKEN_BATCH') {
      setExpanded((prev) => !prev);
    }

    // Bidirectional: click timeline → highlight chat block
    const chatBlockId = chatBlockIdByTimelineId.get(entry.id);
    if (chatBlockId) {
      setHighlightedChatBlock(chatBlockId);
      const el = document.getElementById(`tool-card-${chatBlockId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedChatBlock(null), 1500);
    }
  }, [entry, chatBlockIdByTimelineId, setHighlightedChatBlock]);

  return (
    <div
      className={clsx(
        'timeline-row',
        isHighlighted && 'timeline-row--highlighted',
        entry.type === 'TOOL_RESULT' && 'timeline-linked-pair'
      )}
      id={`timeline-row-${entry.id}`}
      onClick={handleClick}
    >
      <span className={`timeline-row__badge timeline-row__badge--${entry.type}`}>
        {EVENT_LABELS[entry.type]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="timeline-row__summary">{entry.summary}</div>
        {expanded && entry.type === 'TOKEN_BATCH' && (
          <div className="timeline-row__expandable">
            {(entry.detail as Record<string, unknown>)['text'] as string}
          </div>
        )}
      </div>
      {entry.seq !== null && (
        <span className="timeline-row__seq">seq:{entry.seq}</span>
      )}
    </div>
  );
}

// ── TraceTimeline ─────────────────────────────────────────────

export function TraceTimeline() {
  const entries = useTimelineStore((s) => s.entries);
  const filters = useTimelineStore((s) => s.filters);
  const searchQuery = useTimelineStore((s) => s.searchQuery);
  const toggleFilter = useTimelineStore((s) => s.toggleFilter);
  const setSearchQuery = useTimelineStore((s) => s.setSearchQuery);

  const filteredEntries = useMemo(() => {
    let result = entries;

    // Apply type filters (if any are active, show only those types)
    if (filters.size > 0) {
      result = result.filter((e) => filters.has(e.type));
    }

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          JSON.stringify(e.detail).toLowerCase().includes(q)
      );
    }

    return result;
  }, [entries, filters, searchQuery]);

  return (
    <div className="sidebar__section sidebar__section--timeline" id="trace-timeline">
      <div className="sidebar__section-header">
        <span>📋 Trace Timeline</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {entries.length} events
        </span>
      </div>

      {/* Filters */}
      <div className="timeline-filters">
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            className={clsx(
              'timeline-filter-btn',
              filters.has(type) && 'timeline-filter-btn--active'
            )}
            onClick={() => toggleFilter(type)}
          >
            {EVENT_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="timeline-search">
        <input
          className="timeline-search__input"
          type="text"
          placeholder="Search events…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          id="timeline-search"
        />
      </div>

      {/* Event list */}
      <div
        className="sidebar__section-content"
        id="timeline-list"
        aria-label="Protocol event timeline"
        tabIndex={0}
      >
        {filteredEntries.length === 0 && (
          <div className="context-empty">No events yet</div>
        )}
        {filteredEntries.map((entry) => (
          <TimelineRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
