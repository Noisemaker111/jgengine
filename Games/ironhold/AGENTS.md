# Ironhold — agent briefing

You are in a **JGengine** game project. JGengine is a pure-TypeScript game engine SDK on npm (`@jgengine/core`, `react`, `shell`, …). Site: https://jgengine.com · source: https://github.com/Noisemaker111/jgengine

**How people use JGengine:** they say *Make a game that … with jgengine* to an agent. They do **not** start from a CLI tutorial. `npx jgengine` is for **you** (scaffold, skills, docs).

**This project is the game.** Build here, on the `@jgengine/*` npm packages. Never clone the jgengine GitHub repo, and never copy code, assets, or content from its `Games/*` directory — those are private in-repo test games, not templates, and their content is not licensed for reuse.
- Engine API surface: the skills ship inside every `@jgengine/*` tarball — read `node_modules/@jgengine/<pkg>/skills/` (each domain skill carries `SKILL.md` + a generated `api.md` of the full export surface).
- Agent skills — design playbooks, intake router, focused API domains, browserless verify gate: installed by create; recovery via `npx jgengine skills -p`.
- Setup broken or UI unstyled: `npx jgengine doctor`.

## What to do when the user wants this game built

1. Read skills if present: `jgengine` (intake + routing), `game-design` for loops and systems, `level-design` for playable spaces, domain skills as needed, and `jgengine-verify` for evidence. They land under `.agents/skills/` or `.claude/skills/` when scaffolded via create.
2. If skills are missing (your problem, not the user's): `npx jgengine skills -p`, or read them straight from `node_modules/@jgengine/<pkg>/skills/`.
3. **User-facing first reply is short** — game name, fantasy in 2–4 lines, POV (1st / 3rd / top-down / HUD-only), world kind, scale vibe. Ask a few tight questions (POV, world, multiplayer, how big). **Do not** dump file trees, catalog ids, keybind tables, or full phase plans to the user.
4. Keep the full engineering plan (files, systems, budgets) internal. After they answer, scaffold is already here — build in phases, full game not a slice.

## Engine loaders

- Skills + API docs in every tarball: `node_modules/@jgengine/<pkg>/skills/`
- Doctor: `npx jgengine doctor`
- Dev: `bun dev` / `npm run dev`
- Windows installer: `bun run desktop` / `npx jgengine desktop` (or `--url https://…` for a hosted game)

## Built-in modes — every game ships them, use them

The F2 chord family is in every JGengine game, and it is **your** toolkit, not just the player's:

- **F2+D — debug mode**: engine devtools overlay (perf, logs, net, keybinds, live tunables with Save-to-source).
- **F2+C — canvas mode**: drag/resize HUD panels; layout writes to scene document `ui.panels` (undoable with live editor).
- **F2+E — editor mode** (also `?mode=editor`): the Blender/Unity-style scene editor — place spawns, zones, paths, vegetation; Save writes `src/editor.scene.json`.

Prefer these over guessing: tune numbers in debug mode, fix HUD layout in canvas mode, and place/move world content in editor mode instead of hand-editing `x,y,z` in tables. Agents drive all three headlessly through `window.__jgengineAgent.handle({ method: ... })` on any game page (`agent_status`, `debug_snapshot`, `canvas_move_panel`, `canvas_resize_panel`, `editor_summon`, editor verbs, `save_scene`) — run `bun dev`, open the page in your browser tool, and call the bridge. HUD placement lives in `editor.scene.json` → `ui.panels`; TSX `HudPanel` props are fallback-only. See the `jgengine-editor` skill.

## Project rules

- Shape: `src/` holds only `game.config.ts`, `index.tsx`, `main.tsx`, `loop.ts`, `world.ts`, `editorLayers.ts`, `editorLayers.test.ts`, `editorCatalogs.ts`, `editorCatalogs.test.ts`, `editor.scene.json`, `index.css`, `style.css`; everything else under `src/game/`.
- Entry: `defineGame({...})` from `@jgengine/shell/defineGame` in `game.config.ts`.
- World content: the scaffold ships `src/editor.scene.json` wired via `defineGame({ editorLayers })` — place spawns, props, zones, and paths in editor mode (F2+E, Ctrl+S saves), never as coordinate tables in code. The player spawns at the authored `player_spawn` marker (`authoredSpawnPosition`).
- Prove world content with `summarizeEnvironment` in `bun test` (`src/game/world.world.test.ts`), not screenshot loops.
- Tailwind v4: `@source` in `src/index.css` must cover `@jgengine/react` and `@jgengine/shell` (engine source under packages/), or the HUD is silently unstyled.
- Spawn player with `id === ctx.player.userId` in `onNewPlayer`; `onTick` `dt` is game time.

## Visual quality bar

"Make it look better" work is screenshot-judged, by you, harshly. Take a shot of live gameplay first and call it honestly — flat untextured ground, default lighting, and an empty horizon "doesn't look like a game" and fails. Then use the whole art stack (terrain texture/variation, materials, lighting/daylight, sky/fog, post-processing, vegetation density, props and landmarks — see the `jgengine-ui` skill's "Visual quality bar") and re-shoot at each milestone until the frame reads like a shipped game. Data tests prove content exists; only your eyes prove it looks good.
