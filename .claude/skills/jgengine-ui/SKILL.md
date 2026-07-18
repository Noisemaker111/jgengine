---
name: jgengine-ui
description: Build composable, accessible HUDs, menus, feedback, and responsive presentation.
---

# JGengine UI

## Ownership

This skill owns player-facing presentation: HUDs, menus, overlays, layout, responsive behavior, accessibility, touch/controller presentation, feedback, previews, and UI chrome. World rendering belongs to `jgengine-world`; state ownership stays in gameplay/combat.

Search [capabilities.md](capabilities.md), use [api.md](api.md) for signatures, and open [reference.md](reference.md) for component recipes. Visual polish uses [references/visual-scorecard.md](references/visual-scorecard.md).

## Canonical workflow

1. Write the game's UI art direction first (see [reference.md](reference.md) §1) — fantasy, shape/material language, hierarchy, forbidden patterns. Stock glass widgets are not a stand-in for this step.
2. Define the real UI states: attract/menu, live play, pause, results, empty/error, and relevant overlays.
3. Read state through selectors/hooks; keep simulation mutation behind commands.
4. Compose custom markup for this game. Prefer headless data + game-owned chrome. When a second presentation is plausible, split data / renderer / chrome (minimap stack example: `useLiveMarkers` → track/renderer → game frame; see reference §6).
5. Make keyboard, pointer, touch, controller, focus, and screen-reader behavior explicit.
6. Add preview fixtures using the real components for fast deterministic capture.
7. Verify desktop and mobile layouts through `jgengine-verify`. A HUD that could pass for another game's default chrome fails visual review.

## Product rules

- **Every game owns its UI end-to-end.** Custom composition, skin, placement, terminology, motion, and one main menu. The website/runner is a bare loader.
- Engine packages do not supply a finished game face. Shared UI is headless or unskinned building blocks: layout (`HudCanvas`/`HudPanel`), data hooks, interaction models, tokens. Optional styled widgets exist for previews and scaffolding only — shipping them unskinned as the product is out of policy (see [AGENTS.md](../../../AGENTS.md)).
- Never reach for genre HUD kits, theme presets, or "default RPG/FPS chrome" as the game's identity. Build the look this pitch needs.
- Layout and skin remain caller-controlled; shared primitives own reusable behavior, not product look.
- SSR-visible output is hydration-stable; round computed SVG values at the boundary.

## Traps

- Do not put environment beautification, authored-scene rendering, or world placement here.
- Do not duplicate inventory, combat, quest, or selection state inside components.
- A static facsimile preview does not test the real UI; compose production components with fixtures.
- Visual quality is judged from rendered evidence, not component counts or prose.

