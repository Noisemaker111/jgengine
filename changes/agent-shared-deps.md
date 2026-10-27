on Windows a new worktree shares the main checkout's installed packages instead of installing 713 of its own, so it is ready in about 10s instead of 30s to 2 minutes

### Fixed

- on Windows a new worktree shares the main checkout's installed packages instead of installing 713 of its own, so it is ready in about 10s instead of 30s to 2 minutes
- a worktree whose bun.lock moved on gets its own install instead of writing into the shared one
