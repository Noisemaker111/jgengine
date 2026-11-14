# JGengine — pointer

This game is built on **JGengine**, a TypeScript game framework. This file is engine-owned and rewritten by `jgengine sync`; do not edit it.

- Rules: the monorepo's root `AGENTS.md` and this game's `PLAN.md`.
- UI is JSX on the engine's own runtime, not React. Every game draws through Rune (`uiRenderer: "rune"`).
- 3D is plain three.js on the engine's frame loop.
- Find a shipped capability before building one: `bun run find <words>`.
- World content lives in `src/editor.scene.json`, authored through the editor (F2+E), not in code.
- Skills: `.claude/skills/jgengine/SKILL.md` routes to the right one.
