---
name: jgengine-ui
description: Game-first HUDs, menus, touch controls, motion, accessibility, art direction, and visual verification.
---

# jgengine-ui

Use this skill for the **visual and interaction design of the game interface**: title screens, HUDs, menus, prompts, maps, inventories, dialogue, touch controls, transitions, pause/results states, accessibility, and screenshot critique.

Do not use this skill as a React, routing, state-management, or hooks reference. The main `jgengine` skill owns routing and points to the engine APIs. When implementation needs `@jgengine/react` hooks or shell APIs, follow the links in the main skill and the compact API appendix in [reference.md](reference.md); keep this skill focused on what the player sees and feels.

## Required outcome

A JGengine game must read as a self-contained game, not a responsive website with a canvas inside it.

Before shipping UI:

1. Give the game a concise UI art direction.
2. Compose explicit desktop/mobile game layouts instead of document flow.
3. Keep persistent HUD information sparse and hierarchical.
4. Adapt touch controls to the genre and reserve their screen zones.
5. Implement authored focus, pressed, selected, disabled, success, failure, and warning states.
6. Add purposeful motion and feedback.
7. Capture screenshots and revise what actually renders.

## Ownership boundary

The main `jgengine` skill owns intake, engine architecture, API routing, hooks, commands, state, and verification routing. This skill owns presentation quality.

Read [reference.md](reference.md) when building or reviewing a game interface. It contains the implementation quality bar, layout rules, art-direction template, touch-control requirements, acceptance criteria, and the compact existing React API surface.

## Non-negotiable defaults

- Active play owns the viewport; no marketing header, page title bar, document scrolling, or website container.
- The game builds its own main menu (unique per game) and its own in-game menus (pause, settings, results). The hosting site page (`apps/web`) is a loader only — spinner until `/play` is ready, no title/tagline/CTA of its own. One menu per game, and the game owns it.
- Screen placement belongs in the game's `ui/GameUI.tsx` composition layer.
- Persistent gameplay information is frameless unless a physical/diegetic frame is part of the game's art direction.
- Instructions are contextual and temporary, not permanent keyboard grids.
- Keyboard/mouse hints never render on touch. A touchscreen has no keyboard, so a key legend is pure noise that fights the on-screen controls for space. Wrap every key cap + its meaning in `KeyHint` (from `@jgengine/react`) — it renders nothing on coarse pointers and is also hidden by an engine stylesheet as a hydration-safe backstop; use `Keycap` for the cap itself. For a hand-rolled hint that can't use the component, tag its container `data-jg-kbd-hint`. Put the touch equivalent (a `TouchControls` dock, a tappable button) on the coarse branch. This was the "keybinds still showing on mobile" bug.
- Bottom-edge HUD goes through `HudCanvas`/`HudPanel` (`anchor="bottom*"`), never hand-positioned `absolute bottom-*`. The shell mounts the touch-control dock along the bottom and publishes its height as `--jg-hud-dock-clearance`; only `HudPanel` regions honor it, so hand-positioned bottom panels land *on top of* the joystick and action buttons — and, because they never register a layout region, the collision detector can't even warn. Route corner/edge panels through `HudPanel` so they auto-stack, clear the dock, and become visible to collision detection. This was the "menus stacked over each other at the bottom" bug.
- **Canvas mode (`F2+C`)** toggles live HUD panel dragging on any mounted `HudCanvas` (part of the engine chord family: `F2+D` debug, `F2+C` canvas, `F2+E` editor). Agents reach it headless via `bun run drive <id> --rpc '{"method":"canvas_state"}'` / `canvas_move_panel` — see `jgengine-editor` for the full verb list.
- Mobile controls share input mechanics but not one universal visual skin.
- Themes change geometry, composition, typography roles, icons, motion, materials, sound, and density—not only colors.
- Ordinary rounded cards, pill buttons, generic dark modals, and dashboard grids are fallback failures, not defaults.
- HUD numbers go through `@jgengine/core/format` — `formatDuration`/`formatDelta`/`formatOrdinal` (clocks, splits, ranks), `formatSpeed` (m/s → km/h/mph/knots), `formatDistance` (m/km) — never a hand-rolled `Math.round(x * 3.6)` or `mm:ss` string. Two games once diverged on the m/s→km/h factor (3.2 vs 3.6) because each hand-rolled its own conversion; the shared functions are the one correct table.

## Preview states ship with the UI

Every game ships `src/preview.tsx`: a static default frame plus a `states` named export (`GamePreviewStates` from `@jgengine/react/preview`) keying named UI states — `stage_1`, `game_over`, `boss_intro` — to components. The website card uses a captured real-gameplay screenshot instead, not this component. Build state entries from the game's **real UI components** with fixture snapshots (canned props/state), not redrawn lookalikes; that turns every key into a capturable render test. Capture any state instantly with `bun run shoot <game> --preview <stateKey>` — no sim, no three.js, no hang risk — and use it as the screenshot-critique loop for HUD/menu/overlay work before any full-shell `--mode ui`/`play` glance. Live-sim screens (a running match, a real store with live state) are the other capture family: declare them as `PlayableGame.capture.states` and shoot with `--state <name>` — see `jgengine-verify`.

## Rejection test

Reject and revise the UI when it could be mistaken for a SaaS dashboard, landing page, admin panel, documentation page, or generic emulator overlay.

## Visual quality bar — the world, not just the UI

"Make the starter area / terrain / environment look better" is a screenshot-judged loop, not a data task:

1. **Look first.** `bun run shoot <id> --mode play` (or `bun run drive <id> --click ... --shot before` for menu-gated games). Judge the shot like a player seeing a store page: flat single-color ground, default-grey materials, no sky treatment, empty horizon = "doesn't look like a game" — say so plainly and treat it as failing.
2. **Use the whole art stack, not one knob.** Sweep every layer before declaring done: terrain texture + height/color variation · materials on props and buildings · lighting + daylight cycle (`@jgengine/shell` environment) · sky, fog, and distance treatment · post-processing chain (composer seam) · vegetation volumes (density slider, tree/bush/grass items) · props, landmarks, and silhouettes that give the space identity. Asset catalogs (`jgengine-assets`) before hand-rolled geometry.
3. **Re-shoot and re-judge at milestones** — after each layer lands, not per-tweak. Stop only when the shot reads like a shipped game in the target art direction.
4. **Prove content in data, beauty by eye.** `summarizeEnvironment` assertions still gate that trees/props/zones exist; screenshots are the only gate for whether they look right. Before/after shots go in the PR body.

Reject test for worlds: if the screenshot could be mistaken for a physics-demo sandbox or an untextured prototype, it fails the bar.
