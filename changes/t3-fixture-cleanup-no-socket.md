the browser fixture cleanup test holds its save response without a real socket, so it no longer times out on Linux CI

Closes #2738

Root cause: a held fetch against a real Bun.serve never settled after a forced stop on Linux, so the test hit its 20 s timeout; the cleanup code was fine

### Fixed

- the browser fixture cleanup test holds its save response without a real socket, so it no longer times out on Linux CI
