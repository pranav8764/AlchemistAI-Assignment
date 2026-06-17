import { describe, it, expect } from 'vitest';
import { computeJsonDiff } from '../logic/jsonDiff';

describe('computeJsonDiff', () => {
  it('detects added keys', () => {
    const diffs = computeJsonDiff({ a: 1 }, { a: 1, b: 2 });
    expect(diffs).toEqual([
      { path: 'b', type: 'added', newValue: 2 },
    ]);
  });

  it('detects removed keys', () => {
    const diffs = computeJsonDiff({ a: 1, b: 2 }, { a: 1 });
    expect(diffs).toEqual([
      { path: 'b', type: 'removed', oldValue: 2 },
    ]);
  });

  it('detects changed values', () => {
    const diffs = computeJsonDiff({ a: 1 }, { a: 2 });
    expect(diffs).toEqual([
      { path: 'a', type: 'changed', oldValue: 1, newValue: 2 },
    ]);
  });

  it('handles nested objects', () => {
    const old = { user: { name: 'Alice', age: 30 } };
    const next = { user: { name: 'Bob', age: 30 } };
    const diffs = computeJsonDiff(old, next);
    expect(diffs).toEqual([
      { path: 'user.name', type: 'changed', oldValue: 'Alice', newValue: 'Bob' },
    ]);
  });

  it('handles array additions', () => {
    const diffs = computeJsonDiff({ items: [1, 2] }, { items: [1, 2, 3] });
    expect(diffs).toEqual([
      { path: 'items[2]', type: 'added', newValue: 3 },
    ]);
  });

  it('handles array removals', () => {
    const diffs = computeJsonDiff({ items: [1, 2, 3] }, { items: [1, 2] });
    expect(diffs).toEqual([
      { path: 'items[2]', type: 'removed', oldValue: 3 },
    ]);
  });

  it('handles array element changes', () => {
    const diffs = computeJsonDiff({ items: [1, 2, 3] }, { items: [1, 99, 3] });
    expect(diffs).toEqual([
      { path: 'items[1]', type: 'changed', oldValue: 2, newValue: 99 },
    ]);
  });

  it('returns empty for identical objects', () => {
    const obj = { a: 1, b: { c: [1, 2, 3] } };
    const diffs = computeJsonDiff(obj, { ...obj, b: { c: [1, 2, 3] } });
    expect(diffs).toEqual([]);
  });

  it('handles empty objects', () => {
    expect(computeJsonDiff({}, {})).toEqual([]);
    const diffs = computeJsonDiff({}, { a: 1 });
    expect(diffs).toEqual([{ path: 'a', type: 'added', newValue: 1 }]);
  });

  it('handles type changes', () => {
    const diffs = computeJsonDiff({ a: 'string' }, { a: 42 });
    expect(diffs).toEqual([
      { path: 'a', type: 'changed', oldValue: 'string', newValue: 42 },
    ]);
  });

  it('handles null vs object', () => {
    const diffs = computeJsonDiff({ a: null }, { a: { b: 1 } });
    expect(diffs).toEqual([
      { path: 'a', type: 'added', newValue: { b: 1 } },
    ]);
  });

  it('handles deeply nested changes', () => {
    const old = { l1: { l2: { l3: { value: 'old' } } } };
    const next = { l1: { l2: { l3: { value: 'new' } } } };
    const diffs = computeJsonDiff(old, next);
    expect(diffs).toEqual([
      { path: 'l1.l2.l3.value', type: 'changed', oldValue: 'old', newValue: 'new' },
    ]);
  });

  it('handles mixed additions, removals, and changes', () => {
    const old = { keep: 1, remove: 2, change: 'old' };
    const next = { keep: 1, add: 3, change: 'new' };
    const diffs = computeJsonDiff(old, next);

    const types = new Map(diffs.map((d) => [d.path, d.type]));
    expect(types.get('remove')).toBe('removed');
    expect(types.get('add')).toBe('added');
    expect(types.get('change')).toBe('changed');
    expect(types.has('keep')).toBe(false); // unchanged = no entry
  });
});
