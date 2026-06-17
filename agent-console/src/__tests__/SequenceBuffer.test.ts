import { describe, it, expect, beforeEach } from 'vitest';
import { SequenceBuffer } from '../protocol/SequenceBuffer';
import type { ServerEvent, TokenEvent } from '../protocol/types';

/** Helper to create a TOKEN event with a given seq */
function makeToken(seq: number, text: string = `token-${seq}`): TokenEvent {
  return {
    type: 'TOKEN',
    seq,
    text,
    stream_id: 's_test',
  };
}

describe('SequenceBuffer', () => {
  let buffer: SequenceBuffer;

  beforeEach(() => {
    buffer = new SequenceBuffer();
  });

  it('processes events in order [1, 2, 3]', () => {
    const r1 = buffer.push(makeToken(1));
    const r2 = buffer.push(makeToken(2));
    const r3 = buffer.push(makeToken(3));

    expect(r1.map((e) => e.seq)).toEqual([1]);
    expect(r2.map((e) => e.seq)).toEqual([2]);
    expect(r3.map((e) => e.seq)).toEqual([3]);
    expect(buffer.lastOrderedSeq).toBe(3);
  });

  it('reorders reversed events [3, 2, 1]', () => {
    const r3 = buffer.push(makeToken(3));
    const r2 = buffer.push(makeToken(2));
    const r1 = buffer.push(makeToken(1));

    expect(r3).toEqual([]);
    expect(r2).toEqual([]);
    expect(r1.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(buffer.lastOrderedSeq).toBe(3);
  });

  it('deduplicates repeated seq [1, 1, 2]', () => {
    const r1a = buffer.push(makeToken(1, 'first'));
    const r1b = buffer.push(makeToken(1, 'duplicate'));
    const r2 = buffer.push(makeToken(2));

    expect(r1a.map((e) => e.seq)).toEqual([1]);
    expect(r1b).toEqual([]);
    expect(r2.map((e) => e.seq)).toEqual([2]);
    expect(buffer.duplicatesIgnored).toBe(1);
    expect(buffer.lastOrderedSeq).toBe(2);
  });

  it('buffers gap: [2] then [1]', () => {
    const r2 = buffer.push(makeToken(2));
    expect(r2).toEqual([]);
    expect(buffer.pendingCount).toBe(1);

    const r1 = buffer.push(makeToken(1));
    expect(r1.map((e) => e.seq)).toEqual([1, 2]);
    expect(buffer.pendingCount).toBe(0);
    expect(buffer.lastOrderedSeq).toBe(2);
  });

  it('handles fully reversed [10..1]', () => {
    const results: ServerEvent[] = [];
    for (let i = 10; i >= 1; i--) {
      results.push(...buffer.push(makeToken(i)));
    }

    expect(results.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(buffer.lastOrderedSeq).toBe(10);
  });

  it('ignores already-processed seqs on reconnect replay', () => {
    // Process 1, 2, 3 normally
    buffer.push(makeToken(1));
    buffer.push(makeToken(2));
    buffer.push(makeToken(3));
    expect(buffer.lastOrderedSeq).toBe(3);

    // Replay sends seq 2 and 3 again (overlap from RESUME)
    const r2 = buffer.push(makeToken(2, 'replayed'));
    const r3 = buffer.push(makeToken(3, 'replayed'));

    expect(r2).toEqual([]);
    expect(r3).toEqual([]);
    expect(buffer.duplicatesIgnored).toBe(2);

    // But new seq 4 works
    const r4 = buffer.push(makeToken(4));
    expect(r4.map((e) => e.seq)).toEqual([4]);
    expect(buffer.lastOrderedSeq).toBe(4);
  });

  it('handles empty buffer (no input)', () => {
    expect(buffer.lastOrderedSeq).toBe(0);
    expect(buffer.pendingCount).toBe(0);
    expect(buffer.duplicatesIgnored).toBe(0);
  });

  it('handles single element', () => {
    const r = buffer.push(makeToken(1));
    expect(r.map((e) => e.seq)).toEqual([1]);
    expect(buffer.lastOrderedSeq).toBe(1);
  });

  it('resets correctly for new turn', () => {
    buffer.push(makeToken(1));
    buffer.push(makeToken(2));
    buffer.push(makeToken(3));
    expect(buffer.lastOrderedSeq).toBe(3);

    buffer.reset();
    expect(buffer.lastOrderedSeq).toBe(0);
    expect(buffer.pendingCount).toBe(0);
    expect(buffer.duplicatesIgnored).toBe(0);

    // New turn starts at seq 1 again
    const r = buffer.push(makeToken(1));
    expect(r.map((e) => e.seq)).toEqual([1]);
    expect(buffer.lastOrderedSeq).toBe(1);
  });

  it('handles gap with multiple pending', () => {
    // Receive 3, 5, 4, 2, 1
    buffer.push(makeToken(3));
    buffer.push(makeToken(5));
    buffer.push(makeToken(4));
    expect(buffer.pendingCount).toBe(3);

    buffer.push(makeToken(2));
    expect(buffer.pendingCount).toBe(4); // Still waiting for 1

    const ready = buffer.push(makeToken(1));
    expect(ready.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(buffer.pendingCount).toBe(0);
    expect(buffer.lastOrderedSeq).toBe(5);
  });

  it('drops duplicate pending events', () => {
    buffer.push(makeToken(3)); // pending
    const r = buffer.push(makeToken(3)); // duplicate pending
    expect(r).toEqual([]);
    expect(buffer.duplicatesIgnored).toBe(1);
    expect(buffer.pendingCount).toBe(1);
  });
});
