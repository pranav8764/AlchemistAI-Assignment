# Agent Console — Architectural Decisions

This document outlines the core technical decisions, trade-offs, and design patterns implemented in the Agent Console application.

---

## 1. Sequence-Based Ordering & Deduplication

In chaos mode, the server delivers events out-of-order and injects duplicates. To handle this, we implemented a custom `SequenceBuffer` class (`src/protocol/SequenceBuffer.ts`):

- **Data Structures**:
  - `pendingBySeq: Map<number, ServerEvent>`: An $O(1)$ lookup table storing out-of-order events waiting for their predecessors.
  - `processedSeqs: Set<number>`: An $O(1)$ set storing all sequence numbers that have been successfully processed and committed to state.
- **Algorithm**:
  - Every incoming server event is run through `push(event)`.
  - **Deduplication**: If the event's sequence number exists in `processedSeqs` or `pendingBySeq`, it is discarded immediately.
  - **Reordering**: The event is added to the `pendingBySeq` map. An iterative loop drains consecutive events starting from `lastOrderedSeq + 1`. This guarantees that the stores only process messages in strict sequential order.
  
*Trade-off*: We choose memory over complexity. Storing processed sequence numbers in a set grows linearly with the session duration. However, for typical agent sessions, this footprint is negligible (under a few kilobytes) and yields absolute correctness.

---

## 2. Preventing Layout Shift During Tool Calls

Interrupting a text stream mid-sentence with a tool call card can trigger jarring layout reflows. We prevented this through a combination of data representation and CSS styling:

- **State Model (Discriminated Blocks)**:
  - We modeled agent messages as a sequence of distinct blocks (`TextBlock` and `ToolBlock`) rather than a single markdown string.
  - When a `TOOL_CALL` arrives, the store appends a new `ToolBlock` to the current message's block list. The preceding text remains in its own `TextBlock`, ensuring its DOM contents are untouched.
- **CSS Layout Guarding**:
  - **CSS Containment**: We set `contain: layout paint;` on `.tool-card` elements. This informs the browser that the tool card's layout is completely self-contained, isolating layout recalculations to that node and avoiding global page reflows.
  - **Reserved Dimensions**: We set a `min-height: 80px` on `.tool-card` to reserve container space. This prevents sudden vertical layout pops before the tool arguments are parsed and painted.

---

## 3. Reconnection State Recovery

To ensure connection drops are invisible, we separated the networking layer from React's lifecycle:

- **Decoupled Architecture**:
  - The `WebSocketManager` handles low-level socket state (connecting, connected, reconnecting, resuming).
  - The UI consumes state from Zustand stores. The actual UI state represents the "consumed" state.
- **The Resume Flow**:
  - The client tracks three watermarks: `lastOrderedSeq`, `lastDispatchedSeq`, and `lastCommittedSeq`.
  - `lastOrderedSeq` means the gap-free ordering buffer released the event. `lastDispatchedSeq` means the event was applied to the Zustand stores. A root `useLayoutEffect` advances `lastCommittedSeq` only after React commits the resulting UI.
  - When the socket disconnects, the UI goes into a non-blocking `reconnecting` state.
  - On reconnect, the first frame sent is `RESUME` with `lastCommittedSeq`, including `0` when no event reached a committed render.
  - The server replays missed events. Since they pass through the `SequenceBuffer`, any messages that were already processed before the socket closed are automatically filtered out, and missing messages are stitched in.
  - **Tool Call Survival**: If a drop occurs mid-tool-call (after `TOOL_CALL` but before `TOOL_RESULT`), the UI displays a `waiting (reconnecting)` status indicator, resuming smoothly once the replayed `TOOL_RESULT` arrives.

---

## 4. Scaling to 50 Concurrent Streams (Operations Dashboard)

If this console were used as a multi-agent ops dashboard, the current setup would choke on DOM paints and main-thread updates. We would implement the following optimizations:

1. **Virtualization**:
   - Render only the streams visible in the viewport using virtualization (e.g. `@tanstack/react-virtual`).
2. **State Isolation**:
   - Split the global store into localized stores (one per agent stream). A stream update should only trigger a re-render of its specific card, not the entire dashboard.
3. **Throttled Render Loop**:
   - High-frequency token streaming (e.g. 50 streams sending 30 tokens/sec = 1500 updates/sec) would overwhelm React's scheduler.
   - We would buffer tokens in memory and flush updates in batches using `requestAnimationFrame` at 60fps, decoupling network events from UI renders.

---

## 5. Scaling to 100x Longer Responses (Full Document Generation)

For documents of 100k+ tokens, accumulating text strings in React state causes massive garbage collection pauses and DOM bloating:

1. **Chunk-Level Parsing**:
   - Render completed text chunks as static HTML. Do not re-parse the entire document on every new token.
2. **Markdown Virtualization**:
   - Paginate or virtualize long documents. Only parse and render pages that are active or in view.
3. **Optimized Append**:
   - Update the streaming section directly via a DOM `ref` (bypass React's virtual DOM reconciliation for the active streaming boundary) and synchronize it back to the store periodically.

---

## 6. Protocol Failure Modes & Edge Cases (Bonus)

During analysis of the protocol spec and server source code, we identified and handled two major edge cases:

### A. The `TOOL_ACK` Timeout Race Condition
- **The Problem**: The server expects a `TOOL_ACK` within 5 seconds of a `TOOL_CALL`. If not received, it sends `TOOL_RESULT` anyway. If network latency is high or a disconnection occurs right after `TOOL_CALL`, the server might send `TOOL_RESULT` before the client re-establishes connection and receives `TOOL_CALL`. This results in the client receiving a `TOOL_RESULT` for a `call_id` it has never heard of.
- **Our Solution**: In `agentStore.ts`, we implemented a `pendingToolResults` Map. If a `TOOL_RESULT` arrives and its corresponding `TOOL_CALL` block does not exist yet, we buffer the result in the map. When the replayed `TOOL_CALL` eventually arrives and is processed, the store checks the buffer, applies the result, and sets the tool card status to `completed` instantly.

### B. Sequence Number Reset Per Turn
- **The Problem**: The server resets sequence numbers to `0` and clears its history on every new `USER_MESSAGE`. If the client doesn't reset its tracking, it will expect sequence numbers starting from the previous turn's max, leading to a sequence gap lock where no new events are processed.
- **Our Solution**: Whenever a `USER_MESSAGE` is sent, we synchronously reset the `SequenceBuffer` and all three client watermarks to `0`, aligning the client with the server's new sequence stream.

### C. Mock Server Recovery Limitation (Fixed)
- **The Problem**: The supplied mock server originally aborted its generation script when the WebSocket disconnected. A client reconnecting would only receive a replay of history up to the drop, and the stream would never finish.
- **Our Solution**: We modified `agent-server/src/server.ts` to decouple script execution from the socket lifecycle. The generation loop now pauses (`await this.delay(...)`) if there is no active WebSocket, preserving the agent's state. We also added a 5-minute cleanup timeout (`disconnectTimeoutHandle`) to abort truly abandoned sessions.

### D. TOOL_ACK Timeout Starts Before Guaranteed Delivery
- Chaos reordering can retain a `TOOL_CALL` in its internal buffer. The server then starts its five-second ACK timer even though the client has not received the call, making a violation unavoidable.
- The server should treat `TOOL_CALL` as a control-plane event that cannot remain buffered, or start the ACK deadline only after the specific frame is actually written to the socket. The client ACKs each unique call immediately on raw receipt, before sequence-gap processing.

### E. Chaos Reorder Buffer Deadlock (`STREAM_END`)
- **The Problem**: The `ChaosEngine` buffers messages internally to simulate out-of-order delivery. Since `STREAM_END` is the final message of a script, if the engine decided to buffer it, it would remain trapped forever because no subsequent messages would arrive to trigger a flush. The client UI would permanently display "Agent is responding..."
- **Our Solution**: We modified the backend's script runner to explicitly call `chaosEngine.flush()` *after* dispatching the `STREAM_END` message. This ensures the final message is unbuffered and transmitted, successfully unlocking the client UI.

---

## 7. Trace Timeline & UI Optimizations

- **Token Batching**: To prevent visible jank during 30+ tokens/sec streaming, we implemented `TokenBatcher.ts`. It buffers incoming tokens and only flushes them to the Trace Timeline as a single aggregated `TOKEN_BATCH` row every 250ms (or when a non-token event occurs).
- **Tool Result Visual Linking**: `TOOL_RESULT` rows in the timeline conditionally apply a `timeline-linked-pair` CSS class to visually indent and connect them to their initiating `TOOL_CALL` without needing massive DOM nesting.
- **Lazy DOM Expansion**: To support 500KB+ Context Snapshot JSON payloads during chaos mode, the `JsonTree` applies lazy expansion, only evaluating and mounting child nodes when the user manually clicks the expansion toggle.
