### Changed

- Monorepo tooling has one root command per tool: 26 instead of 102, with checks and generators behind `check` and `gen`.
- `decodePng` (`@jgengine/assets`) throws `decodePng: not a PNG file (bad signature)` on input that is not a PNG, instead of misreading it. It is now the repo's only PNG decoder; the scripts' own copy is gone.
- `bun run check [name...]` runs every CI check or the named ones (`--list`, `--sdk`), `bun run gen [target...]` regenerates every committed artifact, and `worktree`, `background`, `perf` and `games:capabilities` take a verb (`bun run worktree reap`, `bun run perf gate`). Folded in: `preflight --ship`, `release --await`, `shoot --at <commit>`, `ci:status --sweep`, `verify:fast --full`, `test`, `dev:site`, `dev:games`, `host:game`. Each check, generator and verb is one row in `scripts/run-stages.ts` or its dispatcher, and CI, `verify:fast`, `preflight` and the type shard all read that table.
- The games module-globals check is merged into `bun run check module-globals`, which now scans every game.
- `land` writes the commit subject from the branch's own commit, never the base's merge commit, and refuses a branch with neither a commit nor a `changes/<branch>.md`.

### Migrate

- `diagnose` from `jgengine` (the doctor's check list) is now `diagnoseProject`; the shell's frame `diagnose` keeps its name. Rename the import; arguments are unchanged.
