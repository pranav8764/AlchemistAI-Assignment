import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentStore } from '../store/agentStore';

describe('agent stream interruption', () => {
  beforeEach(() => {
    useAgentStore.getState().resetConversation();
  });

  it('marks the active response and pending tools as interrupted', () => {
    const store = useAgentStore.getState();
    store.ensureAgentMessage('stream-1');
    store.appendToken('stream-1', 'Partial response');
    store.addToolCall('stream-1', 'call-1', 'lookup', { query: 'test' });

    store.interruptActiveStream();

    const state = useAgentStore.getState();
    const entry = state.conversation.find((item) => item.type === 'agent');

    expect(state.activeStreamId).toBeNull();
    expect(entry?.type).toBe('agent');
    if (entry?.type !== 'agent') return;
    expect(entry.message.status).toBe('interrupted');
    expect(entry.message.blocks.find((block) => block.type === 'tool')?.status).toBe('error');
  });
});
