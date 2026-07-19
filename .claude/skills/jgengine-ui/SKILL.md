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
2. Define the real UI states: attract, main menu (the game's front-end), character create/select where relevant, live play, pause, settings, credits, results, empty/error, and relevant overlays. **If the game can kill or down the player, a death/downed state is one of these required screens** — see the death-flow product rule below.
3. Read state through selectors/hooks; keep simulation mutation behind commands.
4. Compose this game's UI, reaching first for the shipped building blocks — `InventoryGrid`, `usePanels`/`PanelHost`/`Window`, `CharacterSheet`/`Paperdoll`, and the action/selection bars — and composing + reskinning them; only hand-roll custom markup where no building block fits. Toggleable windows (bag `B`, character `C`, etc.) come from `usePanels`, not hand-rolled open/close state — and `PanelHost` already stacks windows above the HUD (`zIndexBase`) and wires hotkeys/ESC, so never hand-roll a `z-*` or keydown listener for them. A live 3D character-screen portrait is `EntityPreview` (`@jgengine/shell/render/EntityPreview`): it owns the nested `<Canvas>`, the `GameContextBridge` across the R3F boundary, and the `StudioStage` lighting — pass the game's own `renderEntity` as children (or a native `model`+`instanceId`) and it mirrors the live entity; don't re-derive the context bridge by hand. Prefer headless data + game-owned chrome. When a second presentation is plausible, split data / renderer / chrome (minimap stack example: `useLiveMarkers` → track/renderer → game frame; see reference §6).
5. Make keyboard, pointer, touch, controller, focus, and screen-reader behavior explicit.
6. Add preview fixtures using the real components for fast deterministic capture. To preview the shipped engine HUD primitives themselves (bars, `HudTheme` presets, painted icons), the exported fixtures are registered in `@jgengine/react`'s `PREVIEW_FIXTURES` — capture one directly with `bun run shoot --fixture <name>` (`--list` shows the set) instead of hand-rolling a `--url` mount; register any new deterministic preview component there to make it capturable.
7. Verify desktop and mobile layouts through `jgengine-verify`. A HUD that could pass for another game's default chrome fails visual review.

Existing React games keep their entity store and use the focused
[portable minimap recipe](recipes/portable-minimap.md); no `GameProvider`,
`MarkerSet`, Three.js, or React Three Fiber adoption is required.

## Product rules

- **Every game owns its UI end-to-end.** Custom composition, skin, placement, terminology, motion, and one main menu. The website/runner is a bare loader.
- **The main menu is a game front-end, not marketing.** The runner loads straight into the game's own menu; it offers the real front-end verbs the game supports — New Game, Continue/Load (save slots), Create/Choose character or class, Settings, Credits — each an authored screen in the game's art direction, not a landing page or raw scaffold. See [reference.md](reference.md) §"Main menu".
- **Settings is game-owned and reachable from a sensible place.** Every game ships settings as *its* settings — skinned and placed inline with its UI (main menu and pause), never the engine's stock face floated into a corner. Credits are a reachable in-game screen, not attribution buried in a build artifact.
- Engine packages ship both headless seams *and* good drop-in building blocks. The seams are layout (`HudCanvas`/`HudPanel`), data hooks, interaction models, and tokens; the building blocks are the parts almost every game needs — inventory grids (`InventoryGrid`), toggleable windows (`usePanels`/`PanelHost`/`Window`), character sheets (`CharacterSheet`/`Paperdoll`), stat/vitals bars, and action/selection bars. Composing and reskinning these is using the engine correctly, not out of policy. What stays out of scope is a whole finished game *face* or a genre theme preset shipped as the product (see [AGENTS.md](../../../AGENTS.md)).
- **Skin the shared chrome with one `HudTheme` token object.** `hudThemeVars(theme)` emits the `--jg-*` custom properties that the atomic bars, `HudFrame variation="themed"`, painted slots, and the minimap ring all read, so one theme spread on any HUD ancestor reskins the whole subtree — palette, frame material, corner radius, glow, and slot chrome. Author your own theme (tower-guard's `fieldkitVars` is the model); `HUD_THEME_PRESETS` / `resolveHudTheme("<preset>")` are demo/scaffold starting points, never a game's identity. Caller `style`/`renderItem` overrides still win over the theme default.
- **Paint slot icons with `IconTreatment`, never render raw `itemId` strings.** It draws a `GameIcon` glyph (or any node) over a school/element-keyed radial gradient with a gloss + vignette and optional count/keycap badges, and reads the `--jg-slot-*` / `--jg-accent` `HudTheme` tokens so a theme change reskins every treated icon. `schoolForItem`/`schoolForAction` infer the gradient from an id; `treatedItemIcon(itemId)` / `treatedActionIcon(action)` are ready adapters. Use it in hotbars and ability bars so slots read as painted icons, not debug text.
- Never reach for a genre HUD kit, theme preset, or "default RPG/FPS chrome" as the game's *identity*. Composing the shared building blocks (bag, character, spellbook, action-bar windows) is fine and expected — it's a prefab genre *look/identity* dropped in unchanged that's discouraged. Build the look this pitch needs on top of them.
- **Player death gets a visible screen and respawn feedback — never a silent teleport.** When the game can kill or down the player, build the moment `game-design` requires: an authored death/downed overlay that reads the lethal event, communicates the consequence, and surfaces the way back (respawn/revive/restart affordance) with legible feedback. Drive it from the existing state primitive — `createDownedState` (`@jgengine/core/combat`) already models a downed/bleed-out-then-revive lifecycle — so the screen reflects real state instead of a hand-rolled flag; mount the overlay inside `HudCanvas` like any other window. A lethal hit that just resets position with no on-screen acknowledgement is a presentation gap, not a finished flow.
- Layout and skin remain caller-controlled; shared primitives own reusable behavior, not product look.
- SSR-visible output is hydration-stable; round computed SVG values at the boundary.

## Traps

- Do not put environment beautification, authored-scene rendering, or world placement here.
- Do not duplicate inventory, combat, quest, or selection state inside components.
- A static facsimile preview does not test the real UI; compose production components with fixtures.
- Visual quality is judged from rendered evidence, not component counts or prose.
- Shown HUD UI must fit the player viewport. `HudCanvas` runs a live boundary check on every registered `HudPanel`, any element tagged `data-hud-window`, and its own direct children: if a *visible* surface crosses a viewport edge it draws a red dev overlay on the offender, `console.warn`s, and sets `data-hud-overflow` (which fails the `bun run shoot` gate). A closed/parked/hidden surface (off-screen drawer, unopened menu, `visibility:hidden`, `aria-hidden`) never trips it — only surfaces partly on screen and partly past an edge. Deliberate bleed opts out with `data-hud-allow-overflow`. Mount custom windows inside `HudCanvas` (tag deeper ones `data-hud-window`) so the check can see them.
