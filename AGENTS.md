# JGengine

TypeScript game framework: reusable systems in `packages/`, ten playable adopters in `games/`.
Games run package source from the same commit, not npm releases.

## Facts that are easy to get wrong

- UI is JSX on the engine's own runtime (`@jgengine/core/ui/jsx`), never React. Every game in
  `games/` sets `uiRenderer: "rune"` and draws through Rune (Rust in `native/`, compiled to wasm).
  `@jgengine/ui` (`packages/ui`) contains no React; `@jgengine/react` is its deprecated old name. `bun run check react-free`
  names the few host folders that keep React.
- three.js is plain JavaScript on the engine's frame loop (`packages/core/src/frame/`). No React
  Three Fiber or drei. WebGL is the default; WebGPU is a preview (`?renderer=webgpu`).
- Native Rust rendering is an experiment in `native/` and does not ship (`native/README.md`).

## Runtime and verification

Run from the repo root:

- Setup: `bun run agent:bootstrap` (docs-only edits need no install).
- Tests: `bun run test <path>`; omit `<path>` for all tests.
- Iterate: `bun run verify:fast` selects checks from the branch diff.
- Gate: `bun run verify:fast --landing`.
- Land into beta: `bun run lane:close -m "<what changed>"`. It runs setup, generation and the gate, commits, pushes and merges. Run in the harness background; success ends with the merge commit. No separate gate run before landing.

Tests, types and generators use source; build only for packing or the Node CLI.
Package scripts use `bun --cwd=packages/<pkg> run <script>`; other cwd forms can silently run the wrong script.
Public API/file changes: `bun run gen`, including its generated export manifest and skill docs.
Start branches from current `origin/beta`; delivery details: `.claude/skills/workflow/SKILL.md`.
The site runs with `bun run dev:site`; there is no root `bun dev`.

## Where to start

- What it is, packages, layering, the eleven parts: `README.md`.
- Find a feature's owner: `bun run find <words>`; check several capabilities with `bun run jgengine has <feature> ...`.
- New game or large feature: `.claude/skills/create-game-jg/SKILL.md`.
- Existing game: its `PLAN.md` and README; proofs and suite: `games/README.md`.
- World/editor work: `.claude/skills/jgengine-editor/SKILL.md`.
- UI, gameplay and other domains: `.claude/skills/jgengine/SKILL.md` routes to the relevant skill.
- Website: `apps/web/README.md`; quoted numbers live in `apps/web/src/lib/siteFacts.ts` and `story.ts`, each tied to its source.
- Visual or runtime evidence: `.claude/skills/jgengine-verify/SKILL.md`; use the repo's capture/drive tools.
- Player performance claims require production runs; use the perf harness reference in that verification skill.

## Game changes improve the framework

World content belongs in `editor.scene.json`, authored through the editor. If it cannot express the change, file a feature issue before a code fallback.
Name the shared owner before editing a game. Compose small configurable parts, keep game numbers/content in the game, and fix every affected adopter together; no compatibility shims.
A mechanism with only one adopter may stay game-local with an issue naming the shared seam; the second adopter moves it upstream.
Feature model, view and draw files live together in `packages/core/src/<feature>/`; suffixes define layers (README). Keep model code free of rendering, browser and backend dependencies.
Never use Kenney assets. Credit other sources in `CREDITS.md`.
Tree/species changes start at the forestry contract in `packages/core/src/plants/species/data/treeEnvelope.test.ts`; do not add species exemptions.
