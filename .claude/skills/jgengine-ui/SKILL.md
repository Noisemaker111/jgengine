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
- Screen placement belongs in the game's `ui/GameUI.tsx` composition layer.
- Persistent gameplay information is frameless unless a physical/diegetic frame is part of the game's art direction.
- Instructions are contextual and temporary, not permanent keyboard grids.
- Mobile controls share input mechanics but not one universal visual skin.
- Themes change geometry, composition, typography roles, icons, motion, materials, sound, and density—not only colors.
- Ordinary rounded cards, pill buttons, generic dark modals, and dashboard grids are fallback failures, not defaults.

## Preview states ship with the UI

Every game ships `src/preview.tsx`: a static default frame plus a `states` named export (`GamePreviewStates` from `@jgengine/react/preview`) keying named UI states — `stage_1`, `game_over`, `boss_intro` — to components. The website card uses a captured real-gameplay screenshot instead, not this component. Build state entries from the game's **real UI components** with fixture snapshots (canned props/state), not redrawn lookalikes; that turns every key into a capturable render test. Capture any state instantly with `bun run shoot <game> --preview <stateKey>` — no sim, no three.js, no hang risk — and use it as the screenshot-critique loop for HUD/menu/overlay work before any full-shell `--mode ui`/`play` glance. Live-sim screens (a running match, a real store with live state) are the other capture family: declare them as `PlayableGame.capture.states` and shoot with `--state <name>` — see `jgengine-verify`.

## Rejection test

Reject and revise the UI when it could be mistaken for a SaaS dashboard, landing page, admin panel, documentation page, or generic emulator overlay.
