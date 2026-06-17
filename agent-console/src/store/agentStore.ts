// ─────────────────────────────────────────────────────────────
// agentStore.ts
//
// Chat state: conversation entries (user messages + agent
// messages with block-based rendering model).
//
// Key design: TOOL_ACK is sent directly from processToolCall(),
// NOT from a useEffect. This guarantees timing < 2s.
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type {
  ConversationEntry,
  AgentMessage,
  TextBlock,
  ToolBlock,
  UserChatMessage,
} from '@/protocol/types';
import { generateId } from '@/logic/ids';

interface AgentState {
  conversation: ConversationEntry[];
  activeStreamId: string | null;

  // Buffered tool results that arrived before their TOOL_CALL
  // (race condition from replay ordering)
  pendingToolResults: Map<string, { result: Record<string, unknown>; seq: number }>;

  // Actions
  addUserMessage: (content: string) => string;
  ensureAgentMessage: (streamId: string) => void;
  appendToken: (streamId: string, text: string) => string | null;
  addToolCall: (
    streamId: string,
    callId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => string | null;
  updateToolResult: (callId: string, result: Record<string, unknown>) => void;
  bufferToolResult: (callId: string, result: Record<string, unknown>, seq: number) => void;
  endStream: (streamId: string) => void;
  interruptActiveStream: () => void;
  resetConversation: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  conversation: [],
  activeStreamId: null,
  pendingToolResults: new Map(),

  addUserMessage: (content: string): string => {
    const msg: UserChatMessage = {
      id: generateId('usr'),
      content,
      timestamp: Date.now(),
    };
    set((state) => ({
      conversation: [
        ...state.conversation,
        { type: 'user' as const, message: msg },
      ],
      activeStreamId: null,
    }));
    return msg.id;
  },

  ensureAgentMessage: (streamId: string) => {
    const state = get();
    // Check if we already have an agent message for this stream
    const existing = state.conversation.find(
      (e) => e.type === 'agent' && e.message.streamId === streamId
    );
    if (existing) return;

    const agentMsg: AgentMessage = {
      id: generateId('agent'),
      streamId,
      blocks: [],
      status: 'streaming',
    };
    set((state) => ({
      conversation: [
        ...state.conversation,
        { type: 'agent' as const, message: agentMsg },
      ],
      activeStreamId: streamId,
    }));
  },

  appendToken: (streamId: string, text: string): string | null => {
    let blockId: string | null = null;

    set((state) => {
      const newConversation = state.conversation.map((entry) => {
        if (entry.type !== 'agent' || entry.message.streamId !== streamId) {
          return entry;
        }

        const msg = entry.message;
        const blocks = [...msg.blocks];
        const lastBlock = blocks[blocks.length - 1];

        if (lastBlock && lastBlock.type === 'text') {
          // Append to existing text block
          const updatedBlock: TextBlock = {
            ...lastBlock,
            content: lastBlock.content + text,
          };
          blocks[blocks.length - 1] = updatedBlock;
          blockId = updatedBlock.id;
        } else {
          // Create new text block (after a tool block or at start)
          const newBlock: TextBlock = {
            type: 'text',
            id: generateId('txt'),
            content: text,
          };
          blocks.push(newBlock);
          blockId = newBlock.id;
        }

        return {
          ...entry,
          message: { ...msg, blocks },
        };
      });

      return { conversation: newConversation };
    });

    return blockId;
  },

  addToolCall: (
    streamId: string,
    callId: string,
    toolName: string,
    args: Record<string, unknown>
  ): string | null => {
    let blockId: string | null = null;

    // Check if we have a buffered result for this call_id
    const pendingResult = get().pendingToolResults.get(callId);

    set((state) => {
      const newPendingResults = new Map(state.pendingToolResults);
      if (pendingResult) {
        newPendingResults.delete(callId);
      }

      const newConversation = state.conversation.map((entry) => {
        if (entry.type !== 'agent' || entry.message.streamId !== streamId) {
          return entry;
        }

        const msg = entry.message;
        const blocks = [...msg.blocks];

        const toolBlock: ToolBlock = {
          type: 'tool',
          id: generateId('tool'),
          callId,
          toolName,
          args,
          result: pendingResult ? pendingResult.result : null,
          status: pendingResult ? 'completed' : 'pending',
        };
        blocks.push(toolBlock);
        blockId = toolBlock.id;

        return {
          ...entry,
          message: { ...msg, blocks },
        };
      });

      return { conversation: newConversation, pendingToolResults: newPendingResults };
    });

    return blockId;
  },

  updateToolResult: (callId: string, result: Record<string, unknown>) => {
    set((state) => {
      let found = false;

      const newConversation = state.conversation.map((entry) => {
        if (entry.type !== 'agent') return entry;

        const msg = entry.message;
        const blocks = msg.blocks.map((block) => {
          if (block.type === 'tool' && block.callId === callId) {
            found = true;
            return { ...block, result, status: 'completed' as const };
          }
          return block;
        });

        if (blocks === msg.blocks) return entry;
        return { ...entry, message: { ...msg, blocks } };
      });

      if (!found) {
        // Tool block doesn't exist yet (race condition from replay ordering).
        // Buffer the result — it will be applied when addToolCall creates the block.
        const newPending = new Map(state.pendingToolResults);
        newPending.set(callId, { result, seq: 0 });
        return { conversation: newConversation, pendingToolResults: newPending };
      }

      return { conversation: newConversation };
    });
  },

  bufferToolResult: (callId: string, result: Record<string, unknown>, seq: number) => {
    set((state) => {
      const newPending = new Map(state.pendingToolResults);
      newPending.set(callId, { result, seq });
      return { pendingToolResults: newPending };
    });
  },

  endStream: (streamId: string) => {
    set((state) => ({
      conversation: state.conversation.map((entry) => {
        if (entry.type !== 'agent' || entry.message.streamId !== streamId) {
          return entry;
        }
        return {
          ...entry,
          message: { ...entry.message, status: 'complete' as const },
        };
      }),
      activeStreamId: null,
    }));
  },

  interruptActiveStream: () => {
    set((state) => {
      const activeStreamId = state.activeStreamId;
      if (!activeStreamId) return state;

      return {
        conversation: state.conversation.map((entry) => {
          if (entry.type !== 'agent' || entry.message.streamId !== activeStreamId) {
            return entry;
          }

          return {
            ...entry,
            message: {
              ...entry.message,
              status: 'interrupted' as const,
              blocks: entry.message.blocks.map((block) =>
                block.type === 'tool' && block.status === 'pending'
                  ? { ...block, status: 'error' as const }
                  : block
              ),
            },
          };
        }),
        activeStreamId: null,
      };
    });
  },

  resetConversation: () => {
    set({
      conversation: [],
      activeStreamId: null,
      pendingToolResults: new Map(),
    });
  },
}));
