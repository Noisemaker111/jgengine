# JGengine

TypeScript game framework: reusable systems in `packages/`, ten playable adopters in `games/`.
Games run package source from the same commit, not npm releases.

## The stack

- UI is JSX on the engine's own runtime (`@jgengine/core/ui/jsx`), not React: no `react` import, no
  React hooks. Every game sets `uiRenderer: "rune"` and draws through Rune (Rust in `native/`, wasm).
  `@jgengine/ui` is the UI package; `@jgengine/react` is its deprecated old name.
- 3D is plain three.js on the engine's frame loop (`packages/core/src/frame/`). WebGL is the default;
  WebGPU is a preview (`?renderer=webgpu`). Native Rust rendering in `native/` is an experiment.

## Commands (repo root)

- Setup `bun run agent:bootstrap` (docs-only edits need none). Tests `bun run test [path]`.
- Iterate `bun run verify:fast` (checks what your branch changed, stops at first failure).
  Gate `bun run verify:fast --landing`.
- After public API or file changes: `bun run gen` (checks fail on drifted generated files).
- `bun run find <words>` finds a feature's owner. Site: `bun run dev:site`.
- Package scripts: `bun --cwd=packages/<pkg> run <script>`; other cwd forms can run the wrong script.
- Tests, types and generators use source; build only for packing or the Node CLI.

## Landing

Branch from `origin/beta`. `bun run lane:close -m "<what changed>"` (harness background) is not a
dry run: it runs setup, generation and the gate, then commits, pushes, opens the PR, merges into beta
and deletes the branch. It reuses a passing gate of the same tree; one run per worktree.

## Where to start

- `README.md` for the parts and layering. New game or large feature: `create-game-jg` skill.
- Existing game: its `PLAN.md` if it has one, else its `README.md`.
- Other work: `.claude/skills/jgengine/SKILL.md` routes to the right skill.

## Game changes improve the framework

- World content lives in `editor.scene.json`; if the editor cannot express a change, file a feature
  issue before a code fallback.
- Name the shared owner in `packages/` before editing a game. Compose small configurable parts, keep
  game numbers in the game, fix every adopter together, no compatibility shims. A one-adopter
  mechanism may stay local with an issue naming the seam; the second adopter moves it upstream.
- Feature model, view and draw live in `packages/core/src/<feature>/`; model code has no rendering,
  browser or backend dependencies.
