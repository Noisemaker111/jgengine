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
2. Define the real UI states: attract, main menu (the game's front-end), character create/select where relevant, live play, pause, settings, credits, results, empty/error, and relevant overlays.
3. Read state through selectors/hooks; keep simulation mutation behind commands.
4. Compose this game's UI, reaching first for the shipped building blocks — `InventoryGrid`, `usePanels`/`PanelHost`/`Window`, `CharacterSheet`/`Paperdoll`, and the action/selection bars — and composing + reskinning them; only hand-roll custom markup where no building block fits. Toggleable windows (bag `B`, character `C`, etc.) come from `usePanels`, not hand-rolled open/close state. Prefer headless data + game-owned chrome. When a second presentation is plausible, split data / renderer / chrome (minimap stack example: `useLiveMarkers` → track/renderer → game frame; see reference §6).
5. Make keyboard, pointer, touch, controller, focus, and screen-reader behavior explicit.
6. Add preview fixtures using the real components for fast deterministic capture.
7. Verify desktop and mobile layouts through `jgengine-verify`. A HUD that could pass for another game's default chrome fails visual review.

Existing React games keep their entity store and use the focused
[portable minimap recipe](recipes/portable-minimap.md); no `GameProvider`,
`MarkerSet`, Three.js, or React Three Fiber adoption is required.

## Product rules

- **Every game owns its UI end-to-end.** Custom composition, skin, placement, terminology, motion, and one main menu. The website/runner is a bare loader.
- **The main menu is a game front-end, not marketing.** The runner loads straight into the game's own menu; it offers the real front-end verbs the game supports — New Game, Continue/Load (save slots), Create/Choose character or class, Settings, Credits — each an authored screen in the game's art direction, not a landing page or raw scaffold. See [reference.md](reference.md) §"Main menu".
- **Settings is game-owned and reachable from a sensible place.** Every game ships settings as *its* settings — skinned and placed inline with its UI (main menu and pause), never the engine's stock face floated into a corner. Credits are a reachable in-game screen, not attribution buried in a build artifact.
- Engine packages ship both headless seams *and* good drop-in building blocks. The seams are layout (`HudCanvas`/`HudPanel`), data hooks, interaction models, and tokens; the building blocks are the parts almost every game needs — inventory grids (`InventoryGrid`), toggleable windows (`usePanels`/`PanelHost`/`Window`), character sheets (`CharacterSheet`/`Paperdoll`), stat/vitals bars, and action/selection bars. Composing and reskinning these is using the engine correctly, not out of policy. What stays out of scope is a whole finished game *face* or a genre theme preset shipped as the product (see [AGENTS.md](../../../AGENTS.md)).
- Never reach for a genre HUD kit, theme preset, or "default RPG/FPS chrome" as the game's *identity*. Composing the shared building blocks (bag, character, spellbook, action-bar windows) is fine and expected — it's a prefab genre *look/identity* dropped in unchanged that's discouraged. Build the look this pitch needs on top of them.
- Layout and skin remain caller-controlled; shared primitives own reusable behavior, not product look.
- SSR-visible output is hydration-stable; round computed SVG values at the boundary.

## Traps

- Do not put environment beautification, authored-scene rendering, or world placement here.
- Do not duplicate inventory, combat, quest, or selection state inside components.
- A static facsimile preview does not test the real UI; compose production components with fixtures.
- Visual quality is judged from rendered evidence, not component counts or prose.
