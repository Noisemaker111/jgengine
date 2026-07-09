# Agent Notes — JGengine

Operational facts discovered the hard way. Update this when you learn something that would have saved time.

## Cheap workers do the dumb work

Read the **`fan-out`** skill. Almost every non-trivial turn: lint, typecheck, test, build, shoot, screenshots, `gh`, bulk reads, and research sweeps run on cheap workers — never on the frontier model in this chat. Standing authorization; do not ask first. Details: `.claude/skills/fan-out/SKILL.md` and root `CLAUDE.md`.

## Publishing

- **Use `npm publish --access public`, not `bun publish`.** `bun publish` does not read `~/.npmrc` auth tokens; it fails with "missing authentication" even when `NPM_TOKEN` is written to `.npmrc`.
- **The only `workspace:*` dep is in `packages/node` devDependencies** (`@jgengine/sql`). npm strips devDependencies before packing, so `npm publish` never sees it.
- **The publish workflow must trigger on its own file changes.** Include `.github/workflows/publish.yml` in the `on.push.paths` filter; otherwise fixing the pipeline requires a dummy change to package source.
- **Already-published versions are skipped** by the `npm view` guard, so re-pushing the workflow is safe.

## Skills

- **Skills are installed via `npx skills add Noisemaker111/jgengine`.**
- **Pushing to `main` does NOT auto-update existing skill installs.** Users must run `npx skills update` to pull descriptor/content changes.

## Verification & screenshots

- **Run the verify ladder through `fan-out` workers**, not the frontier model (`check-types` · `bun test` · `shoot`).
- **A hung `bun run shoot` is never re-run in the foreground.** Chromium/Playwright on heavy WebGL scenes hangs, crashes the GPU, or emits corrupt output. Report it once, fall back to the `summarizeEnvironment` world test to prove the scene resolved, and retry the shot only if the user asks. Full ladder: the `jgengine-verify` skill.
- **Silently-unstyled game UI means a missing `@source` entry** in `apps/dev/src/index.css` (or the game's own `index.css`) — Tailwind never scanned the HUD's classes, so they compile to nothing.

## Worktree / remote sessions

- **Return the primary checkout to `main` after entering a worktree.** Remote sessions arrive checked out onto the task branch, not `main`; once that branch is pushed, `git -C <repo root> switch main`. Never leave the primary parked on a branch with unpushed local-only commits — a reclaimed container takes them with it. (Full rule: root `CLAUDE.md`.)

## Environment

- **Lefthook is missing in this shell** but git commits still succeed; the warning is harmless.
