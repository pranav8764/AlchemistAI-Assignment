// ─────────────────────────────────────────────────────────────
// ID generation utilities
// ─────────────────────────────────────────────────────────────

let counter = 0;

/** Generate a unique ID with an optional prefix. */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${++counter}`;
}
