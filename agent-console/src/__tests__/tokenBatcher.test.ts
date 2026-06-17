import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenBatcher } from '../logic/tokenBatcher';
import type { TimelineEntry } from '../protocol/types';

describe('TokenBatcher', () => {
  let batcher: TokenBatcher;
  let flushedEntries: TimelineEntry[];

  beforeEach(() => {
    vi.useFakeTimers();
    flushedEntries = [];
    batcher = new TokenBatcher((entry) => {
      flushedEntries.push(entry);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not flush immediately and accumulates tokens', () => {
    batcher.addToken('stream-1', 1, 'Hello', 'chat-1');
    batcher.addToken('stream-1', 2, ' world', 'chat-1');
    
    expect(flushedEntries).toHaveLength(0);
  });

  it('flushes on timeout (250ms)', () => {
    batcher.addToken('stream-1', 1, 'Hello', 'chat-1');
    
    vi.advanceTimersByTime(249);
    expect(flushedEntries).toHaveLength(0);
    
    vi.advanceTimersByTime(2); // Passes 250ms
    expect(flushedEntries).toHaveLength(1);
    
    const entry = flushedEntries[0]!;
    expect(entry.type).toBe('TOKEN_BATCH');
    expect(entry.seq).toBe(1);
    expect(entry.chatBlockId).toBe('chat-1');
    expect(entry.detail).toEqual({
      tokenCount: 1,
      durationMs: expect.any(Number),
      streamId: 'stream-1',
      firstSeq: 1,
      lastSeq: 1,
      text: 'Hello',
    });
  });

  it('flushes when streamId changes', () => {
    batcher.addToken('stream-1', 1, 'Hello', 'chat-1');
    batcher.addToken('stream-2', 2, 'NewStream', 'chat-1');

    // Should have flushed stream-1 immediately
    expect(flushedEntries).toHaveLength(1);
    expect(flushedEntries[0]!.detail.streamId).toBe('stream-1');
    expect(flushedEntries[0]!.detail.text).toBe('Hello');

    // Advancing timers should now flush stream-2
    vi.advanceTimersByTime(250);
    expect(flushedEntries).toHaveLength(2);
    expect(flushedEntries[1]!.detail.streamId).toBe('stream-2');
    expect(flushedEntries[1]!.detail.text).toBe('NewStream');
  });

  it('flushes on non-token event request', () => {
    batcher.addToken('stream-1', 1, 'Hello', 'chat-1');
    batcher.flushOnNonToken();

    expect(flushedEntries).toHaveLength(1);
    expect(flushedEntries[0]!.detail.text).toBe('Hello');
  });

  it('flushes on explicit flush', () => {
    batcher.addToken('stream-1', 1, 'Hello', 'chat-1');
    batcher.addToken('stream-1', 2, ' World', 'chat-1');
    batcher.flush();

    expect(flushedEntries).toHaveLength(1);
    expect(flushedEntries[0]!.detail.text).toBe('Hello World');
    expect(flushedEntries[0]!.detail.tokenCount).toBe(2);
    expect(flushedEntries[0]!.detail.firstSeq).toBe(1);
    expect(flushedEntries[0]!.detail.lastSeq).toBe(2);
  });

  it('resets without flushing', () => {
    batcher.addToken('stream-1', 1, 'Hello', 'chat-1');
    batcher.reset();

    vi.advanceTimersByTime(300);
    expect(flushedEntries).toHaveLength(0);
  });
});
