# Agent Notes — JGengine

Operational facts discovered the hard way. Update this when you learn something that would have saved time.

## Cheap workers do the dumb work

Read the **`fan-out`** skill. Almost every non-trivial turn: lint, typecheck, test, build, shoot, screenshots, GitHub ceremony, bulk reads, and research sweeps run on cheap workers — never on the frontier model in this chat. Standing authorization; do not ask first. Details: `.claude/skills/fan-out/SKILL.md` and root `CLAUDE.md`.

## Publishing

- **Use `npm publish --access public`, not `bun publish`.** `bun publish` does not read `~/.npmrc` auth tokens; it fails with "missing authentication" even when `NPM_TOKEN` is written to `.npmrc`.
- **The only `workspace:*` dep is in `packages/node` devDependencies** (`@jgengine/sql`). npm strips devDependencies before packing, so `npm publish` never sees it.
- **The publish workflow must trigger on its own file changes.** Include `.github/workflows/publish.yml` in the `on.push.paths` filter; otherwise fixing the pipeline requires a dummy change to package source.
- **Already-published versions are skipped** by the `npm view` guard, so re-pushing the workflow is safe.

## Skills

- **Human interface outside this monorepo: one sentence** — `Make a game that … with jgengine`. Not “run these CLI steps.” The CLI is for agents (and optional power users); create auto-installs skills when the agent scaffolds. From this source monorepo, build `packages/jgengine` first or force the published CLI with `npm exec --yes --package=jgengine@latest -- jgengine skills`; npm otherwise prefers the unbuilt local workspace bin on Windows.
- **Pushing to `main` does NOT auto-update existing skill installs.** Agents re-run `npx jgengine skills -p` (or `-g`) / `npx skills update` if needed.

## Verification & screenshots

- **Run the verify ladder through `fan-out` workers**, not the frontier model (`check-types` · `bun test` · `shoot`).
- **A hung `bun run shoot` is never re-run in the foreground.** Chromium/Playwright on heavy WebGL scenes hangs, crashes the GPU, or emits corrupt output. Report it once, fall back to the `summarizeEnvironment` world test to prove the scene resolved, and retry the shot only if the user asks. Full ladder: the `jgengine-verify` skill.
- **Silently-unstyled game UI means a missing `@source` entry** in `apps/dev/src/index.css` (or the game's own `index.css`) — Tailwind never scanned the HUD's classes, so they compile to nothing.

## Cloud sessions

- **Every session is an isolated cloud container on its own `claude/...` branch.** No worktrees. Push early — a reclaimed container takes unpushed commits with it.
- **Never commit on top of a squash-merged branch.** That is where the recurring merge conflicts came from. The session-start hook restarts a clean, already-merged branch from `origin/main` automatically; by hand: `git checkout main && git pull`, then start the next change on a fresh `claude/...` branch. Don't leave HEAD on a dead session branch that only matches main by reset.
- **Ship in one motion: push → PR → immediate squash-merge, then stop.** No CI subscriptions, no watching, no auto-merge babysitting; fall back to `enable_pr_auto_merge` only when required checks block the instant merge, and end the turn.
- **GitHub goes through the MCP tools** (`create_pull_request`, `merge_pull_request`, `enable_pr_auto_merge`, `add_issue_comment`) — there is no `gh` CLI in cloud containers.

## Environment

- **Lefthook is missing in this shell** but git commits still succeed; the warning is harmless.
