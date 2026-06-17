// ─────────────────────────────────────────────────────────────
// parseServerEvent.ts
//
// The ONLY file that takes `unknown` off the WebSocket wire
// and narrows it to a typed ServerEvent. All unsafe parsing
// lives here — no `any` leaks to the rest of the codebase.
// ─────────────────────────────────────────────────────────────

import type { ServerEvent } from './types';

const SERVER_EVENT_TYPES = new Set([
  'TOKEN',
  'TOOL_CALL',
  'TOOL_RESULT',
  'CONTEXT_SNAPSHOT',
  'PING',
  'STREAM_END',
  'ERROR',
] as const);

/**
 * Parse a raw WebSocket message string into a typed ServerEvent.
 * Returns null for malformed or unrecognized messages (logged, not thrown).
 */
export function parseServerEvent(raw: string): ServerEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[parseServerEvent] Invalid JSON:', raw.slice(0, 200));
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    console.warn('[parseServerEvent] Not an object:', parsed);
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj['type'] !== 'string' || !SERVER_EVENT_TYPES.has(obj['type'] as ServerEvent['type'])) {
    console.warn('[parseServerEvent] Unknown type:', obj['type']);
    return null;
  }

  if (typeof obj['seq'] !== 'number') {
    console.warn('[parseServerEvent] Missing or invalid seq:', obj['seq']);
    return null;
  }

  const type = obj['type'] as ServerEvent['type'];

  switch (type) {
    case 'TOKEN':
      if (typeof obj['text'] !== 'string' || typeof obj['stream_id'] !== 'string') {
        console.warn('[parseServerEvent] Invalid TOKEN fields');
        return null;
      }
      return {
        type: 'TOKEN',
        seq: obj['seq'] as number,
        text: obj['text'] as string,
        stream_id: obj['stream_id'] as string,
      };

    case 'TOOL_CALL':
      if (
        typeof obj['call_id'] !== 'string' ||
        typeof obj['tool_name'] !== 'string' ||
        typeof obj['args'] !== 'object' ||
        obj['args'] === null ||
        typeof obj['stream_id'] !== 'string'
      ) {
        console.warn('[parseServerEvent] Invalid TOOL_CALL fields');
        return null;
      }
      return {
        type: 'TOOL_CALL',
        seq: obj['seq'] as number,
        call_id: obj['call_id'] as string,
        tool_name: obj['tool_name'] as string,
        args: obj['args'] as Record<string, unknown>,
        stream_id: obj['stream_id'] as string,
      };

    case 'TOOL_RESULT':
      if (
        typeof obj['call_id'] !== 'string' ||
        typeof obj['result'] !== 'object' ||
        obj['result'] === null ||
        typeof obj['stream_id'] !== 'string'
      ) {
        console.warn('[parseServerEvent] Invalid TOOL_RESULT fields');
        return null;
      }
      return {
        type: 'TOOL_RESULT',
        seq: obj['seq'] as number,
        call_id: obj['call_id'] as string,
        result: obj['result'] as Record<string, unknown>,
        stream_id: obj['stream_id'] as string,
      };

    case 'CONTEXT_SNAPSHOT':
      if (
        typeof obj['context_id'] !== 'string' ||
        typeof obj['data'] !== 'object' ||
        obj['data'] === null
      ) {
        console.warn('[parseServerEvent] Invalid CONTEXT_SNAPSHOT fields');
        return null;
      }
      return {
        type: 'CONTEXT_SNAPSHOT',
        seq: obj['seq'] as number,
        context_id: obj['context_id'] as string,
        data: obj['data'] as Record<string, unknown>,
      };

    case 'PING':
      // challenge can be empty string (corrupt heartbeat in chaos mode)
      // but it must be a string type
      if (typeof obj['challenge'] !== 'string') {
        console.warn('[parseServerEvent] Invalid PING: challenge is not a string');
        return null;
      }
      return {
        type: 'PING',
        seq: obj['seq'] as number,
        challenge: obj['challenge'] as string,
      };

    case 'STREAM_END':
      if (typeof obj['stream_id'] !== 'string') {
        console.warn('[parseServerEvent] Invalid STREAM_END fields');
        return null;
      }
      return {
        type: 'STREAM_END',
        seq: obj['seq'] as number,
        stream_id: obj['stream_id'] as string,
      };

    case 'ERROR':
      if (typeof obj['code'] !== 'string' || typeof obj['message'] !== 'string') {
        console.warn('[parseServerEvent] Invalid ERROR fields');
        return null;
      }
      return {
        type: 'ERROR',
        seq: obj['seq'] as number,
        code: obj['code'] as string,
        message: obj['message'] as string,
      };

    default:
      return null;
  }
}
