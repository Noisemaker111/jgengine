---
name: jgengine-ui
description: Build composable, accessible HUDs, menus, feedback, and responsive presentation.
---

# JGengine UI

## Ownership

This skill owns player-facing presentation: HUDs, menus, overlays, layout, responsive behavior, accessibility, touch/controller presentation, feedback, previews, and UI chrome. World rendering belongs to `jgengine-world`; state ownership stays in gameplay/combat.

Search [capabilities.md](capabilities.md), use [api.md](api.md) for signatures, and open [reference.md](reference.md) for component recipes. Visual polish uses [references/visual-scorecard.md](references/visual-scorecard.md).

## Canonical workflow

1. Define the real UI states: attract/menu, live play, pause, results, empty/error, and relevant overlays.
2. Read state through selectors/hooks; keep simulation mutation behind commands.
3. Compose headless data, renderer, and chrome where a second presentation is plausible. The minimap stack is the canonical example: `useLiveMarkers` (data) → `Minimap`/`MinimapTrack` (renderer) → `HudFrame` (chrome), see reference §6.
4. Make keyboard, pointer, touch, controller, focus, and screen-reader behavior explicit.
5. Add preview fixtures using the real components for fast deterministic capture.
6. Verify desktop and mobile layouts through `jgengine-verify`.

Existing React games keep their entity store and use the focused
[portable minimap recipe](recipes/portable-minimap.md); no `GameProvider`,
`MarkerSet`, Three.js, or React Three Fiber adoption is required.

## Product rules

- A game owns exactly one main menu. The website/runner is a bare loader.
- Engine UI supplies defaults, not mandatory fixed-position overlays.
- Layout and skin remain caller-controlled; shared primitives own reusable behavior.
- SSR-visible output is hydration-stable; round computed SVG values at the boundary.

## Traps

- Do not put environment beautification, authored-scene rendering, or world placement here.
- Do not duplicate inventory, combat, quest, or selection state inside components.
- A static facsimile preview does not test the real UI; compose production components with fixtures.
- Visual quality is judged from rendered evidence, not component counts or prose.
