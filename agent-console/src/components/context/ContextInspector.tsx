'use client';

import { useContextStore } from '@/store/contextStore';
import { JsonTree } from './JsonTree';

export function ContextInspector() {
  const contextsById = useContextStore((s) => s.contextsById);
  const activeContextId = useContextStore((s) => s.activeContextId);
  const setActiveContext = useContextStore((s) => s.setActiveContext);
  const scrubTo = useContextStore((s) => s.scrubTo);

  const contextIds = Array.from(contextsById.keys());
  const activeHistory = activeContextId ? contextsById.get(activeContextId) : undefined;

  const currentSnapshot = activeHistory?.snapshots[activeHistory.currentIndex];
  const totalSnapshots = activeHistory?.snapshots.length ?? 0;
  const currentIndex = activeHistory?.currentIndex ?? 0;

  return (
    <div className="sidebar__section sidebar__section--context" id="context-inspector">
      <div className="sidebar__section-header">
        <span>🔍 Context Inspector</span>
        {activeHistory && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {totalSnapshots} snapshot{totalSnapshots !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {contextIds.length === 0 && (
        <div className="context-empty">
          No context snapshots received yet
        </div>
      )}

      {/* Context tabs */}
      {contextIds.length > 0 && (
        <div className="context-tabs">
          {contextIds.map((id) => (
            <button
              key={id}
              className={`context-tab ${activeContextId === id ? 'context-tab--active' : ''}`}
              onClick={() => setActiveContext(id)}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      {/* Snapshot scrubber */}
      {activeHistory && totalSnapshots > 1 && activeContextId && (
        <div className="context-scrubber">
          <button
            className="context-scrubber__btn"
            onClick={() => scrubTo(activeContextId, currentIndex - 1)}
            disabled={currentIndex <= 0}
          >
            ◀
          </button>
          <span className="context-scrubber__label">
            {currentIndex + 1} / {totalSnapshots}
          </span>
          <input
            className="context-scrubber__slider"
            type="range"
            min={0}
            max={totalSnapshots - 1}
            value={currentIndex}
            onChange={(e) => scrubTo(activeContextId, parseInt(e.target.value, 10))}
          />
          <button
            className="context-scrubber__btn"
            onClick={() => scrubTo(activeContextId, currentIndex + 1)}
            disabled={currentIndex >= totalSnapshots - 1}
          >
            ▶
          </button>
        </div>
      )}

      {/* JSON tree with diffs */}
      {currentSnapshot && (
        <div
          className="sidebar__section-content"
          aria-label="Context snapshot"
          tabIndex={0}
        >
          {currentSnapshot.diffFromPrevious.length > 0 && (
            <div style={{
              padding: '4px 12px',
              fontSize: '10px',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
            }}>
              {currentSnapshot.diffFromPrevious.length} change{currentSnapshot.diffFromPrevious.length !== 1 ? 's' : ''} from previous
            </div>
          )}
          <JsonTree
            data={currentSnapshot.data}
            diffs={currentSnapshot.diffFromPrevious}
          />
        </div>
      )}
    </div>
  );
}
