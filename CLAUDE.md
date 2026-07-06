# JGengine Agent Guide

This is the primary engine-development repo: a genre-agnostic, pure-TypeScript game engine SDK plus its agent skills. Published packages live under `packages/*` (npm, AGPL-3.0-only); everything else is private.

## Stack

- Package manager: bun (workspaces: `packages/*`, `packages/games/*`, `apps/*`, `examples/*`).
- Each published package builds with `tsgo -p tsconfig.build.json && bun ../../scripts/fix-extensions.ts dist`; root `bun run build` runs them in dependency order (core → ws → sql → react → convex → node → shell → assets). The compiler is `tsgo` (`@typescript/native-preview`), not `tsc`.
- TypeScript strict everywhere; `check-types` is `tsgo --noEmit` per package, fanned out by root `bun run check-types` (which also runs `check-artifacts` — no compiled `.js`/`.d.ts` may sit in `packages/*/src`).

## Layering

`core` imports nothing. `ws` and `sql` import only core. `react` adds React. `convex` adds Convex + React. `node` adds Node builtins + `ws`. `shell` adds React + three.js (the only package that renders: GamePlayerShell, GameUiPreview, orbit camera, demo game). Never let a lower layer import a higher one, and never let core import React, Convex, three.js, the browser, or any game.

## Layout

- `packages/{core,ws,sql,react,convex,node,shell,assets}` — the eight published `@jgengine/*` packages. Exports map to `dist/*`; consumers import by path (`@jgengine/core/runtime/gameRuntime`). `assets` is a self-generating, license-verified index of CC0 3D models (ships the typed index + pull CLI, not the GLB bytes).
- `packages/games/*` — example games (`@dogfood/<name>`, private, source-consumed via `./src` exports, no build). Build a new game from the skills in `skills/`, not by copying one of these.
- `apps/dev` — the Vite game runner and screenshot target. Loads a game by `?game=<id>&mode=play|ui`; `mode=ui` mounts `GameUiPreview` over a staged GameContext. Registry in `apps/dev/src/main.tsx`. Vite aliases + tsconfig paths resolve `@jgengine/*` to sibling `src/`, so no build needed to run it.
- `apps/desktop` — Tauri v2 wrapper around the same shell (same aliases, port 1420).
- `examples/express-host` — deployable Node host (`@jgengine/node` + `@jgengine/sql` + express; Dockerfile + fly.toml). `examples/next-host` — Next.js client + REST reads. `examples/convex-host` — the Convex functions `createConvexBackend` talks to (needs `bunx convex dev` for `_generated/`, so it has no check-types).
- `skills/` — the spec. `jgengine-api` (engine surface + definition of done), `jgengine-ui` (HUD quality bar), `jgengine-assets`, `jgengine-newgame` (master blueprint + phased build workflow for a new game). Build games from the skills, not by copying other games.
- This is the engine repo: fix engine gaps and doc errors directly here — never file issues from inside it. Issue-filing ([github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues)) is the path for external consumers building on the published SDK.

## Verification

- `bun run build` — all eight packages compile to dist.
- `bun run check-types` — every workspace package with the script.
- `bun test packages` — engine + game tests.
- After changing any game UI/HUD: `bun run shoot <gameId> --mode ui` writes a PNG to `shots/` — open and look at it; type-green says nothing about whether the HUD renders. `--mode play` screenshots the full shell. Game HUD Tailwind classes only generate because `apps/dev/src/index.css` has `@source` entries for `packages/games`, `packages/react`, `packages/shell` — silently-unstyled UI means a missing `@source`.

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
