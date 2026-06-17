// ─────────────────────────────────────────────────────────────
// SequenceBuffer
//
// The heart of the protocol layer. Reorders out-of-order events
// and deduplicates replayed events after reconnection.
//
// Uses Map<number, ServerEvent> for O(1) lookup of pending events
// and Set<number> for O(1) deduplication of processed seqs.
// The while-drain loop processes events strictly in order.
// ─────────────────────────────────────────────────────────────

import type { ServerEvent } from './types';

export class SequenceBuffer {
  private pendingBySeq: Map<number, ServerEvent> = new Map();
  private processedSeqs: Set<number> = new Set();
  private _lastOrderedSeq: number = 0;
  private _duplicatesIgnored: number = 0;

  /**
   * Push a new event into the buffer. Returns an array of events
   * that are ready to be processed (in strict seq order).
   *
   * - Duplicates are silently dropped (counted for debug overlay).
   * - Out-of-order events are buffered until their predecessor arrives.
   * - The drain loop pulls consecutive events starting from lastOrderedSeq + 1.
   *
   * Ordering is not the same as a UI commit. The WebSocket manager records
   * dispatch separately, and React advances the committed watermark after paint.
   */
  push(event: ServerEvent): ServerEvent[] {
    const { seq } = event;

    // Duplicate: already processed or already pending
    if (this.processedSeqs.has(seq) || this.pendingBySeq.has(seq)) {
      this._duplicatesIgnored++;
      return [];
    }

    // Buffer the event
    this.pendingBySeq.set(seq, event);

    // Drain: process consecutive events in order
    const ready: ServerEvent[] = [];
    let nextSeq = this._lastOrderedSeq + 1;

    while (this.pendingBySeq.has(nextSeq)) {
      const nextEvent = this.pendingBySeq.get(nextSeq)!;
      this.pendingBySeq.delete(nextSeq);
      this.processedSeqs.add(nextSeq);
      ready.push(nextEvent);
      this._lastOrderedSeq = nextSeq;
      nextSeq++;
    }

    return ready;
  }

  /**
   * Reset the buffer. Called when a new USER_MESSAGE is sent,
   * because the server resets seq to 0 on each turn.
   */
  reset(): void {
    this.pendingBySeq.clear();
    this.processedSeqs.clear();
    this._lastOrderedSeq = 0;
    this._duplicatesIgnored = 0;
  }

  /** Highest contiguous seq released from the ordering buffer. */
  get lastOrderedSeq(): number {
    return this._lastOrderedSeq;
  }

  /** Number of duplicate events that were silently ignored. */
  get duplicatesIgnored(): number {
    return this._duplicatesIgnored;
  }

  /** Number of events currently buffered (waiting for predecessor). */
  get pendingCount(): number {
    return this.pendingBySeq.size;
  }
}
