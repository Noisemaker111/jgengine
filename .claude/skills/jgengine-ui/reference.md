# JGengine UI — game presentation reference

This reference defines the required visual and interaction quality for JGengine games. The main `jgengine` skill owns engine architecture, hooks, input commands, and routing. This document owns what the interface looks like, how it is composed, how it responds, and how it is verified.

## The rule

A game must visually own its viewport. It must not resemble a dashboard, landing page, documentation page, or ordinary responsive web app.

HTML and React are valid implementation tools. Website visual grammar is not the default.

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
- mode selection
- onboarding/tutorial
- gameplay HUD
- pause
- settings
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
<GamePlayer>
  <WorldLayer />
  <HudLayer />
  <ControlLayer />
  <ScreenLayer />
  <SystemLayer />
</GamePlayer>
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

### Phase-gated HUD visibility (`showDuring`)

`HudCanvas` and `HudPanel` take an opt-in `showDuring?: GamePhase[]` — the element renders only while `gamePhase` is one of the listed phases (`"menu" | "playing" | "paused" | "ended"`), so a non-cartridge game hides its HUD under menu/end overlays without hand-rolling a phase check. Omit it for the default always-visible behavior. Gate the whole HUD with `<HudCanvas showDuring={["playing"]}>`, or keep a single results panel up with a per-`HudPanel` value. The read degrades to `"playing"` when the component renders outside a `GameProvider` (component showcases, previews), so it never throws there.

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

**Minimap** is already shipped, not hand-rolled: `Minimap` / `WorldMap` / `Compass` from `@jgengine/react/map` render a framed SVG minimap over a `MarkerSet` (`createMarkerSet`, `@jgengine/core/world/markers`) and optional `FogField`, projecting via `@jgengine/core/world/minimap` (`projectToMinimap`, `headingToBearing`, edge-clamp). A game feeds flat props (`markers`, `center: [x,z]`, `worldRadius`, `size`, `facingYaw`, `rotate`) and repopulates the marker set each HUD tick from live entities — no custom canvas painter. Rolling a **custom** minimap around your own course/route content (not the full `Minimap` panel)? `MinimapChrome` from `@jgengine/react/map` is the headless chrome layer other games were re-drawing by hand: nest it inside your own `<svg>` for the ring `frame`, and pass `markers: MinimapChromeMarker[]` (`{ id, position, heading?, color?, radius?, glyph? }`) for edge-clamped dots that draw as a rotated arrow whenever a marker carries a `heading` (the compass-arrow / player-blip layer) — never hand-roll `clampToMinimapEdge` + a `<polygon>` again. **Playing cards** are already shipped, not hand-rolled: `CardFace` / `StackedPile` / `CardStack` (with `Suit`, `Rank`, `PlayingCard`) from `@jgengine/react/cards` render a French-deck face (rank + suit pips, patterned back when `faceDown`) and an overlapping fan. `StackedPile` composes the existing drag system (`useDragLayer`/`DraggableCard`/`DropZone`) — pass a `layer` for drag and `dropId` for a drop target; `CardStack` binds a fan to a headless `CardPileState` zone (`@jgengine/core/cards/cardPile`). Never draw cards on a canvas or reinvent pointer handling. **Swing timer**: `swingTimerState(player, target, prevPeriod, prevTimer)` (`@jgengine/core/ui/swingTimer`) is the pure, parameter-in/next-state-out core for a melee swing bar (recovers period on the reset edge; hidden unless auto-attacking a live non-object target) — thread the returned `nextPeriod`/`nextTimer` back via refs, render a thin `Meter`.

**Heat/streak gauges** are already shipped, not hand-rolled `clamp(value/max)`: build the gauge with `createEventMeter` (`@jgengine/core/stats/eventMeter`, `event-meter` capability — ult/adrenaline `"hold"` mode or streak/combo `"reset"` mode over tagged event gains) and bind it to a component with `useEventMeter(meter)` (`@jgengine/react`, `event-meter-hud` capability) — it self-ticks a heartbeat and returns `{ value, fraction, tier, ready }` for a `Meter`/`BossBar`-style fill, no manual `setInterval` polling of `meter.value()`.

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

A cinematic look is opt-in engine config, never hand-wired render passes. Set `defineGame({ postProcessing })` (`PostProcessingConfig` from `@jgengine/core/render/postProcessing`) and the shell mounts an `EffectComposer` and owns the render: RenderPass → AO → Bloom → tone-map output → Grade. Absent means the renderer draws directly (unchanged), so it never imposes a look on games that don't ask. Each stage is a config object, `false` to skip, or omitted for its tuned default:

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

## Settings menu

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

The shared `KeybindBadge` (and everything built on it — `MenuButton`, `MenuList`, `TitleScreen`, `ResultsScreen`) already renders nothing on a coarse pointer, so route key hints through it instead of hand-rolling `<kbd>`. When a screen hand-rolls its own control grid or a `START — {key}` / `Press Enter` call-to-action, gate that text on `const { coarsePointer } = useDisplayProfile()` (`@jgengine/react`) — hide the keyboard legend and let the tappable button carry a plain label (`Start`, `Restart`). Never surface a bare "press E / press enter" line as the only way to advance; the button itself must be tappable.

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
- more than three ordinary card-like panels are persistently visible
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

## 15. Compact implementation API appendix

Use the main `jgengine` skill for the authoritative engine API routing. The React package exposes `GameProvider`, hooks, and headless primitives from `@jgengine/react` and its documented subpaths. Common hooks include player/game state, entities, stats, inventory, quests, prompts, clocks, markers, fog, and engine stores. The shell provides `GamePlayerShell`, input integration, devtools, and `GameUiPreview`; `@jgengine/shell/GamePlayerShell` also re-exports the movement primitives it wires up internally (`applyMotionImpulses`, `nearbyObstacles`, `resolvePhysicsTuning`, `hasEnvironmentTerrain`) for a host that needs to replicate its physics loop, and `@jgengine/shell/terrain` re-exports the `jgengine-world` field builders (`arenaField`, `flatField`, `fractalNoise`, `resolveGroundStep`, `valueNoise`, `withNormal`) alongside its own `CarvedTerrain`/`GrassField` components so a shell consumer never needs a second import from core.

Use these APIs to bind state; do not let API wiring dictate visual composition. Keybind labels should derive from the game’s binding table, and UI actions should dispatch through game commands rather than existing only as click handlers.

Headless components are not finished design. They are behavior and accessibility seams that the game must art-direct.

## Definition of done

UI work is complete only when:

- the game owns the viewport
- site chrome is absent during active play
- no document scrolling is required
- HUD and control layers have clear responsibilities
- mobile controls do not cover critical content
- touch controls match the genre and game identity
- title, pause, and results screens feel authored
- interaction states and transitions are present
- screenshots have been reviewed and revised
- the implementation remains accessible and performant
- future generated UI is explicitly prevented from falling back to generic website-card styling
