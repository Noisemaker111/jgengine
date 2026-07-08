# JGengine Agent Guide

The primary engine-development repo: a genre-agnostic, pure-TypeScript game engine SDK plus its agent skills. Published packages live under `packages/*` (npm, AGPL-3.0-only); everything else is private. Repo map, package table, and website story: `README.md`.

## Rules that always apply

- **Work in a worktree.** The primary checkout stays on `main`; every session edits in its own worktree via `EnterWorktree`. Hooks enforce this and walk you through the flow: push + `gh pr create --fill` when the work is real, `gh pr merge --squash --delete-branch` yourself when it's genuinely done and clean (never over doubt or a red check), then `ExitWorktree`. After an agent merge, echo 🚀 in your reply — chat signal only, never on GitHub.
- **The user owns release timing.** Merging to `main` can trigger npm publish (`.github/workflows/publish.yml` publishes any `@jgengine/*` version not yet on npm, in dependency order). Never bump a package version to force a release unless asked.
- **Layering is one-directional.** `core` imports nothing. `ws` and `sql` import only core. `react` adds React; `convex` adds Convex + React; `node` adds Node builtins + `ws`; `shell` adds React + three.js and is the only package that renders. Never let a lower layer import a higher one, and never let core import React, Convex, three.js, the browser, or any game.
- **Extracting SDK primitives must not change how a game plays.** Extract the reusable core *behind* a user-facing feature; confirm before cutting anything a player sees.
- Run `git push` on its own line, never piped through a filter — a non-zero grep silently drops the push while looking like success.

## Stack

- bun workspaces: `packages/*` (the eight `@jgengine/*` packages, consumers import by path), `Games/*` (private, source-consumed, one directory per game, built via the `harvest-game` skill), `apps/*` (`dev` = Vite game runner + screenshot target with registry in `apps/dev/src/main.tsx`; `desktop` = Tauri wrapper; `web` = jgengine.com, standalone workspace outside the root scripts), `examples/*` (deployable host examples).
- The compiler is `tsgo` (`@typescript/native-preview`), not `tsc`. Strict TS everywhere; no `any` escapes in engine code.
- `skills/` is the spec — build games from `jgengine-api`, `jgengine-ui`, `jgengine-assets`, `jgengine-newgame`, not by copying other games. `check-types` also validates that the skills match the real API surface.
- This is the engine repo: fix engine gaps and doc errors directly here. The only issues filed from inside it are the `[FEATURE]` gap issues from the `harvest-game` skill.

## Verification

`bun run build` · `bun run check-types` · `bun test packages Games`. For anything scene- or HUD-shaped, follow the `jgengine-verify` skill: prove world content with `summarizeEnvironment` assertions in `bun test`; `bun run shoot <gameId> --mode ui|play` is a final human glance, never the inner loop, and a hung shot is never re-run in the foreground. Silently-unstyled game UI means a missing `@source` entry in `apps/dev/src/index.css`.

## Delegation

Load-bearing work (engine design, layering, API surface, gnarly types) runs on Opus — yourself or `Agent` with `model: opus`. Mechanical high-volume work (test runs, screenshots, bulk renames, doc sweeps) goes to Sonnet subagents. Only spawn subagents when the user asks or the task genuinely fans out.

## Style

- No code comments. Rename, extract, or encode in types instead.
- Dense files: catalogs and content tables stay in one file per domain, not scattered micro-modules.
