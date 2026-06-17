'use client';

import { useState, useMemo } from 'react';
import type { JsonDiff } from '@/protocol/types';
import { buildDiffPathSet } from '@/logic/jsonDiff';
import clsx from 'clsx';

// ── Types ─────────────────────────────────────────────────────

interface JsonTreeProps {
  data: unknown;
  diffs: JsonDiff[];
  path?: string;
  defaultExpanded?: boolean;
}

// ── JsonTreeNode ──────────────────────────────────────────────

function JsonTreeNode({
  keyName,
  value,
  path,
  diffPathMap,
  depth,
  defaultExpanded,
}: {
  keyName: string | null;
  value: unknown;
  path: string;
  diffPathMap: Map<string, JsonDiff['type']>;
  depth: number;
  defaultExpanded: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultExpanded && depth < 2);
  const diffType = diffPathMap.get(path);

  const diffClass = diffType
    ? `json-tree__diff--${diffType}`
    : undefined;

  // Primitives
  if (value === null || value === undefined || typeof value !== 'object') {
    return (
      <div className={clsx('json-tree__leaf', diffClass)} style={{ paddingLeft: depth * 16 }}>
        {keyName !== null && (
          <>
            <span className="json-tree__key">{keyName}</span>
            <span className="json-tree__colon">: </span>
          </>
        )}
        <PrimitiveValue value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  // Collapsed preview
  if (!isOpen) {
    return (
      <div className={clsx(diffClass)} style={{ paddingLeft: depth * 16 }}>
        <span className="json-tree__toggle" onClick={() => setIsOpen(true)}>▸ </span>
        {keyName !== null && (
          <>
            <span className="json-tree__key" onClick={() => setIsOpen(true)}>{keyName}</span>
            <span className="json-tree__colon">: </span>
          </>
        )}
        <span className="json-tree__bracket">{openBracket}</span>
        <span className="json-tree__count"> {entries.length} items </span>
        <span className="json-tree__bracket">{closeBracket}</span>
      </div>
    );
  }

  return (
    <div className={clsx(diffClass)}>
      <div style={{ paddingLeft: depth * 16 }}>
        <span className="json-tree__toggle" onClick={() => setIsOpen(false)}>▾ </span>
        {keyName !== null && (
          <>
            <span className="json-tree__key" onClick={() => setIsOpen(false)}>{keyName}</span>
            <span className="json-tree__colon">: </span>
          </>
        )}
        <span className="json-tree__bracket">{openBracket}</span>
      </div>
      {entries.map(([k, v]) => {
        const childPath = isArray
          ? `${path}[${k}]`
          : path
            ? `${path}.${k}`
            : k;
        return (
          <JsonTreeNode
            key={k}
            keyName={k}
            value={v}
            path={childPath}
            diffPathMap={diffPathMap}
            depth={depth + 1}
            defaultExpanded={defaultExpanded && depth < 1}
          />
        );
      })}
      <div style={{ paddingLeft: depth * 16 }}>
        <span className="json-tree__bracket">{closeBracket}</span>
      </div>
    </div>
  );
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="json-tree__value json-tree__value--null">null</span>;
  }
  if (typeof value === 'string') {
    const display = value.length > 100 ? value.slice(0, 100) + '…' : value;
    return <span className="json-tree__value json-tree__value--string">&quot;{display}&quot;</span>;
  }
  if (typeof value === 'number') {
    return <span className="json-tree__value json-tree__value--number">{String(value)}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="json-tree__value json-tree__value--boolean">{String(value)}</span>;
  }
  return <span className="json-tree__value">{String(value)}</span>;
}

// ── JsonTree (exported) ───────────────────────────────────────

export function JsonTree({ data, diffs, path = '', defaultExpanded = false }: JsonTreeProps) {
  const diffPathMap = useMemo(() => buildDiffPathSet(diffs), [diffs]);

  return (
    <div className="json-tree" id="json-tree">
      <JsonTreeNode
        keyName={null}
        value={data}
        path={path}
        diffPathMap={diffPathMap}
        depth={0}
        defaultExpanded={defaultExpanded}
      />
    </div>
  );
}
