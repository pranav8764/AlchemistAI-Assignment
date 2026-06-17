import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from '../store/connectionStore';

describe('connection sequence watermarks', () => {
  beforeEach(() => {
    useConnectionStore.getState().reset();
  });

  it('tracks ordered, dispatched, and committed progress independently', () => {
    const store = useConnectionStore.getState();

    store.updateSeqStats(5, 2, 1);
    store.markDispatched(4);
    store.markCommitted(3);

    const state = useConnectionStore.getState();
    expect(state.lastOrderedSeq).toBe(5);
    expect(state.lastDispatchedSeq).toBe(4);
    expect(state.lastCommittedSeq).toBe(3);
    expect(state.bufferedEvents).toBe(2);
    expect(state.duplicatesIgnored).toBe(1);
  });

  it('never moves dispatched or committed watermarks backward', () => {
    const store = useConnectionStore.getState();

    store.markDispatched(8);
    store.markDispatched(6);
    store.markCommitted(7);
    store.markCommitted(5);

    const state = useConnectionStore.getState();
    expect(state.lastDispatchedSeq).toBe(8);
    expect(state.lastCommittedSeq).toBe(7);
  });

  it('resets all per-turn sequence state', () => {
    const store = useConnectionStore.getState();
    store.updateSeqStats(9, 3, 2);
    store.markDispatched(9);
    store.markCommitted(8);
    store.setLastResumeSent(8);

    store.resetSequenceTracking();

    const state = useConnectionStore.getState();
    expect(state.lastOrderedSeq).toBe(0);
    expect(state.lastDispatchedSeq).toBe(0);
    expect(state.lastCommittedSeq).toBe(0);
    expect(state.bufferedEvents).toBe(0);
    expect(state.duplicatesIgnored).toBe(0);
    expect(state.lastResumeSent).toBeNull();
  });
});
