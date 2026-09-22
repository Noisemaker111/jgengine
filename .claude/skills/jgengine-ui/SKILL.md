---
name: jgengine-ui
description: Build composable, accessible HUDs, menus, feedback, and responsive presentation.
---

# JGengine UI

## Ownership

This skill owns player-facing presentation: HUDs, menus, overlays, layout, responsive behavior, accessibility, touch/controller presentation, feedback, previews, and UI chrome. World rendering belongs to `jgengine-world`; state ownership stays in gameplay/combat.

Search [capabilities.md](capabilities.md) by intent and use [api.md](api.md) for signatures. [reference.md](reference.md) is the presentation quality guide (screen inventory, layout modes, main menu, settings, motion, mobile controls, rejection criteria, definition of done); [reference-primitives.md](reference-primitives.md) covers how the shipped blocks compose, rendering/post-processing, and the first-person viewmodel. Visual review uses the scorecard in [jgengine-verify](../jgengine-verify/references/visual-scorecard.md).

## Canonical workflow

1. Write the game's UI art direction before any screen: player fantasy, emotional tone, shape language, material language, typography roles (display / body / numerical / labels), motion, icon, and sound language, information hierarchy, and forbidden patterns (for example generic rounded dashboard cards, pill buttons, long centered paragraphs during play, persistent keyboard-instruction grids, equally weighted bordered panels, website-style modals). A theme is not done when only colors and fonts change; it must also shape composition, geometry, spacing, borders, icons, motion, density, terminology, and touch controls. Stock glass widgets are not a stand-in for this step.
2. Define the real UI states: attract, main menu, character create/select where relevant, live play, pause, settings, credits, results, empty/error, relevant overlays, and a death/downed screen when the player can die (see product rules).
3. Read state through selectors/hooks; keep simulation mutation behind commands.
4. Compose this game's UI from the shipped building blocks, then reskin: `InventoryGrid`, `usePanels`/`PanelHost`/`Window` (hotkeys, ESC, and z-stacking above the HUD are handled, so never hand-roll a `z-*` or keydown listener for a window), `CharacterSheet`/`Paperdoll`, stat/vitals bars, action/selection bars, and `EntityPreview` (`@jgengine/shell/render/EntityPreview`) for a live 3D character portrait. Hand-roll markup only where no block fits. When a second presentation is plausible, split data / renderer / chrome (see [reference-primitives.md](reference-primitives.md)).
5. Make keyboard, pointer, touch, controller, focus, and screen-reader behavior explicit.
6. Add preview fixtures using the real components for fast deterministic capture. Shipped engine HUD primitives are registered in `@jgengine/react`'s `PREVIEW_FIXTURES`; in the monorepo capture one with `bun run shoot --fixture <name>` (`--list` shows the set).
7. Verify desktop and mobile layouts through `jgengine-verify`, and check [reference.md](reference.md) §14 rejection criteria and the definition of done before claiming UI complete. A HUD that could pass for another game's default chrome fails visual review.

Existing React games keep their entity store and use the focused
[portable minimap recipe](recipes/portable-minimap.md); no `GameProvider`,
`MarkerSet`, Three.js, or React Three Fiber adoption is required.

## Product rules

- **Every game owns its UI end-to-end.** Custom composition, skin, placement, terminology, motion, and one main menu. The website/runner is a bare loader. Composing and reskinning the shipped blocks is correct use; a genre HUD kit, theme preset, or unarranged default stack dropped in as the game's identity is not.
- **The main menu is a game front-end, not marketing.** The runner loads straight into the game's own menu; it offers the real front-end verbs the game supports — New Game, Continue/Load (save slots), Create/Choose character or class, Settings, Credits — each an authored screen in the game's art direction, not a landing page or raw scaffold. See [reference.md](reference.md#main-menu).
- **Settings is game-owned and reachable from a sensible place.** Every game ships settings as *its* settings — skinned and placed inline with its UI (main menu and pause), never the engine's stock face floated into a corner. Credits are a reachable in-game screen, not attribution buried in a build artifact.
- **Route the front-end with `useMenuRouter`, and generate the credits.** `useMenuRouter(root)` is the screen stack behind title → save select → settings → credits: `open`/`back`/`replace`/`reset`, `path` for depth, and Escape-to-back bound by default (`escapeToBack: false` when the game owns Escape). `menuStackReducer` is the same transition as a pure function. For credits, `creditsForSourceIds(ids)` (`@jgengine/assets/credits`) turns the pack ids a game declares to `buildCatalog` into licensed, attributed sections, `mergeCredits` folds them into hand-authored lines, and `CreditsScreen` renders the result HudTheme-skinned.
- **Skin the shared chrome with one `HudTheme` token object.** `hudThemeVars(theme)` emits the whole `--jg-*` vocabulary — bar fills and troughs, `HudFrame variation="themed"`, painted slots, the minimap ring, plus surfaces, edges, text, status colors, fonts, and rarity — so one theme spread on any HUD ancestor reskins the `@jgengine/react` primitives and the `registry/jgengine` blocks together. Author your own with `deriveHudTheme({ accent, surface })` or `hudTheme({ ... })`; `HUD_THEME_PRESETS` / `resolveHudTheme("<preset>")` are demo/scaffold starting points, never a game's identity. A component that needs a token no theme emits fails `check-hud-tokens` — add it to `HudTheme` rather than inventing a second vocabulary. Caller `style`/`renderItem` overrides still win.
- **Paint slot icons with `IconTreatment`, never render raw `itemId` strings.** It draws a `GameIcon` glyph over a school/element-keyed gradient with gloss, vignette, and optional count/keycap badges, reading the `--jg-slot-*` / `--jg-accent` tokens. `treatedItemIcon(itemId)` / `treatedActionIcon(action)` are ready adapters for hotbars and ability bars.
- **Player death gets a visible screen and respawn feedback — never a silent teleport.** Build the moment `game-design` requires: an authored death/downed overlay that reads the lethal event, communicates the consequence, and surfaces the way back (respawn/revive/restart). Drive it from `createDownedState` (`@jgengine/core/combat`) rather than a hand-rolled flag, and mount it inside `HudCanvas`.
- Layout and skin remain caller-controlled; shared primitives own reusable behavior, not product look.
- SSR-visible output is hydration-stable; round computed SVG values at the boundary.

## Shared-world interaction rules

- Every rejected verb displays its reason on the triggering surface. Use `useServerSession(transport, gameId)` for join lifecycle. Join failure blocks play with `JoinGate` and retry; returning `{ ok: false }` without feedback is incomplete.
- Placement previews display claim cost and affordability inline with `TerritoryOverlay`.
- `ChatPanel` owns collapsed/expanded state, own-message styling, Enter focus and Escape blur; standalone hosts pass `messages`, `userId`, and `onSend` (typed `{ ok, reason }`), while context-backed games use channel props. Use native inputs so shell typing-target suspension applies.
- Register Tailwind `@source` for consumed package files and inspect `bun run shoot <gameId> --mode ui` captures of join, chat, and placement feedback.

## Traps

- Do not put environment beautification, authored-scene rendering, or world placement here.
- Do not duplicate inventory, combat, quest, or selection state inside components.
- A static facsimile preview does not test the real UI; compose production components with fixtures.
- Visual quality is judged from rendered evidence, not component counts or prose.
- Shown HUD UI must fit the player viewport. `HudCanvas` checks every registered `HudPanel`, any element tagged `data-hud-window`, and its own direct children: a *visible* surface crossing a viewport edge gets a red dev overlay, a `console.warn`, and `data-hud-overflow` (which fails `bun run shoot`). Hidden or parked surfaces never trip it; deliberate bleed opts out with `data-hud-allow-overflow`. Mount custom windows inside `HudCanvas` (tag deeper ones `data-hud-window`) so the check can see them.
