# LLMville on Rune-native primitives

The port is complete. Every LLMville screen, the in-world HUD, the tablet and all its apps, the rack
menu and the world labels draw on the engine's Rune-native primitives (`RuneRoot`, `RuneView`,
`RuneLabel`, `RuneAction`, `RuneFor`, `RuneGlyph`, `RuneField`, `RuneWorldAnchor`, `RuneTransient`),
following the adoption recipe in PR #3117. `uiRenderer` is `"rune"`. There is no page UI left:
`style.css`, the page kit (`src/kit/`), Tailwind and `UiKitRoot` are gone, and
`grep -rnE 'className=|style=\{' games/llmville/src --include=*.tsx` finds only `BuildProp`'s
3D shape `style` prop.

## How the native UI is mounted

- `src/ui/theme.ts`: the one typed theme (`llmvilleTheme satisfies RuneTheme`), palette and fonts
  (Baloo 2, Nunito). `src/ui/kit.tsx`: text styles, panels, `Button`, `Field` (on `RuneField`),
  `Logo`, `Mascot`, `Sheet`, `Page`, `ProgressBar`, `Notices`, `LlmRoot`. `src/ui/shop.tsx`: store
  cards, price/research buttons, quantity steppers, tabs, the tutorial arrow. `src/ui/icons.ts`: line
  icons as `RuneGlyph` artwork.
- Rune allows one native surface per page, so each route has exactly one `LlmRoot`: menu pages get
  it from `ScreenFrame` (`src/screens/screens.tsx`); the game route's loading/error states and the
  in-world UI (`GameOverlay`: HUD, then `TabletLayer` with the tablet and rack menu) mount their own.
- World prompts and labels: the scene shares its camera projection (`WorldSceneFeed.projection`);
  `GameOverlay` passes it to `LlmRoot.project`. Avatar nameplates and the editor gizmo label register
  in `scene/worldLabels.ts`, move their position in place each frame, and the HUD draws them with
  `RuneFor` + `RuneWorldAnchor`.
- Drag and drop (rack slots, GPU job lanes) uses `RuneAction` `dragValue`/`acceptDrop`, with a
  labelled button for every drop so keyboard, pad and tests reach it. The map is SVG `RuneGlyph`
  artwork under a `RuneAction` that pans on drag, zooms on adjust and claims on tap.
- World chat's field has `autoFocus`, so the Enter that opens chat leaves it ready to type.
- Screens with backend state split into a view (plain props) and a container that calls the
  Convex/auth hooks.

## Verification (headless, no browser)

- `src/ui/play.test.tsx` mounts the real screens and in-world UI with Convex and better-auth stubbed
  by a deterministic in-memory lab, presses actions by label (`onPress`), types through `RuneField`
  (`onEdit`/`onSubmit`) and checks lab state. It walks sign in (a wrong password first), lab creation,
  the HUD, chat send, the tablet (store research and buys, model license, rack install, GPU job,
  bills, stats, map, bot, storage placement), closing the tablet by handle and Back, Main Menu from
  tablet settings, menu settings (a toggle and a key rebind), the dashboard and rejoin, at 1280×720
  and 390×844.
- `proofs/runeUiFixture.tsx` samples any screen's native spec headless.

## Simplified in the port

- The `/dev/*` workbench routes (HUD, racks, bills, character previews) are removed; the play test
  and the fixture cover those states.
- `CreateWorldCustomizeScreen` (unrouted) and `StandalonePageShell` are deleted.
- The map claims cells by tap and drag; there is no hover price preview.
- The model reveal uses the mascot and sparkle glyphs instead of emoji: Rune has no emoji font yet.
