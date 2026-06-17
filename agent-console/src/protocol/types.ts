// ─────────────────────────────────────────────────────────────
// Protocol type definitions for the Agent Console client
//
// Strict discriminated unions — one type per message kind.
// No `any` types. The only escape hatch is parseServerEvent.ts.
// ─────────────────────────────────────────────────────────────

// ── Server → Client Messages ──────────────────────────────────

export interface TokenEvent {
  readonly type: 'TOKEN';
  readonly seq: number;
  readonly text: string;
  readonly stream_id: string;
}

export interface ToolCallEvent {
  readonly type: 'TOOL_CALL';
  readonly seq: number;
  readonly call_id: string;
  readonly tool_name: string;
  readonly args: Record<string, unknown>;
  readonly stream_id: string;
}

export interface ToolResultEvent {
  readonly type: 'TOOL_RESULT';
  readonly seq: number;
  readonly call_id: string;
  readonly result: Record<string, unknown>;
  readonly stream_id: string;
}

export interface ContextSnapshotEvent {
  readonly type: 'CONTEXT_SNAPSHOT';
  readonly seq: number;
  readonly context_id: string;
  readonly data: Record<string, unknown>;
}

export interface PingEvent {
  readonly type: 'PING';
  readonly seq: number;
  readonly challenge: string;
}

export interface StreamEndEvent {
  readonly type: 'STREAM_END';
  readonly seq: number;
  readonly stream_id: string;
}

export interface ErrorEvent {
  readonly type: 'ERROR';
  readonly seq: number;
  readonly code: string;
  readonly message: string;
}

export type ServerEvent =
  | TokenEvent
  | ToolCallEvent
  | ToolResultEvent
  | ContextSnapshotEvent
  | PingEvent
  | StreamEndEvent
  | ErrorEvent;

// ── Client → Server Messages ──────────────────────────────────

export interface UserMessage {
  readonly type: 'USER_MESSAGE';
  readonly content: string;
}

export interface PongMessage {
  readonly type: 'PONG';
  readonly echo: string;
}

export interface ResumeMessage {
  readonly type: 'RESUME';
  readonly last_seq: number;
}

export interface ToolAckMessage {
  readonly type: 'TOOL_ACK';
  readonly call_id: string;
}

export type ClientMessage =
  | UserMessage
  | PongMessage
  | ResumeMessage
  | ToolAckMessage;

// ── Connection State Machine ──────────────────────────────────

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'resuming'
  | 'failed';

// ── Chat Block Model ──────────────────────────────────────────

export interface TextBlock {
  readonly type: 'text';
  readonly id: string;
  content: string;
}

export interface ToolBlock {
  readonly type: 'tool';
  readonly id: string;
  readonly callId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: 'pending' | 'completed' | 'error';
}

export type ChatBlock = TextBlock | ToolBlock;

export interface AgentMessage {
  readonly id: string;
  readonly streamId: string;
  blocks: ChatBlock[];
  status: 'streaming' | 'complete' | 'interrupted';
}

export interface UserChatMessage {
  readonly id: string;
  readonly content: string;
  readonly timestamp: number;
}

export type ConversationEntry =
  | { readonly type: 'user'; readonly message: UserChatMessage }
  | { readonly type: 'agent'; readonly message: AgentMessage };

// ── Timeline Model ────────────────────────────────────────────

export type TimelineEventType =
  | 'TOKEN_BATCH'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'CONTEXT_SNAPSHOT'
  | 'PING'
  | 'PONG'
  | 'ERROR'
  | 'CONNECTION'
  | 'RESUME'
  | 'STREAM_END';

export interface TimelineEntry {
  readonly id: string;
  readonly type: TimelineEventType;
  readonly timestamp: number;
  readonly seq: number | null;
  readonly summary: string;
  readonly detail: Record<string, unknown>;
  readonly chatBlockId: string | null;
  readonly linkedCallId: string | null;
}

// ── Context Inspector Model ───────────────────────────────────

export interface JsonDiff {
  readonly path: string;
  readonly type: 'added' | 'removed' | 'changed' | 'unchanged';
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

export interface ContextSnapshot {
  readonly seq: number;
  readonly data: Record<string, unknown>;
  readonly diffFromPrevious: JsonDiff[];
  readonly timestamp: number;
}

export interface ContextHistory {
  readonly contextId: string;
  snapshots: ContextSnapshot[];
  currentIndex: number;
}
