# Agent Console - Audit Task Tracker

## Automated Checks
- [x] Frontend production build passes
- [x] Backend TypeScript build passes
- [x] Unit tests pass (30 tests)
- [x] ESLint passes without warnings

## Chaos-Mode Retest - June 15, 2026
- [x] Send `hello` and observe the response after 3 seconds
- [x] Send `analyze market data` and verify both tool cards/results
- [x] Send `show database schema` and verify two context snapshots (~589 KB each)
- [x] Send `generate a long detailed document` and observe a mid-stream drop/reconnect
- [x] Inspect `http://localhost:4747/log`
- [x] Verify corrupt empty-challenge PING receives an exact empty PONG
- [x] Verify reconnect sends `RESUME` with the last processed sequence
- [ ] Zero backend protocol violations in chaos mode
- [ ] Long response continues to `STREAM_END` after reconnect
- [x] Detect a backend-abandoned stream after reconnect and unlock the composer
- [x] Track ordered, dispatched, and React-committed sequence watermarks separately
- [ ] Complete bidirectional highlighting for token text blocks and visually link tool call/result rows
- [ ] Add the mandatory 3-5 minute chaos-mode screen recording
- [ ] Add the three README screenshot artifacts

## Findings
- Chaos latency can delay delivery of a `TOOL_CALL` beyond the backend's five-second ACK timeout. The client now ACKs each unique call immediately on receipt, before sequence-gap processing, but it cannot acknowledge an event the backend has not delivered yet.
- The provided backend aborts the active script when a replacement WebSocket connects and only replays already-recorded events. After a mid-stream drop it emits no continuation and no `STREAM_END`, so the frontend remains in a streaming state. This cannot be made seamless by the client without a replay-complete/interrupted signal or backend generator resumption.
- `RESUME` now uses the React-committed watermark. The ordering buffer no longer claims its drained watermark is DOM-committed.
- The trace now records and filters `PONG` events, including corrupt empty challenges.
