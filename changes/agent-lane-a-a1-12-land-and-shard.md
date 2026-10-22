### Changed

- `bun run land` (`scripts/land.ts`) lands a task branch in one command: it refuses `main` or a dirty tree, pushes, opens or reuses the PR into `beta`, runs `--verify`, watches checks, merges and prints `landed <url>`. Exit codes: 0 landed, 1 verify failed, 2 checks failed, 3 could not merge.
- The CI `test` job is split by path into four matrix shards (`scripts/test-shard.ts`), about 90 s each instead of 5m37s in one job; `ci` still aggregates every shard and no test file is dropped.
