# JGengine

TypeScript game framework: reusable systems in `packages/`, ten playable adopters in `games/`.
Games run package source from the same commit, not npm releases.

## The stack

- **UI** is JSX on the engine's own runtime (`@jgengine/core/ui/jsx`). It looks like React but is not:
  there is no `react` import and no React hooks. Every game sets `uiRenderer: "rune"` and draws
  through Rune (Rust in `native/`, compiled to wasm). `@jgengine/ui` (`packages/ui`) is the UI
  package; `@jgengine/react` is its deprecated old name.
- **3D** is plain three.js on the engine's frame loop (`packages/core/src/frame/`). WebGL is the
  default; WebGPU is a preview (`?renderer=webgpu`).
- **Native Rust rendering** is an experiment in `native/` and does not ship.

## Commands (run from the repo root)

- Setup: `bun run agent:bootstrap` (docs-only edits need none).
- Test: `bun run test [path]`.
- While iterating: `bun run verify:fast`. It checks only what your branch changed, stops at the first
  failure, and a passing run is reused by the next one on the same tree.
- Full gate: `bun run verify:fast --landing` (every gate CI runs, the tests, boots and the site build).
- Regenerate committed artifacts: `bun run gen`. Run it after any public API or file change; the
  checks fail on generated files that drifted from their generator.
- Find a feature's owner: `bun run find <words>`. Run the site: `bun run dev:site`.
- Package scripts: `bun --cwd=packages/<pkg> run <script>`. Other cwd forms can run the wrong script.
- Tests, types and generators use source. Build only for packing or the Node CLI.

## Landing a change

Branch from `origin/beta`, then run `bun run lane:close -m "<what changed>"` in the harness
background. **This is not a dry run.** It runs setup, generation and the gate, then commits, pushes,
opens the PR and merges it into beta, and deletes the branch afterwards. It reuses a passing
`verify:fast --landing` of the same tree, so do not run the gate separately just before it. Only one
`lane:close` can run per worktree at a time. Do not run it on work you are not ready to merge.

## Where to start

- `README.md`: the parts and how they layer.
- New game or large feature: `.claude/skills/create-game-jg/SKILL.md`.
- Existing game: its `games/<name>/PLAN.md` if it has one (five of the ten do); otherwise its
  `README.md` and `bun run find`.
- Anything else: `.claude/skills/jgengine/SKILL.md` routes to the right skill, including
  verification and perf evidence (`jgengine-verify`) and world/editor work (`jgengine-editor`).

## Changing a game improves the framework

- World content lives in `editor.scene.json`, authored through the editor. If the editor cannot
  express a change, file a feature issue before writing a code fallback.
- Before editing a game, name the shared owner of the behavior in `packages/`.
- Compose small configurable parts. Keep game-specific numbers in the game.
- When a shared part changes, fix every game that uses it in the same change. No compatibility shims.
- A mechanism only one game uses may stay local if an issue names the seam. When a second game needs
  it, move it into `packages/`.
- A feature's model, view and draw code live together in `packages/core/src/<feature>/`. Model code
  has no rendering, browser or backend dependencies.
