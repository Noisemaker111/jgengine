Flaky tests fixed: folder deletes retry on Windows (Bun ignores rm's maxRetries), ws grace-window tests use hand-fired timers, the CDP deadline test waits for the server's message, and scrap-signal's audio test restores fetch instead of deleting it

Engine seam: packages/ws/src/hostRouter.ts, packages/ws/src/testFixtures.ts

### Changed

- Flaky tests fixed: folder deletes retry on Windows (Bun ignores rm's maxRetries), ws grace-window tests use hand-fired timers, the CDP deadline test waits for the server's message, and scrap-signal's audio test restores fetch instead of deleting it
