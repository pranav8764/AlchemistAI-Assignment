// ─────────────────────────────────────────────────────────────
// jsonDiff.ts
//
// Recursive JSON diff engine. Compares two arbitrary JSON values
// and produces an array of diffs with paths like:
//   "report.sections[2]"
//   "user.profile.name"
//
// For large payloads (500KB+), diffs are computed lazily on
// tree expansion, not on snapshot arrival.
// ─────────────────────────────────────────────────────────────

import type { JsonDiff } from '@/protocol/types';

/**
 * Compute a recursive diff between two JSON-like values.
 * Returns an array of JsonDiff entries with paths.
 */
export function computeJsonDiff(
  oldVal: unknown,
  newVal: unknown,
  basePath: string = ''
): JsonDiff[] {
  const diffs: JsonDiff[] = [];
  diffRecursive(oldVal, newVal, basePath, diffs);
  return diffs;
}

function diffRecursive(
  oldVal: unknown,
  newVal: unknown,
  path: string,
  diffs: JsonDiff[]
): void {
  // Same reference or strictly equal primitives
  if (oldVal === newVal) {
    return;
  }

  // Both null/undefined
  if (oldVal == null && newVal == null) {
    return;
  }

  // One is null/undefined, the other isn't
  if (oldVal == null) {
    diffs.push({ path: path || '(root)', type: 'added', newValue: newVal });
    return;
  }
  if (newVal == null) {
    diffs.push({ path: path || '(root)', type: 'removed', oldValue: oldVal });
    return;
  }

  const oldType = typeof oldVal;
  const newType = typeof newVal;

  // Different types → changed
  if (oldType !== newType) {
    diffs.push({ path: path || '(root)', type: 'changed', oldValue: oldVal, newValue: newVal });
    return;
  }

  // Primitives (string, number, boolean)
  if (oldType !== 'object') {
    if (oldVal !== newVal) {
      diffs.push({ path: path || '(root)', type: 'changed', oldValue: oldVal, newValue: newVal });
    }
    return;
  }

  // Arrays
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    const maxLen = Math.max(oldVal.length, newVal.length);
    for (let i = 0; i < maxLen; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= oldVal.length) {
        diffs.push({ path: itemPath, type: 'added', newValue: newVal[i] });
      } else if (i >= newVal.length) {
        diffs.push({ path: itemPath, type: 'removed', oldValue: oldVal[i] });
      } else {
        diffRecursive(oldVal[i], newVal[i], itemPath, diffs);
      }
    }
    return;
  }

  // One is array, other is object → changed
  if (Array.isArray(oldVal) !== Array.isArray(newVal)) {
    diffs.push({ path: path || '(root)', type: 'changed', oldValue: oldVal, newValue: newVal });
    return;
  }

  // Both are objects
  const oldObj = oldVal as Record<string, unknown>;
  const newObj = newVal as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const childPath = path ? `${path}.${key}` : key;
    const inOld = key in oldObj;
    const inNew = key in newObj;

    if (inOld && !inNew) {
      diffs.push({ path: childPath, type: 'removed', oldValue: oldObj[key] });
    } else if (!inOld && inNew) {
      diffs.push({ path: childPath, type: 'added', newValue: newObj[key] });
    } else {
      diffRecursive(oldObj[key], newObj[key], childPath, diffs);
    }
  }
}

/**
 * Build a set of paths that have diffs, for quick lookup
 * when rendering the JSON tree.
 */
export function buildDiffPathSet(diffs: JsonDiff[]): Map<string, JsonDiff['type']> {
  const pathMap = new Map<string, JsonDiff['type']>();
  for (const diff of diffs) {
    pathMap.set(diff.path, diff.type);
    // Also mark parent paths so the tree knows to show indicators
    const parts = diff.path.split(/[.[\]]+/).filter(Boolean);
    let parentPath = '';
    for (const part of parts) {
      parentPath = parentPath ? `${parentPath}.${part}` : part;
      if (!pathMap.has(parentPath)) {
        pathMap.set(parentPath, 'changed'); // parent contains changes
      }
    }
  }
  return pathMap;
}
