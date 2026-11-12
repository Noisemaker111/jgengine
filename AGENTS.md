# JGengine

TypeScript game framework: reusable systems in `packages/`, ten playable adopters in `games/`.
Games run package source from the same commit, not npm releases.

## Facts that are easy to get wrong

- UI is JSX on the engine's own runtime (`@jgengine/core/ui/jsx`), never React. Every game sets
  `uiRenderer: "rune"` and draws through Rune (Rust in `native/`, compiled to wasm). `@jgengine/ui`
  (`packages/ui`) has no React; `@jgengine/react` is its deprecated old name.
- three.js is plain JavaScript on the engine's frame loop (`packages/core/src/frame/`), no React
  Three Fiber or drei. WebGL is the default; WebGPU is a preview (`?renderer=webgpu`).
- Native Rust rendering is an experiment in `native/` and does not ship.

## Runtime and verification (from the repo root)

- Setup `bun run agent:bootstrap` (docs-only edits need none). Tests `bun run test [path]`.
- Iterate `bun run verify:fast`; gate `bun run verify:fast --landing`.
- Land into beta: `bun run lane:close -m "<what changed>"` in the harness background. It runs setup,
  generation and the gate, then commits, pushes and merges; no separate gate run before it.
- Tests, types and generators use source; build only for packing or the Node CLI.
- Package scripts: `bun --cwd=packages/<pkg> run <script>`; other cwd forms can run the wrong script.
- Public API or file changes: `bun run gen`. Branch from `origin/beta`. Site: `bun run dev:site`.

## Where to start

- `README.md` for the parts and layering; `bun run find <words>` finds a feature's owner.
- New game or large feature: `.claude/skills/create-game-jg/SKILL.md`; existing game: its `PLAN.md`.
- Other domains: `.claude/skills/jgengine/SKILL.md` routes to the right skill, including
  verification and perf evidence (`jgengine-verify`) and world/editor work.

## Game changes improve the framework

- World content lives in `editor.scene.json`, authored through the editor; if it cannot express a
  change, file a feature issue before a code fallback.
- Name the shared owner before editing a game. Compose small configurable parts, keep game numbers in
  the game, fix every adopter together, no compatibility shims. A one-adopter mechanism may stay local
  with an issue naming the seam; the second adopter moves it upstream.
- Feature model, view and draw live together in `packages/core/src/<feature>/`; model code has no
  rendering, browser or backend dependencies. Never use Kenney assets; credit others in `CREDITS.md`.
