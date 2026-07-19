# JGengine UI — game presentation reference

This reference defines the required visual and interaction quality for JGengine games. The main `jgengine` skill owns engine architecture, hooks, input commands, and routing. This document owns what the interface looks like, how it is composed, how it responds, and how it is verified.

## The rule

A game must visually own its viewport **and its entire interface**. Presentation is game content: each title designs a custom HUD, menus, feedback, and art direction. It must not resemble a dashboard, landing page, documentation page, ordinary responsive web app, **or another JGengine game's default widget stack**.

The engine ships both headless data/layout/accessibility seams *and* good drop-in building blocks — inventory grids, toggleable windows, character sheets, bars, action bars. `@jgengine/react` offers all of them. Composing and reskinning those building blocks into this game's arrangement is using the engine correctly. What's incomplete is shipping a whole *unarranged, unskinned generic face* — a page that looks like a dashboard or another game's untouched default stack, with no art direction, terminology, or placement of its own.

HTML and React are valid implementation tools. Website visual grammar is not the default. Engine default chrome is not the default either.

## 1. Start with a concise UI art direction

Before implementing screens, write this short block:

```md
UI ART DIRECTION

Player fantasy:
Emotional tone:
Shape language:
Material language:
Typography roles: display / body / numerical / labels
Motion language:
Icon language:
Sound language:
Information hierarchy:
Forbidden patterns:
```

Keep it practical. It should directly influence layout, silhouettes, controls, timing, and materials.

Example forbidden patterns:

- generic rounded dashboard cards
- pill buttons
- long centered paragraphs during play
- ordinary two-column form layouts
- persistent keyboard-instruction grids
- multiple equally weighted bordered panels
- generic translucent mobile circles
- large website-style modals
- document-flow wrapping used as HUD layout

A theme is not complete when only colors and fonts change. It must also affect composition, geometry, spacing rhythm, borders, icons, animation, sound, information density, terminology, button construction, and touch controls.

## 2. Screen inventory and hierarchy

Identify the screens the game actually needs:

- boot/loading
- title or attract screen
- **main menu** (the game's front-end — see the Main menu section)
- mode selection
- character create / character select where the game has classes, characters, or profiles
- onboarding/tutorial
- gameplay HUD
- pause
- settings
- credits
- map/inventory/dialogue where relevant
- victory/results
- failure/retry

For each screen, define:

- the player’s primary question
- the primary action
- the most important information
- what can be hidden
- what belongs in-world instead of in the HUD

### HUD tiers

**Tier 1 — immediate action and survival**
Health, timer, current target, ammo, danger, capture state.

**Tier 2 — short-term decisions**
Objective progress, route progress, cooldowns, combo, pursuit distance.

**Tier 3 — reference information**
Full map, inventory, controls, schedule, mission details, lore.

Tier 1 is immediately readable. Tier 2 is quieter. Tier 3 is usually hidden until requested.

Do not style every datum as an equally important bordered box.

## 3. Full-viewport game composition

The active game should behave like an application mode:

- own the full viewport
- avoid document scrolling
- avoid site navigation and marketing chrome during play
- respect safe-area insets
- keep exit/settings/fullscreen controls minimal
- separate world, HUD, controls, screens, and system overlays

Recommended layer contract:

```tsx
<GameHost>
  <WorldLayer />
  <HudLayer />
  <ControlLayer />
  <ScreenLayer />
  <SystemLayer />
</GameHost>
```

- `WorldLayer`: game renderer
- `HudLayer`: non-blocking gameplay information
- `ControlLayer`: touch/input surfaces
- `ScreenLayer`: title, pause, settings, tutorial, victory, failure, transitions
- `SystemLayer`: exit, fullscreen, engine settings, devtools

Do not place unrelated interface pieces into one ordinary DOM flow.

## 4. Explicit game layout modes

Do not rely on generic responsive wrapping. Compose explicit modes such as:

- desktop-wide
- desktop-compact
- mobile-landscape
- mobile-portrait

A mobile layout is not a shrunken desktop HUD.

On mobile:

- reserve thumb-control zones
- keep critical HUD out of those zones
- hide keyboard legends
- reduce persistent information
- move Tier 3 information behind contextual panels
- respect browser and device safe areas
- support portrait only when intentionally designed
- otherwise show a polished rotate-device state

All viewport anchoring should live in the game’s top-level UI composition file. Child components own their internal layout, not their screen position.

### Design-resolution fit (`platforms` + `hudFit`)

Design-resolution fit is on by default for every game: each `HudCanvas` auto-scales from `hudFit.designSize` (default 1600×900) down to the live viewport, clamped by `hudFit.minScale`/`maxScale` (default 0.4–1), so the authored layout shrinks instead of overflowing a phone. No declaration needed. `hudFit.mobile` overrides the fit on compact displays only — tune the phone presentation there instead of hand-rolling media queries. The player's Graphics → UI scale setting multiplies the computed scale on every platform. Declaring `platforms: ["web"]` (without `"mobile"`) opts a desktop-only game out; its compact displays keep the legacy fixed 0.85 zoom.

**Overflow is an error, not a style note.** `HudCanvas` measures every `HudPanel` against the viewport at runtime; offenders land in a `data-hud-overflow` attribute (and a console warning), and `bun run shoot <game> --device mobile` (or `both`) exits non-zero naming the escaping panels. A game is not mobile-done while shoot reports HUD OVERFLOW.

**Authoring placement lives in the editor.** HUD panel placement is authored from the scene editor's **HUD** mode (F2+E → **HUD** toolbar button), not a separate devtools chord — the button mounts the game's real `HudCanvas` over the frozen world with drag/resize editing on. Dragging a panel writes an undoable `setUiPanel` patch into the scene document's `ui.panels` section (the same document the `canvas_move_panel` / `canvas_resize_panel` RPC verbs still target), so authored layout ships in `editor.scene.json`. The author's canvas **Done** button (or Esc / F2+C / F2+E) leaves HUD mode. Per-panel resize axes come from the panel `type`'s `registerHudPanelType` spec.

### Phase-gated HUD visibility (`showDuring`)

`HudCanvas` and `HudPanel` take an opt-in `showDuring?: GamePhase[]` — the element renders only while `gamePhase` is one of the listed phases (`"menu" | "playing" | "paused" | "ended"`), so a game hides its HUD under menu/end overlays without hand-rolling a phase check. Omit it for the default always-visible behavior. Gate the whole HUD with `<HudCanvas showDuring={["playing"]}>`, or keep a single results panel up with a per-`HudPanel` value. The read degrades to `"playing"` when the component renders outside a `GameProvider` (component showcases, previews), so it never throws there.

### Shared viewport allocation (`GameViewportProvider`, region collision)

The shell allocates the live viewport once — visual viewport, safe-area insets, orientation, and layout mode — and hosts a **layout registry** every UI subsystem publishes its occupied rectangle to. This replaces "every subsystem independently claims an edge" (the mobile-overlap smell). It is wired automatically for every game; author against it, don't rebuild it.

- **The mode** is one of `desktop-wide | desktop-compact | mobile-landscape | mobile-portrait`, resolved from the live `visualViewport` + coarse-pointer + `platforms`. Read it with `useGameLayoutMode()` (or `useGameViewportLayout()` for the full geometry: `mode`, `orientation`, `safeArea`, `controlZones`, `gameplayRect`). Both degrade to a sane desktop default outside the provider, so previews never throw.
- **Live CSS variables** are published on the provider root: `--jg-viewport-*`, `--jg-visual-viewport-*`, `--jg-safe-{top,right,bottom,left}`. Use them (with `100dvh` fallbacks) instead of assuming `100vh` equals the visible area on mobile Safari.
- **Touch controls reserve real rectangles.** The engine measures the joystick / action-cluster / utility zones at runtime (ResizeObserver, not guessed percentages) and registers them as `control` regions. `HudCanvas` already lifts bottom-anchored panels above the dock via `--jg-hud-dock-clearance`; the registry additionally makes any residual overlap a hard error.
- **Collision is detected, not hoped for.** A `HudPanel` inside a `HudCanvas` registers as a `hud` region automatically. `bun run shoot <game> --device mobile` / `mobile-landscape` reads a `data-jg-layout-collision` attribute and exits non-zero naming both colliding regions (e.g. `throttle ∩ radio (4270px²)`) — the same failure discipline as HUD overflow. In dev the colliding elements also carry `data-jg-collision` for outlining. Opt an intentional overlap out with `allowOverlapWith` / `collisionGroup`, or a soft `mobileBehavior="transient"`.

### HUD priority + mobile behavior (`HudPanel`)

Declare intent, not just CSS. `HudPanel` accepts:

- `priority?: "critical" | "secondary" | "tertiary"` — the Tier from §2, surfaced to tooling. Critical stays visible; tertiary folds away first.
- `mobileBehavior?: "persistent" | "compact" | "icon" | "transient" | "hidden" | "sheet" | "modal"` — `"hidden"` unmounts the panel on phones (move that Tier-3 readout behind a contextual action instead); `"transient"` softens its collision policy for a fleeting line; the rest tag the element (`data-hud-mobile-behavior`) for the game's own responsive CSS. Keep these game-authored and lightly styled — this is a placement contract, not a website design system.

The game still owns the genre-appropriate composition; the engine owns the geometry and the failure gate.

### Mandatory orientation (`orientation`)

A game declares its phone-orientation contract on `defineGame({ orientation })`:

- Legacy `"landscape"` / `"portrait"` stays **advisory** — a dismissible rotate hint, never a gate.
- The object form `{ mobile: <rule> }` is the strict contract, where `<rule>` is `any` (both) · `portrait` / `landscape` (advisory preference) · `portrait-required` / `landscape-required` (hard gate) · `unsupported` (no phone support).

For a driving/landscape game: `orientation: { mobile: "landscape-required" }`. When the device is held the wrong way the shell shows an **engine-owned `RotateDeviceScreen`** (polished, safe-area-aware, `visualViewport`-sized, reduced-motion-respecting, themeable via `--jg-*`) above every layer, **suppresses game input, freezes the simulation, and unmounts the HUD and touch controls** — gameplay never runs behind the gate. The gate is derived live from orientation, so rotating back to a valid orientation resumes automatically with no stuck-paused state. Never re-implement a "rotate for best experience" toast; declare the requirement and the engine owns the rest.

## 5. Change the visual grammar

Avoid making every element the same rounded translucent rectangle.

Use genre-appropriate structures:

- clipped corners
- irregular silhouettes
- image-backed frames
- mechanical plates
- radial interfaces
- ribbons and tabs
- gauges and meters
- emblems and decorative corners
- notches and edge anchors
- diegetic objects
- world-space prompts
- asymmetrical compositions
- masks, textures, layered borders, and strong focal elements

Practical rule: no more than roughly 20% of a normal gameplay screen should resemble an ordinary web card or modal.

Every persistent panel must justify why it exists, remains visible, has that shape, and occupies that position.

## 6. Game UI primitives

Prefer small headless or lightly styled primitives over a giant universal design system. Useful concepts include:

- `HudAnchor`
- `StatReadout`
- `Meter`
- `ObjectiveTracker`
- `ActionPrompt`
- `Reticle`
- `MinimapFrame`
- `DialoguePlate`
- `Countdown`
- `BossBar`
- `ItemPickup`
- `DamageIndicator`
- `PauseScreen`
- `ResultsScreen`
- `VirtualControlZone`
- `ScreenTransition`

A primitive should expose game-oriented choices such as shape, material, urgency, placement, hierarchy, entry motion, icon treatment, compactness, and diegetic-versus-overlay presentation.

**Portable minimap adoption.** Existing React games pass `MarkerView[]`, a
`MarkerSource`, or their existing `MarkerSet` to `Minimap`/`Compass`/`WorldMap`.
Use `createMarkerSource` (`@jgengine/core/world/markers`) to cache a projection
from an external ECS/store snapshot; it needs no `GameProvider`, Three.js, or
React Three Fiber. Follow [the portable minimap recipe](recipes/portable-minimap.md)
instead of mirroring external entities into `createMarkerSet`.

**Minimap** is already shipped, not hand-rolled: `Minimap` / `WorldMap` / `Compass` from `@jgengine/react/map` render a framed SVG minimap over a `MarkerSet` (`createMarkerSet`, `@jgengine/core/world/markers`) and optional `FogField`, projecting via `@jgengine/core/world/minimap` (`projectToMinimap`, `headingToBearing`, edge-clamp). A game feeds flat props (`markers`, `center: [x,z]`, `worldRadius`, `size`, `facingYaw`, `rotate`) and repopulates the marker set each HUD tick from live entities — no custom canvas painter. `MinimapPanel` (same module) composes zone-label + clock header slots and a `Compass` strip around a `Minimap` — pass `zoneLabel`/`clock` nodes (e.g. from `useGameClock().calendar`) and `showCompass`/`compassProps`; omit either header slot and it collapses, `showCompass={false}` drops the strip. **Baked terrain background**: to draw the authored terrain under the markers, pass `background={document.minimap?.background}` and `mapBounds={document.minimap?.bounds}` to `Minimap`/`WorldMap` (or `MinimapPanel`, which forwards both through) — the editor's `bake_minimap` action stores a top-down terrain PNG + world bounds on `EditorDocument.minimap` (see `jgengine-editor`), and runtime reads that stored PNG with no re-rasterization. Both are undefined until baked, so an unbaked game renders the plain map unchanged. Rolling a **custom** minimap around your own course/route content (not the full `Minimap` panel)? `MinimapChrome` is the headless chrome layer other games were re-drawing by hand: nest it inside your own `<svg>` for the ring `frame`, and pass `markers: MinimapChromeMarker[]` (`{ id, position, heading?, color?, radius?, glyph? }`) for edge-clamped dots that draw as a rotated arrow whenever a marker carries a `heading` (the compass-arrow / player-blip layer) — never hand-roll `clampToMinimapEdge` + a `<polygon>` again. **Nameplates**: `WorldNameplates` (`@jgengine/shell/world/WorldHud`) billboards a name + optional 78×6px HP bar over every nearby non-local entity — turn it on declaratively via `defineGame({ nameplates: { roles, maxDistance } })` (mirrors `worldHealthBars`) rather than mounting it by hand; skin every part via `className`/`data-*` slots (`nameplateClassName`, `nameClassName`, `barClassName`, `fillClassName`) or swap the whole markup with `renderNameplate`. When the game does **not** run the JGengine entity store — it owns enemies in its own array/ECS/store — reach for the data-first **entity-frame** seam instead of `WorldNameplates`: `EntityFrames` (`@jgengine/react/entityFrames`, `entity-frames` capability) takes a caller-owned `{ id, worldPosition, ... }[]` plus a `project` (world→screen) and a `renderFrame` that composes the shipped `HealthBar` + a name (reskinned via `barTokens`/`HudTheme`); it owns only the reusable behavior — projection offset, off-screen/behind-camera culling, and nearest-on-top stacking (`layoutEntityFrames` is the pure, unit-tested core). An R3F game gets the projector for free from `WorldEntityFrames` / `useWorldProjection` (`@jgengine/shell/world/WorldEntityFrames`), which samples the live camera and composes the react primitive — overhead nameplates/health bars from your own array in a few lines, no store mirroring. Follow [the overhead entity-frames recipe](recipes/overhead-entity-frames.md). **Selection rings**: `WorldObjectHighlights` (`@jgengine/shell/world/WorldHud`) draws a ground ring over every `ctx.scene.object.selection`-ed placed object — the object-layer counterpart to `WorldEntityBars`/`WorldNameplates`; mount it once in the game's scene (`color`/`radius`/`y` props, `radius` otherwise derived from the object's catalog `halfExtents`) instead of hand-rolling a selection highlight through `WorldOverlay` against external state. **Playing cards** are already shipped, not hand-rolled: `CardFace` / `StackedPile` / `CardStack` (with `Suit`, `Rank`, `PlayingCard`) from `@jgengine/react/cards` render a French-deck face (rank + suit pips, patterned back when `faceDown`) and an overlapping fan. `StackedPile` composes the existing drag system (`useDragLayer`/`DraggableCard`/`DropZone`) — pass a `layer` for drag and `dropId` for a drop target; `CardStack` binds a fan to a headless `CardPileState` zone (`@jgengine/core/cards/cardPile`). Never draw cards on a canvas or reinvent pointer handling. **Swing timer**: `swingTimerState(player, target, prevPeriod, prevTimer)` (`@jgengine/core/ui/swingTimer`) is the pure, parameter-in/next-state-out core for a melee swing bar (recovers period on the reset edge; hidden unless auto-attacking a live non-object target) — thread the returned `nextPeriod`/`nextTimer` back via refs, render a thin `Meter`.

**HUD widgets split into three reusable layers** — data, renderer, chrome — so a second presentation drops in without a forked widget. **Chrome**: `HudFrame` (`@jgengine/react/hudFrame`, `hud-frame` capability) is the single framed-panel primitive — `<HudFrame variation="glass"|"plate"|"retro"|"themed" shape="rounded"|"circle"|"square" title aside padding width style>` renders a `data-hud-frame` div with an optional small-caps `title`/`aside` header; `glass` is byte-identical to the built-in widgets' dark-glass panel, `plate` a heavier opaque plate, `retro` a hard black-outlined frame, `themed` driven by the `--jg-frame-*` `HudTheme` tokens (the token-skinning path SKILL.md promotes). Need only the CSS on your own element? spread `hudFrameStyle(variation, shape)`. Reach for it instead of hand-rolling a bordered panel `<div>` per widget. **Renderer**: `MinimapTrack` (`@jgengine/react/map`, `minimap-track-hud` capability) is a structurally-different second minimap — a horizontal linear progress rail (vs the radial `Minimap`) with colored zone `spans` and gate/exit/player `pips` placed by 0..1 fraction, driven by core `trackFraction([x,z], { from, to })` (`@jgengine/core/world/minimapTrack`, `minimap-track` capability — the 1D analogue of `projectToMinimap`). It reads no store; the caller supplies fractions. Use it for corridor/route progress; use the radial `Minimap` for open worlds — both share `HudFrame` chrome. **Data**: `useLiveMarkers(rebuild, { intervalMs?, deps? })` (`@jgengine/react/hooks`, `live-markers` capability) returns a self-ticking `MarkerSet` that each HUD tick clears and re-runs your `rebuild(markers, ctx)` against the live scene — replaces the hand-rolled `useState` ticker + `useEffect` + `createMarkerSet` + `markers.clear()` + rescan boilerplate; feed the returned set straight into `Minimap`/`MinimapPanel`.

**Heat/streak gauges** are already shipped, not hand-rolled `clamp(value/max)`: build the gauge with `createEventMeter` (`@jgengine/core/stats/eventMeter`, `event-meter` capability — ult/adrenaline `"hold"` mode or streak/combo `"reset"` mode over tagged event gains) and bind it to a component with `useEventMeter(meter)` (`@jgengine/react`, `event-meter-hud` capability) — it self-ticks a heartbeat and returns `{ value, fraction, tier, ready }` for a `Meter`/`BossBar`-style fill, no manual `setInterval` polling of `meter.value()`.

**Action cards / command bars / ability bars** are a headless data → renderer → chrome split, not a hand-rolled cooldown grid. The model is caller-owned data: build `ActionDef[]` (`@jgengine/core/ui/actionModel` — `id`, optional `label`/`icon`/`hotkey`/`group`/`active`/`disabled`, plus `cooldown` via `actionCooldown`/`actionCooldownFromFraction` and `costs` via `actionCost`); `resolveAction`/`resolveActionCollection` compute `enabled` + ordered blocking `reasons` (cooldown, then unmet cost, then caller reasons). React side (`@jgengine/react`): `useActionBar(defs, { columns, wrap, hotkeys, onActivate })` is the DATA/HOOK layer (`action-bar-model` — focus, hover, `moveGridFocus` keyboard/controller grid nav, `actionByHotkey` routing); `ActionBarChrome` is the composable RENDERER (`action-bar-chrome` — `role="toolbar"`, roving tabindex, `layout: "grid" | "list"`, swap per-item chrome with `renderItem`); `ActionButton` is the default item chrome (`action-button` — radial cooldown wipe, cost line, `Keycap` hotkey, full rest/hover/focus/pressed/active/disabled states, `aria-disabled`/`aria-pressed`/`aria-keyshortcuts`); `ActionBar` is the batteries-included skinned default. A radial UI ignores the chrome and lays out `ActionButton`s from the model. Bind a combat `AbilityKit` with `actionFromAbilitySlot(slot, { label, icon, hotkey, resourceId })` over `useAbilitySlots`. Tooltips use the shared seam (no more DOM `title=` hand-rolling): `actionTooltip(resolved)` → `TooltipContent`, rendered by `ActionTooltip` inside a `Popover` (`popover` — pure `placePopover` viewport flip/clamp math from `@jgengine/core/ui/tooltipModel`, SSR-safe). **Selection panels / party frames / squad summaries** are the same split for entities: feed caller-owned `EntitySummaryDef[]` (`@jgengine/core/ui/selectionModel` — `id`, `name`, `kind`, `icon`, `vitals`, `tags`) to `summarizeSelection` (primary focus, `kind` buckets, `grouped` past a threshold, `selectionWindow` virtualization) or the `useSelectionView` hook (`selection-model` — focus stepping + keyboard nav). Renderers (`@jgengine/react`): `EntityPortrait` (`entity-portrait` selectable tile + health strip), `EntitySummary` (`entity-summary` primary detail with `VitalBar` rows), `SelectionGroupChip` (`selection-group-chip` icon+count), `SelectionCollectionChrome` (`selection-collection` portrait strip that flips to group chips when large, roving tabindex), and `SelectionPanel` (`selection-panel` batteries-included primary-summary-beside-strip default). Keep layout, dimensions, hotkeys, catalog-id mapping, renderer, and chrome caller-owned — the defaults are examples, not fixed RTS rules; never fork the model to reskin.

**Inventory grid** is already shipped, not hand-rolled: `<InventoryGrid inventoryId columns>` (`@jgengine/react`, backed by the `useInventoryGrid` hook) is a drop-in NxN grid bound to a live inventory — it renders the bound inventory's slots and wires drag-to-move / swap / stack / split through the built-in `inventory.move` / `inventory.split` commands, so a bag is one element plus a reskin, never a re-derived slot matrix over raw divs. It is distinct from the atomic `EquipmentSlots` / `WeaponSlots`, which are single-slot targets for paperdoll and equip layouts — reach for `InventoryGrid` for the bag/backpack surface and the atomic slots for the worn/equipped layout. Reskin via `className`/`data-*` slots and HudTheme tokens; the mechanics stay caller-agnostic.

**Toggleable game windows** are already shipped, not hand-rolled open/close state: `usePanels(defs)` + `<PanelHost>` + `<Window>` (`@jgengine/react`) over the headless `@jgengine/core/ui/panelModel` are THE way to build openable windows — bag (`B`), character (`C`), spellbook, quest log — with keybind toggles, drag-to-move, close buttons, ESC-to-close, and z-stack ordering all handled. Declare each window in `defs` (id, keybind, title), mount one `<PanelHost>`, and render each panel's body inside a `<Window>`; the game owns the body content and skin, the model owns focus/stacking/keybind wiring. Never re-derive window toggling from local `useState` booleans and hand-rolled keydown listeners.

**Character sheet / paperdoll** is already shipped, not hand-rolled: `<CharacterSheet>` / `<Paperdoll>` / `<StatList>` (`@jgengine/react`) compose the paperdoll equip layout (worn `EquipmentSlots` arranged around a portrait) and the derived-stat readout into one window body. `Paperdoll` is the equip-slot arrangement, `StatList` the derived-stat rows, `CharacterSheet` the batteries-included default that pairs them — the game composes and reskins them (slot layout, stat labels/terminology, skin) rather than re-deriving a paperdoll from raw divs and manual stat math.

**Toast/announcer stacks**: two supported sources, pick the one that matches where the message comes from. An engine event already bound onto `ctx.game.feed` (kill feed, loot log, quest update) renders with `@jgengine/react`'s `ToastStack({ action })` directly. A game-raised one-off message with its own lifetime (boss-intro banner, objective callout) belongs in a `createToastQueue` (`@jgengine/core/game/toasts`, `toast-feed` capability — see `jgengine-gameplay`) rendered from `queue.list()`; don't reimplement the append-cap-plus-TTL-prune loop as a local `Toast`/`pushToast` pair.

Do not create a primitive whose only value is wrapping a `div` with border radius.

## 7. Complete interaction states

Every interactive element needs intentional states:

- rest
- hover where applicable
- keyboard/controller focus
- pressed
- selected
- disabled
- success
- failure
- warning

Do not communicate all states with background-color changes alone. Use appropriate combinations of:

- scale compression
- position shift
- edge or glow response
- mask movement
- icon movement
- text response
- brief particles
- sound
- haptics when supported
- controlled shake only when appropriate

Focus must look authored while remaining accessible. Menus should support keyboard/controller-style focus navigation when practical.

## Rendering — post-processing, lighting, shadows

**Default look is cinematic (#773).** A 3D game reads lit-like-a-shipped-game out of the box: unset `look` (or `look: "cinematic"`) composes the existing sky/lighting/post knobs — a real day sky with a view-following shadow-casting sun + hemisphere fill, and a tuned tone-map/bloom/gentle-SSAO/vignette post stack. One field opts out: `defineGame({ look: "flat" })` restores the bare ambient+directional rig (the old default) with no post. The preset only fills knobs you didn't set — any explicit `lighting`/`backdrop`/`postProcessing` always wins, and it never adds a sky when the world already declares one. `resolveGameLook` (`@jgengine/core/render/lookPreset`) is the pure resolver behind it — expand a `look` into concrete `{ lighting, backdrop, postProcessing }` and assert on the result in a `bun test` (the post/sky layers are not visible to `summarizeEnvironment`). HUD-presentation and no-camera games are unaffected.

The post chain itself is never hand-wired render passes. Set `defineGame({ postProcessing })` (`PostProcessingConfig` from `@jgengine/core/render/postProcessing`) and the shell mounts an `EffectComposer` and owns the render: RenderPass → AO → Bloom → tone-map output → Grade. Each stage is a config object, `false` to skip, or omitted for its tuned default:

- `toneMapping: "aces" | "agx" | "reinhard" | "cineon" | "linear" | "none"` (default `aces`) + `exposure`.
- `bloom: { strength, radius, threshold }` — HDR glow around bright pixels (defaults 0.32 / 0.55 / 0.85).
- `grade: { lift, gain, gamma, saturation, vignette, grain }` — display-space colour grade: cool-shadow/warm-highlight split, vignette, animated film grain.
- `ao: { radius, intensity, distanceFalloff, blend }` — ground-truth ambient occlusion; heavier than the rest, omit or `false` on low-end targets.

**Orbit camera occlusion:** the third-person orbit rig takes `camera: { collision: { enabled, padding?, minTargetDistance? } }` — a spring-arm that raycasts target→camera each frame and pulls the boom in past walls/terrain so the camera never clips inside geometry. Off by default (unchanged chase feel); enable it for any world with interiors or dense structures.

Lighting is `defineGame({ lighting })` (`LightingConfig`): ambient / hemisphere / directional, replacing the shell's default lights when set. A `DirectionalLightingConfig` with `castShadow` takes `shadowMapSize`, `shadowCameraSize`, `shadowBias`, `shadowNormalBias` for crisp contact shadows. Sky-lit worlds (a `sky()` world feature) get a high-res sun whose shadow camera follows the view each frame, so grounded shadows stay sharp under the player anywhere in a large world.

## First-person viewmodel, WorldOverlay props, render cues (#542)

Three composable-chrome seams for FPS/TPS polish — a placement hook plus a good default, never a forced look:

- **Custom viewmodel.** `defineGame({ viewmodel })` supplies a component rendered inside the shell's camera-locked, muzzle-tracked anchor in place of the built-in three-mesh gun — read when the active rig is first-person. It receives `ViewmodelProps` (`@jgengine/shell/camera`): `{ cuesRef }`, a live `MutableRefObject<EntityRenderCues>` for the followed entity — read `cuesRef.current` inside your own `useFrame` to drive bob/recoil/reload poses; never store it as render state (it updates every frame). `camera.firstPerson.viewmodel: false` renders no viewmodel at all regardless of `defineGame`'s `viewmodel` field — the explicit opt-out always wins. `readFirstPersonMuzzle(target: THREE.Vector3)` (also `@jgengine/shell/camera`) writes the live muzzle world position into `target` and returns `false` when no viewmodel is mounted — the seam for muzzle-flash lights, tracer origins, or shell casings.
- **`WorldOverlay` receives `{ ctx }`.** `defineGame({ WorldOverlay })` components take `WorldOverlayProps` (`@jgengine/core/game/playableGame`) — `ctx: GameContext` handed directly, no extra hook or module-global workaround needed to reach engine state from canvas-layer VFX.
- **Render cues for any custom rig.** `useEntityRenderCues(instanceId, tuning?)` (`@jgengine/shell/render/useEntityRenderCues`) returns the same `cuesRef` the viewmodel gets, for a custom `renderEntity` component: velocity-driven `bobPhase`, `firing`/`recoil` from `ctx.game.playEntityAnimation(instanceId, "fire")`, `reloading` from `"reload"`/`"reloadEnd"`, `hit` from `combat.hitReaction`, `dead` from `entity.died` — no diffing the parent group's position, no game-side module map for attack timing. `RenderCueTuning` (`@jgengine/core/combat/renderCues`) overrides the bob rate / recoil decay / pulse durations; see `jgengine-combat`'s `combat/renderCues` for the underlying pure math.
`@jgengine/shell/terrain`'s `ProceduralGround`/`CarvedTerrain`/`GrassField` are the game-facing terrain surface; the height-field math underneath (`arenaField`, `flatField`, `fractalNoise`, `resolveGroundStep`, `valueNoise`, `withNormal`, re-exported from `@jgengine/core/world/terrain`) and `GamePlayerShell`'s physics helpers (`applyMotionImpulses`, `nearbyObstacles`, `resolvePhysicsTuning`, `hasEnvironmentTerrain`, sourced from `core/runtime/motionIntents` / `core/movement`) are internal building blocks the shell composes for you — reach for `defineGame({ movement, world })` and the ground primitives above instead of calling these directly.

## Main menu

**The main menu is the game's front-end, not a marketing splash.** The hosting website/runner loads straight into the game's own menu (see rejection criteria) — there is no engine-supplied main menu, and the page must not render a title card, tagline, or "enter game" button of its own. What the player first sees is a screen the game designs and skins in its own art direction: the same shape/material/type language as its HUD, not a landing page, hero banner, feature list, or store page. Homage/credit lines are fine as small print; the screen's job is to start play, not to sell it.

Compose it from the game's own markup over the headless `StartScreen` (`@jgengine/react`, `start-screen` capability) — a full-bleed `data-jg-menu` overlay that centers your content and offers an opt-in settings corner; it imposes no look. Menu rows are the game's own buttons and focus handling restyled into its chrome; the shipped pieces to compose in are `ControlsList` (`@jgengine/react`) for the control legend and `KeyHint`/`Keycap` for key badges (`KeyHint` already renders nothing on a coarse pointer) — never shipped as raw scaffold.

**The front-end entries, when the game has them.** A menu is more than one Start button. Offer the real front-end verbs a player expects, gated to what the game actually supports:

- **New Game** — begin a fresh run. When a save exists, keep it distinct from Continue rather than silently overwriting.
- **Continue / Load** — resume the most recent save, and (when the game keeps more than one) a **Load** entry that lists save slots. Save slots are `createSaveStore` instances keyed by slot id; read them reactively with `useSaveStore` (`@jgengine/react`, offline `localSaveBackend` or cloud `remoteSaveBackend` — same hook, different backend). Disable Continue/Load with a real disabled state when there is nothing to resume; do not hide the verb entirely.
- **Create Character / Choose Class** — when the game has characters, classes, loadouts, or profiles, the create/select flow lives here as an authored screen, not a stray dropdown. Keep the character/roster model serializable and game-owned (persist it through the game's save store); the menu is its presentation. Do not reach for a genre "class picker" preset — compose the choices this game actually offers.
- **Load Character / Roster** — choose an existing profile or party when the game persists more than one.
- **Settings** — reachable from the main menu, always (see Settings menu below). This is one of the two canonical places settings live; pause is the other.
- **Credits** — a real, reachable screen. Player-facing games owe HUD and website credit (see governance) and record borrowed work in `CREDITS.md`; the menu's Credits entry surfaces that in-game. Read it from the game's own credits data — do not bury attribution only in a build artifact.
- **Quit / Back to site** — where it makes sense for the host.

Only show entries the game supports, and disable (don't delete) verbs that are temporarily unavailable so the menu shape stays legible. Character create/select and Credits are their own authored sub-screens reached from the menu, composed to the same art direction — not modal form dumps.

## Settings menu

**Settings is game-owned and reachable from a place that makes sense.** Every game ships settings — but as *its* settings, skinned in its own art direction and placed inline with its own UI, never the engine's stock face dropped into a corner. The two canonical homes are the **main menu** and the **pause** screen; put the entry where the player would look, not floating over live play. The engine gives you the menu's contents and behavior for free — you own its skin, layout choice, and placement. If the default four layouts do not match the game, drive `useSettings()` and render the rows entirely inside your own chrome.

**Settings menu (themed, four layouts, no forced chrome).** The engine builds the whole menu for free — Sound (master + per-bus volume), Graphics (quality/dpr + shadows), Gameplay (FOV slider, default 40–120), Controls (per-action key rebinding, inline click-to-rebind, persisted) — from the game's `audio.buses` and `input` map. What it does **not** do is bolt a fixed gear onto every game: **there is no auto trigger.** You place the entry yourself so it lives *inline with your game's own UI*, never a stray corner overlay. Drop `<SettingsTrigger className=…>` (from `@jgengine/react`) anywhere in your HUD or menu — headless button, `className` for skin/placement, optional `children` to replace the default gear glyph, renders nothing when there's nothing to show. Or call `useSettings().open()` from your own control. Tune the menu via `defineGame({ settings })` (`GameSettingsConfig` from `@jgengine/core/settings/settingsModel`):

- `variant: "panel" | "sheet" | "sidebar" | "fullscreen"` — the layout + skin (default `panel`; `sheet` is the mobile bottom-sheet). All four are fixed-size (no shrink-to-content jitter) and read the game's `--jg-*` theme tokens, falling back to a neutral dark skin.
- `actions: SettingsActionDef[]` — game-state actions (Restart, Quit to menu, …). They become the **first "Game" tab, shown before anything else** — the home for buttons that used to float over the HUD. Each: `{ id, label, kind?: "default"|"danger", description?, run(ctx) }`; the menu closes right after `run`.
- `hideBindings: string[]` — input actions to drop from the rebindable Controls list. A game-state key like `restart` belongs in `actions`, not the rebind grid — hide it here so it stops showing up as a "rebindable" control.
- `surface: "quick"` — additionally mount compact on-screen volume/graphics buttons. Omit for none. `settings: false` — off entirely.
- `extra: GameSettingDef[]` — append rows to any category, built-in *or a brand-new one* named by `category` (any string). Each row: `{ id, label, category, kind: "slider"|"toggle"|"select", default, min?, max?, step?, options?, onChange?(value, ctx) }`.
- `categories: SettingCategoryDef[]` — declare custom category tabs, or relabel/reorder built-ins (`{ id, label, order? }`).
- `hide: SettingCategory[]` — drop built-in categories.

**Game-state controls go in `actions`, never a floating button.** Restart/quit/new-game buttons stapled to the bottom of the HUD are the anti-pattern — declare them as `actions` (first Game tab) and place a `<SettingsTrigger>` inline. A contextual button on a win/lose *results* card is fine; a persistent game-state button pinned over live play is not.

**Present it any way you want.** `useSettings()` (`@jgengine/react`) returns the live controller — `{ categories, actions, variant, surface, isOpen, open, close, setOpen }` — so a game can drive its own pause-menu button, or render `categories`/`actions` (rows carry `value`/`set`/bounds, keybinds carry `rebind`/`reset`) entirely inside its own HUD. `useHasSettings()` gates a custom entry; `useSetting(id, fallback)` reads/writes one value. Set a slider's `min`/`max` explicitly — an omitted range collapses the thumb to 0/1.

## 8. Motion and game feel

Add purposeful motion for:

- screen entry and exit
- confirm and cancel
- warnings
- score increases
- objective updates
- damage
- victory and failure
- countdowns
- pause
- item pickup

Motion should be brief, readable, interruptible when necessary, coordinated, consistent with the game’s art direction, and respectful of reduced-motion settings.

Do not animate everything constantly. Motion communicates hierarchy, cause and effect, urgency, and state changes.

**Camera shake.** `@jgengine/shell/camera`'s trauma channel (`useCameraShake`/`cameraShake`) is amplitude/decay by default (`.shake(amplitude, decayPerSecond?)`, sampled with `shakeOffset`'s `maxOffset`/`maxRoll`/`exponent`/`frequency`). `traumaShake(trauma, time?)` is the calibrated trauma² curve (offset ∝ trauma²) behind `@jgengine/core/combat/hitReaction`'s `impactPresets` — decay 1.4/s, max offset 0.55, max roll 0.1 rad, noise freq 32×t (`CALIBRATED_TRAUMA_SHAKE_DECAY_PER_SECOND`/`_MAX_OFFSET`/`_MAX_ROLL`/`_FREQUENCY`). `CombatCameraShake` (mounted once per world) already wires `combat.hitReaction`'s `trauma` field into the channel at that calibrated decay automatically — a preset-driven hit reaction shakes the camera with zero extra setup.

## 9. Mobile controls are genre-authored

Shared input mechanics may remain shared. Their visual treatment and arrangement must match the game.

Examples:

**Driving**
Steering region or wheel, accelerator, brake, handbrake, optional camera/map control.

**Stealth**
Movement zone, sneak/crouch hold, contextual interaction, temporary map/schedule control.

**Shooter**
Movement zone, aim region, fire/action cluster, weapon or ability controls.

**Puzzle/arcade**
Direct drag, tap, swipe, paddle region, or discrete directions. Do not add a joystick without a gameplay reason.

Requirements:

- never cover critical HUD information
- use the game’s shape and material language
- fade training labels after learning
- consider thumb reach
- preserve accessible target sizes
- visually respond to activation
- support optional scaling where appropriate

Do not use one generic translucent controller across all games.

**Shape, skin, and placement are data on `defineGame({ touch })`** — the engine derives a working dock from the input map, and you refine it without touching render code:

- **`shape`** per button (`TouchButtonSpec.shape`): `pedal | lever | trigger | wheel | square | circle | tab`. The capture layer draws each as its physical silhouette, so `brake` is a foot pedal and `handbrake` a pull lever instead of a labelled circle. Unset derives one from the action name (`brake`/`throttle`→pedal, `handbrake`/`boost`→lever, `fire`/`attack`→trigger, `steer*`→wheel, `spell*`/`slot*`/`item*`/`inventory`→square). Inventory and spell slots default to square tiles.
- **`image`** per button (`TouchButtonSpec.image`): any image URL or `data:image/svg+xml` URI drawn as the button face instead of the built-in silhouette — drop your own slot frame or spell plate behind a control; the icon/label still sits on top and press still scales/brightens it.
- **`anchor`** per button, or **`layout: { movement, actions, utility }`** per cluster: dock controls to any of `bottom-left | bottom-center | bottom-right | left | right | top-left | top-center | top-right`. `left`/`right` are vertical rails (MMO-style hotbars) — use them to spread controls across the whole viewport instead of one bottom bar. `bottom-left`/`bottom-right` keep the thumb-arc; other anchors stack.
- **`movement: { axis: "horizontal" }`** restricts the joystick to a steering-only zone, freeing throttle/brake to render as pedal buttons — the standard driving layout.
- **`style`** suggests a skin: `glass` (default translucent) · `arcade` (neon bezel) · `mechanical` (metal plate) · `minimal` (thin outline). A skin changes material and geometry, not only colour. The **player overrides it in Settings → Controls** ("Touch controls", persisted); leave it on `Auto` to honour the game's `style`. This is the four-variant chooser — never hand-roll a control-skin toggle.
- **Lifecycle actions never auto-dock.** Derivation skips `start`/`restart`/`reset`/`retry`/`pause`/`resume`/`menu`/`quit`/`exit`/`settings`/`options` — binding a `restart` key does *not* put a RESTART chip over live play (the same anti-pattern §274–283 forbids for HUD buttons, on the touch layer). These belong in `settings.actions` + a `<SettingsTrigger>` / pause menu. To dock one anyway, list it explicitly in `touch.buttons`.

Canyon Chase is the worked example: `movement: { axis: "horizontal" }` steering, `throttle`/`brake` pedals on the `right` rail, `handbrake` lever bottom-right, `style: "mechanical"`.

**`presentation: "hud"` games get 3D parity.** A pure-HUD game (no camera rig) now reaches the same input/audio seams as a 3D game:
- **Touch gestures** — the shell mounts a headless `TouchPlaySurface` in the hud branch too, so `touch.gestures` (swipe/tap) reach actions without the game hand-wiring pointer events on its own canvas. The visible dock stays game-authored per the rule above.
- **No phantom reservations** — camera action names (`turnLeft`/`turnRight`/`interact`/…) are reserved *only* when a camera rig is active, so a hud game may bind them directly instead of renaming to `steer*`.
- **Audio actually plays** — audio resumes on the first pointer gesture in hud games (not just 3D), and `playOneShot` self-resumes the suspended context. Trigger sound from anywhere holding `ctx` via `ctx.game.audio.play(soundId, at?)` / `ctx.game.audio.resume()` — the reachable seam over the shell's audio engine.

## 10. Progressive instruction

Do not leave large control grids visible during gameplay.

Prefer:

- contextual prompts
- brief onboarding
- first-use hints
- a controls screen
- pause-menu reference
- icons attached to actions
- progressive disclosure

Desktop keyboard legends must not appear on touch devices. Prompts should appear near the relevant action, object, or HUD region and clear when no longer useful.

The shared `KeyHint` (`@jgengine/react`, wrapping `Keycap`) already renders nothing on a coarse pointer, so route key hints through it instead of hand-rolling `<kbd>`. When a screen hand-rolls its own control grid or a `START — {key}` / `Press Enter` call-to-action, gate that text on `const { coarsePointer } = useDisplayProfile()` (`@jgengine/react`) — hide the keyboard legend and let the tappable button carry a plain label (`Start`, `Restart`). Never surface a bare "press E / press enter" line as the only way to advance; the button itself must be tappable.

The dev runner locks its own document (`overscroll-behavior: none`, `touch-action: manipulation`, no page zoom or rubber-band, no long-press text selection). Games never add scroll/pinch guards or `position: fixed` body hacks of their own; active play owns the viewport by default.

## 11. Reference directions for flagship games

### Clockwork Heist

Use gentleman-thief mechanical field-kit language: watch geometry, midnight enamel, aged brass, ivory paper, engraved labels, mechanical shutters, and an authored schedule timeline. The timer should feel like a clock. The schedule should be an on-demand pocket-watch or dossier panel. Touch controls should use brass/enamel construction. Restart belongs in pause, not permanently over the world.

### Canyon Chase

Use desert pursuit language: battered dashboard, analog instruments, radio display, route strip, warning lamps, and road-sign typography. Target gap should read as a pursuit gauge. Border progress should resemble an odometer, route strip, or mile marker. Driving controls should feel like steering, throttle, brake, and handbrake—not generic circles.

### Brick Breaker

Use arcade-cabinet language: bezel framing, CRT/vector treatment, arcade numerical readouts, attract mode, launch feedback, and brief level overlays that clear before play. Pause and results should feel like cabinet states, not web dialogs.

These games must remain structurally distinct, not recolors of one component set.

## 12. Accessibility and performance

Maintain:

- sufficient contrast
- readable text size
- keyboard navigation
- controller navigation where available
- reduced-motion support
- visible authored focus
- touch target sizing
- semantic labels where practical
- responsive scaling
- reasonable DOM and animation performance

Use blur, masks, textures, filters, and full-screen effects carefully, especially on mobile.

## 13. Screenshot verification is mandatory

Capture and inspect meaningful states:

- desktop title screen
- desktop gameplay
- mobile landscape
- mobile portrait where supported
- pause
- victory or failure
- an interaction prompt
- touch controls in active use

Inspect for:

- overlap and clipping
- weak contrast
- unreadable scale
- excessive cards
- website-like composition
- broken safe areas
- conflicting hierarchy
- browser chrome interference
- poor thumb reach
- keyboard instructions on touch devices
- inconsistent art direction

Revise after inspection. Typechecking is not visual proof.

## 14. Rejection criteria

Require revision when any of these are true:

- normal site navigation remains visible during active gameplay
- the player must scroll the page to use the game
- the game is presented inside a normal content card
- essential HUD is covered by touch controls
- controls overlap each other
- keyboard instructions appear on touch devices
- large instruction panels remain visible during gameplay
- more than three undifferentiated, equally-weighted card-like panels are persistently visible (this is about generic card soup — using the shipped windows/bars is fine; the fault is unstyled boxes with no hierarchy)
- the main action looks like a standard website button
- pause resembles a generic website modal
- victory/failure is only text plus restart
- restart is permanently visible without a gameplay reason
- menu elements lack pressed, focused, selected, or disabled states
- UI changes have no transition or feedback
- generic virtual controls are used without genre adaptation
- the theme only changes colors and fonts
- unrelated UI elements have equal visual weight
- mobile portrait technically fits but is not intentionally composed
- important UI sits beneath safe areas
- ordinary document flow determines the HUD layout
- generic default styling is used because no art direction was written
- the hosting website page renders its own title, tagline, or "enter game" button instead of loading straight into the game's own menu
- the game's own main menu reads as a marketing/landing page (hero banner, feature list, store framing) rather than a game front-end
- the game supports saves, characters, or classes but the main menu offers no Continue/Load or character create/select entry
- Continue/Load is hidden rather than shown disabled when there is nothing to resume
- settings ship as the engine's unskinned stock menu instead of the game's own skin and placement, or sit floating over live play with no sensible home
- credits are absent from the game, or attribution lives only in a build artifact instead of a reachable in-game screen

## 15. Compact implementation API appendix

Use the main `jgengine` skill for the authoritative engine API routing. The React package exposes `GameProvider`, hooks, and headless primitives from `@jgengine/react` and its documented subpaths. Common hooks include player/game state, entities, stats, inventory, quests, prompts, clocks, markers, fog, and engine stores. The shell provides `GameHost` (the game mount), input integration, devtools, and `GameUiPreview`; `@jgengine/shell/GamePlayerShell` (the internal player `GameHost` composes) also re-exports the movement primitives it wires up internally (`applyMotionImpulses`, `nearbyObstacles`, `resolvePhysicsTuning`, `hasEnvironmentTerrain`) for a host that needs to replicate its physics loop, and `@jgengine/shell/terrain` re-exports the `jgengine-world` field builders (`arenaField`, `flatField`, `fractalNoise`, `resolveGroundStep`, `valueNoise`, `withNormal`) alongside its own `CarvedTerrain`/`GrassField` components so a shell consumer never needs a second import from core.

Use these APIs to bind state; do not let API wiring dictate visual composition. Keybind labels should derive from the game’s binding table, and UI actions should dispatch through game commands rather than existing only as click handlers.

The shipped building blocks — inventory grids, toggleable windows, character sheets, bars — are legitimate to compose and are the right starting point; reach for them instead of re-deriving inventory, windowing, or a paperdoll. But neither they nor the headless seams are finished design on their own: the game must still arrange, place, name, and art-direct them into its own look. Compose the building blocks, then skin and lay them out — don't ship them unarranged.

## Definition of done

UI work is complete only when:

- the game owns the viewport
- site chrome is absent during active play
- no document scrolling is required
- HUD and control layers have clear responsibilities
- mobile controls do not cover critical content
- touch controls match the genre and game identity
- title, pause, and results screens feel authored
- the main menu is a game-owned front-end (New Game / Continue / Load / character create+select / Settings / Credits as the game supports them), not a marketing splash
- settings are game-skinned and reachable from the main menu and pause, not a stock corner overlay
- credits are reachable in-game and record borrowed work
- interaction states and transitions are present
- screenshots have been reviewed and revised
- the implementation remains accessible and performant
- future generated UI is explicitly prevented from falling back to generic website-card styling
