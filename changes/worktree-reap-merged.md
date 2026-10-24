### Added

- `bun run worktree:reap` removes every worktree whose branch has merged into `origin/beta` and whose tree has no uncommitted changes. Committed work survives because it lives in the branch, not the working copy. `lane:close` runs it after a PR merges and `agent:worktree` runs it before a new lane, so `.claude/worktrees` stops growing by a working copy per lane — 151 GB of them on this machine. A locked, detached, unmerged or dirty tree is kept and named with its reason.
