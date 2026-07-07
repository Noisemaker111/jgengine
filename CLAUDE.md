# JGengine Agent Guide

This is the primary engine-development repo: a genre-agnostic, pure-TypeScript game engine SDK plus its agent skills. Published packages live under `packages/*` (npm, AGPL-3.0-only); everything else is private.

## Workflow

- **The flow is always `main → worktree branch → PR`, for every session — cloud and local alike.** The primary checkout stays on `main`; work happens in an isolated worktree (`EnterWorktree`, which branches into `.claude/worktrees/`), never by raw-editing files in the primary checkout. Two hooks in `.claude/settings.json` enforce this so it can't drift: `session-start` orients you and tells you to enter a worktree first, and `guard-worktree` (PreToolUse on Edit/Write/NotebookEdit) hard-blocks edits in the primary checkout until you're in a worktree — only `.claude/` config stays editable so you're never locked out. When you're done and the branch is merged, return the primary checkout to `main` (`git switch main`) rather than leaving it parked on a stale branch.
- Every unit of work ships as a **normal (non-draft) PR** — no draft ceremony. At the **start** of a task, branch off `main` and open the PR titled for what we're about to do (`gh pr create --fill`), then push commits into it as you go — even when the work is done entirely locally. Don't wait until the end to think about a PR.
- When the task is **complete**, the **agent** ships it — never ask the user to merge. Run `bun .claude/scripts/ship-pr.mjs`: it pushes, prepends 🚀 to the PR title (so an agent-merged PR is spottable right next to its number in the PR list), squash-merges, and deletes the branch. Then return the primary checkout to `main` and `ExitWorktree` (remove) to clean up. Only skip the merge if the work is genuinely unfinished or you were told to hold.
- The **user** owns publish/version timing, not merging — merging to `main` may trigger the publish workflow, so never bump a package version to force a release unless asked. You don't gate on CI mid-task; if you spot a red check before shipping, fix it, don't merge over it.
- Never pipe `git push` through `grep` (or any filter): a non-zero grep silently short-circuits the `&&` chain and drops the push while looking like success. Push on its own line, then confirm the remote SHA moved before deploying or handing off.
- When extracting primitives into the SDK, preserve the playable loop: don't delete a user-facing feature (training, city rendering, a menu path, a combat lane) to make a primitive clean. Extract the reusable core *behind* the feature and leave the game playing the same — confirm before cutting anything a player sees.

## Stack

- Package manager: bun (workspaces: `packages/*`, `Games/*`, `apps/*`, `examples/*`).
- Each published package builds with `tsgo -p tsconfig.build.json && bun ../../scripts/fix-extensions.ts dist`; root `bun run build` runs them in dependency order (core → ws → sql → react → convex → node → shell → assets). The compiler is `tsgo` (`@typescript/native-preview`), not `tsc`.
- TypeScript strict everywhere; `check-types` is `tsgo --noEmit` per package, fanned out by root `bun run check-types` (which also runs `check-artifacts` — no compiled `.js`/`.d.ts` may sit in `packages/*/src` — and `check-skills` — every `@jgengine/*` import path named in the `jgengine-api` skill must resolve, and every public `core` domain must be documented; keeps the skill from drifting off the API surface).

## Layering

`core` imports nothing. `ws` and `sql` import only core. `react` adds React. `convex` adds Convex + React. `node` adds Node builtins + `ws`. `shell` adds React + three.js (the only package that renders: GamePlayerShell, GameUiPreview, orbit camera, demo game). Never let a lower layer import a higher one, and never let core import React, Convex, three.js, the browser, or any game.

## Layout

- `packages/{core,ws,sql,react,convex,node,shell,assets}` — the eight published `@jgengine/*` packages. Exports map to `dist/*`; consumers import by path (`@jgengine/core/runtime/gameRuntime`). `assets` is a self-generating, license-verified index of CC0 3D models (ships the typed index + pull CLI, not the GLB bytes).
- `Games/` — the only place games live, one directory per game (`@games/<name>`, private, source-consumed via `./src` exports, no build). Any game work anywhere in the repo follows `Games/CLAUDE.md`: engine gaps go straight into `Games/TODO.md` as raw problems, committed and filed as one `[FEATURE]` issue at session end.
- `apps/dev` — the Vite game runner and screenshot target. Loads a game by `?game=<id>&mode=play|ui`; `mode=ui` mounts `GameUiPreview` over a staged GameContext. Registry in `apps/dev/src/main.tsx`. Vite aliases + tsconfig paths resolve `@jgengine/*` to sibling `src/`, so no build needed to run it.
- `apps/desktop` — Tauri v2 wrapper around the same shell (same aliases, port 1420).
- `apps/web` — [jgengine.com](https://jgengine.com): TanStack Start (SSR) marketing site, deployed to Vercel via Nitro (`nitro/vite`) on every push to `main`. Skill pages render `skills/*/SKILL.md` (bundled via Vite `?raw` in `src/content/skills.ts`), so a skills/engine change on `main` redeploys the site. It hands agents one line — `npx skills add Noisemaker111/jgengine` — plus per-skill "grab this when…" guidance (`src/lib/site.ts`); it does not serve `llms.txt` or raw skill dumps. Standalone workspace — no `@jgengine/*` deps, its own Vite 8; not part of root `build`/`check-types`/`test` or the publish pipeline.
- `examples/express-host` — deployable Node host (`@jgengine/node` + `@jgengine/sql` + express; Dockerfile + fly.toml). `examples/next-host` — Next.js client + REST reads. `examples/convex-host` — the Convex functions `createConvexBackend` talks to (needs `bunx convex dev` for `_generated/`, so it has no check-types).
- `skills/` — the spec. `jgengine-api` (engine surface + definition of done), `jgengine-ui` (HUD quality bar), `jgengine-assets`, `jgengine-newgame` (master blueprint + phased build workflow for a new game). Build games from the skills, not by copying other games.
- This is the engine repo: fix engine gaps and doc errors directly here — the only issues filed from inside it are the `[FEATURE]` gap issues mandated by `Games/CLAUDE.md`. Otherwise issue-filing ([github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues)) is the path for external consumers building on the published SDK.

## Verification

- `bun run build` — all eight packages compile to dist.
- `bun run check-types` — every workspace package with the script.
- `bun test packages Games` — engine + game tests.
- After changing any game UI/HUD: `bun run shoot <gameId> --mode ui` writes a PNG to `shots/` — open and look at it; type-green says nothing about whether the HUD renders. `--mode play` screenshots the full shell. Game HUD Tailwind classes only generate because `apps/dev/src/index.css` has `@source` entries for `Games`, `packages/react`, `packages/shell` — silently-unstyled UI means a missing `@source`.
- Verify *scene content* browserlessly: `summarizeEnvironment` (`@jgengine/core/world/environmentSummary`) resolves an `environment()` world through the same core world-gen the renderer runs, so a `bun test` assertion catches empty/miscounted/flat-terrain scenes with no GPU. `bun run shoot` proves *look* only — it's a final human glance, never the inner verification loop. Once a shoot/Chromium screenshot hangs, do **not** re-run it in the foreground; fall back to the world test and only retry the shot if asked. Full playbook: the `jgengine-verify` skill.

## Publishing

Automated via `.github/workflows/publish.yml`: every push to `main` that changes `packages/*/package.json`, `packages/*/src/**`, or the workflow itself triggers build → check-types → test, then publishes each `@jgengine/*` package whose version is not yet on npm, in dependency order (core → ws → sql → react → convex → node → shell → assets), using `npm publish --access public`. Auth is via the `NPM_TOKEN` repository secret. Already-published versions are skipped so non-release pushes no-op.

## Delegation

- Do the load-bearing work on Opus — either yourself or via Opus subagents (`Agent` with `model: opus`): engine design, layering decisions, API surface changes, gnarly type work, anything where a wrong call costs a rewrite.
- Push the boring, high-volume, or mechanical work to Sonnet subagents (`Agent` with `model: sonnet`): running lint/`check-types`/`bun test` and reporting failures, browser/screenshot playtesting (`bun run shoot`, driving the dev app), bulk renames, doc sweeps, log triage. Cheaper and faster, and it keeps the main context clean.
- Only spawn subagents when the user asks or the task genuinely fans out; a single-file edit stays inline. Match the model to the stakes, not the size.

## Style

- No code comments. Rename, extract, or encode in types instead.
- Dense files: catalogs and content tables stay in one file per domain, not scattered micro-modules.
- Strict TS; no `any` escapes in engine code.
- License is AGPL-3.0-only on every published package.
