the worktree cleanup leaves a tree a running process holds whole and reports it in use, instead of half-deleting it and stopping, so the trees after it still go

### Fixed

- the worktree cleanup leaves a tree a running process holds whole and reports it in use, instead of half-deleting it and stopping, so the trees after it still go
- bun run worktree new runs the cleanup from the new tree's own code, not the main checkout's possibly older copy
