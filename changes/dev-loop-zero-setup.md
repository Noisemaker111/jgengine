### Changed

- Monorepo tests, type-checks and `bun run gen` resolve `@jgengine/*` to package source through the `paths` in `tsconfig.base.json` (`bun run gen:source-paths` keeps every workspace tsconfig in sync), so a fresh checkout or worktree is testable with no build. Published packages are unchanged: `exports` still point at `dist`, and the built output is byte-identical.
- The export manifest is computed from the files each package's build emits, not from `dist` on disk, so it can no longer drift with a stale or partial build. `bun run ship:preflight` now fails with the fix (`bun run gen`) when any generated artifact is stale.
- `bun run agent:worktree -- <name>` produces a clean, ready worktree locally and in cloud sessions: it links dependencies, `Games` and the dev runner's ignored assets from the main checkout instead of installing and building. `agent:bootstrap` only installs; pass `--build` to also build dist.
