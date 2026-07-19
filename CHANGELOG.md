# Changelog

The lockstep game SDK set is `@jgengine/{core,react,ws,node,sql,convex,shell,editor,assets}`
(this file’s 0.x.y releases). The CLI package `jgengine` and `@jgengine/github` use
**separate** version lines and may lag. Format follows [Keep a Changelog](https://keepachangelog.com);
each release **leads with a Migrate block** — the concrete steps to move a game
from the previous version onto the new APIs — because the point of a bump is to
let consumers pick up the better stuff, not just to list what moved.

Agents building on the published SDK can also read this programmatically:
`import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"` gives the
same data as typed values, so an updater can diff its installed version against
the latest and surface the migration steps. Easier still: `npx jgengine upgrade`
run inside a game project diffs the installed `@jgengine/*` versions against the
latest release and prints every Migrate step and Adopt-worthy addition in
between (`--json` for structured output).

## [Unreleased]

<!--
Every PR that changes `packages/*/src` records its consumer-facing change here, so
the next release's notes are complete by construction. Add a bullet under the right
subhead below. `bun run check-changelog` fails a source PR whose `[Unreleased]` block
is untouched; pure refactors/tests bypass with `[skip changelog]` in a commit message.
At publish, rename this heading to the new version and mirror the entries into
`packages/core/src/meta/changelog.ts` (the typed `CHANGELOG` export).
-->

### Migrate

- _Nothing yet._

### Added

- One authoring gesture for scatterable coverage: `@jgengine/core/world/scatterCoverage` owns shared density/budget semantics (per-kind unit, requested→count→capped, one clamp-and-warn phrasing) for `grass_field`/`scatter`/`city`; the editor inspector leads each kind with the same Area → Assets → Density coverage section, scatter truncates to the shared 250k instance budget, and city single-sources its 2,600-lot cap.
- **Created games ship a drive/playtest script** (#1248) — `npx jgengine create` scaffolds now include `scripts/drive.mjs` (`bun run drive`): dependency-free headless play/testing of the running game — ordered `--click`/`--key`/`--wait`/`--shot`/`--rpc` steps against the agent bridge, plus `--playtest --strict` progress/softlock verdicts off `capture.probe`. Shared Chrome/CDP machinery lives in `scripts/browser.mjs`; `scripts/shoot.mjs` is unchanged in behavior, now a thin CLI over it.
- Editor: viewport clip preview for rigged assets (Animation dock "Clips" mode — pick a rig or placed instance, play/scrub/loop/speed any catalog clip) and an Inspector "Animation" section that authors a placement's `ModelConfig.animation` (role→clip dropdowns, auto/none, walk/run/fade, one-shot event bindings) as undoable `marker.meta.animation` edits. New subpaths: `@jgengine/editor/shell/clipPreview`, `@jgengine/editor/modelAnimationAuthoring`, `@jgengine/editor/ClipPreviewLayer`.
- **`npx jgengine find <intent>`** — active capability discovery: searches every shipped domain's `capabilities.md` (staged inside the CLI tarball, so it works regardless of which `@jgengine/*` packages a project installed) and prints the drop-in primitive + its import for an intent like `"toggleable window"`, `inventory`, or `minimap`. Scaffolded games are now briefed (in `AGENTS.md` and the `jgengine` intake skill) to reach for it before hand-rolling a HUD/inventory/window/rig.
- **`EntityPreview`** (`@jgengine/shell/render/EntityPreview`) — drop-in live 3D entity portrait for character screens, unit inspectors, and loadout viewers. Owns the nested `<Canvas>`, the `GameContextBridge`, and a `StudioStage` lighting rig with optional turntable / face-camera; the game passes its own `renderEntity` as children (or a native `model` + `instanceId`) and, bound to a live entity, the portrait walks/flinches/topples in sync with the world.
- **`GameContextBridge`** (`@jgengine/react`) — re-provide the running `GameContext` across a nested React reconciler boundary (the R3F `<Canvas>`), so a game building its own preview canvas no longer re-derives the bridge by hand.

### Changed

- **Combat VFX no longer render as black squares under AO/DOF post-processing** (#1247) — GTAO/Bokeh scene prepasses skip overlay effects. Games with custom additive overlay effects opt out the same way: spread `POSTFX_OVERLAY_USERDATA` (`@jgengine/shell/postfx/postfxOverlay`) onto the overlay group's `userData`.
- **`PanelHost` windows stack above the HUD by default** (`@jgengine/react`) — the host establishes its own stacking context at `zIndexBase` (default 40), so open windows always paint over stat bars / nameplates / frames instead of bleeding through. Overridable per instance.

### Removed

## 0.13.0

### Migrate

- **Nothing required** — this release is additive fixes, defaults, and new drop-in primitives. Bump `@jgengine/*` pins to `^0.13.0` (CLI `jgengine` is 0.10.0; `@jgengine/github` unchanged at 0.1.0) and rebuild.
- Two defaults changed in the player's favor, both overridable: **offline games now persist to localStorage automatically** (#1207) and **rigged catalog assets animate by default** via clip metadata + semantic clip roles (#1209). If a game relied on rigged models staying frozen or on saves being memory-only, opt out explicitly; otherwise you get better behavior for free.

### Added

- **Drop-in inventory grid, window manager, and character sheet** (#1220) — `@jgengine/react` ships `InventoryGrid` (real drag/stack/split), a toggleable-window system (`panels`: bag, character sheet, spellbook-style windows with `@jgengine/core/ui/panelModel` state), and a `CharacterSheet` paperdoll, all HudTheme-skinnable — wire in a line or two instead of re-deriving from raw divs.
- **Serializable runtime snapshots** (#1179) — capture/restore of live runtime state, including magazine state (`@jgengine/core/combat/magazine`) and stat modifiers, for saves and replication.
- **Portable weapon plumbing** (#1211) — `@jgengine/core/combat/weaponFire` composes trigger → magazine → spread → projectile/hitscan as data, no game-local glue.
- **Portable leveling** (#1206) and **portable damage-pool access** (#1208) — progression and damage pools exposed as genre-agnostic seams on the game context.
- **Named combat VFX presets** (#1204) — `@jgengine/core/combat/vfxPresets`: a visible attack is one line.
- **Runtime-measured render-bounds hitboxes** (#1227) — colliders wrap what the shell actually mounts, not the raw asset bounds.
- **Character motion feel** — procedural part motion for rig-less part-composed characters (#1222) plus squash & stretch and death splat (#1229).
- **City fabric** (#1191) — `streetGenerator` + `cityGenerator`, editor bake verb, street-aware lots, road junctions, grounding, and a web playground.
- **`jgengine recipe` CLI** (#1214, #1231) — vetted wired compositions, compile-pinned against the SDK, listed and copied from the CLI.
- **Editor/debug modes mirror to the URL** with a proper editor exit (#1203); game template ships a dependency-free WebGL screenshot script (#1202).

### Changed

- Offline games persist to localStorage by default (#1207); rigged assets animate by default (#1209).
- RTS camera pan inversion fixed (#1228); sprite raycast warning silenced and duplicate nameplate health bars removed (#1194); scaffolded F2+E editor Tailwind `@source` renders its theme (#1195).
- Outside-game DX: stat-pool no-op stability, camera-transparent decor, cleaner install/version output, headless UI-intent seam (#1223); new-game briefs direct engine bugs/gaps upstream (#1200).

## 0.12.0

### Migrate

- **Author games through `defineGame` from `@jgengine/shell`** — it is the single public authoring entry (and carries the define-game capability tag). Core's constructor was renamed `defineGame` → `defineGameDefinition` (`@jgengine/core/game/defineGame`); only hosts and tooling call it. If you imported `defineGame` from core, switch the import to `@jgengine/shell`. `GamePlayer`/`GamePlayerShell` are `@internal` now — `GameHost` is the documented mount, and it owns the editor summon (`?mode=editor`, F2+E, dev save endpoint), so delete any per-game editor bootstrap.
- **Declare your world with `world()`** (`@jgengine/core/world/place`): `world({ id, ground: { mode, size, surface? }, physics? })` with `flat` / `round` / `voxel` / `board` ground. New scaffolds emit a thin infinite flat place instead of the old 96 m meadow. `environment()` still works but is demoted to the legacy consumption path for editor-written scene data — **nothing required** for existing games; new worlds should use `world()` and author all dressing in the editor.
- Everything else is additive — stat pools, minimap marker sources, auction house, city/path generation, editor workspaces require no changes to existing games.

### Added

- **World = place: `world()` API** (#1178) — a world is substrate + laws, not a coded diorama. `@jgengine/core/world/place` ships `world({ id, ground: { mode, size, surface?, generator? }, physics? })`; size is discriminated by mode (flat `{x,z}` with `Infinity` axes, round `{radius}`, voxel generator domain, board `{x,y}` cells — TS and runtime both reject mismatches). `ground.surface` carries matter/feel laws (metal vs slime vs felt) read by the same rule systems; per-place `physics` resolves over the game default; multiple worlds per game are first-class. The shell renders place substrates (`PlaceScene`) under the engine default sky; seeds derive from world id + save via `seedForPlace`.
- **`@jgengine/shell/gameKit`** — happy-path authoring surface: authoring, mount, stores, systems, authored-scene helpers, HUD primitives, seeded rng in one import.
- **Portable generic stat pools** — `@jgengine/core/stats/statPool`: bounded named pools (health, energy, heat, ammo…) with the entity-stats integration rebuilt on them; recipe in skill `jgengine-combat`.
- **Auction-house economy primitives** (#1086) — `@jgengine/core/economy/auctionBook` (timed bid auctions, escrowed bids, outbid refunds, optional buyout, anti-snipe close extension, seller settlement minus house cut) plus market price history.
- **Portable minimap marker sources** — core world seam feeding game minimaps; recipe in skill `jgengine-ui`.
- **Unified seed-driven path network + city generation v2** (#1103, #1106) — streets/blocks/buildings with grid-ness, curviness, branching and block-size dials; zone bands, weighted building-class mixes, massing pieces, balance presets, junction-centered clustering, road-derived block polygons and parcels. Shell renders realistic roads: real intersections, curbs, lane lines, tunnels, and roads riding bridge decks.
- **Physical fidelity** — mesh-accurate hitboxes (shots pass through holes in concave models, #1075), auto-fit entity/object colliders from measured model bounds (#1072), movement obstruction reading fitted boxes + compound-box openings (#1077).
- **Editor overhaul** (#1110) — materials / lighting / scripting / animation-timeline / multiplayer workspaces, command palette, minimap bake wired end-to-end (#1036), real offscreen GLB thumbnails in the content browser, hierarchy drag-drop + keyboard + context menus + per-object visibility/lock, multi-select inspector, console RPC, asset drag-place, ortho projection, pivot modes, play chrome.
- **Editor authoring pipeline** — author entity definitions and starter catalogs (#1012), author catalogs/schema fields in the Data tab (#1043), promote an authored scene folder into a runnable game (#1011), authored triggers promoted to a shared primitive with goal/win rules (#1013), asset import rewrites the game's `game/assets.ts` (#1042).
- **Skills** — research-backed `game-design` and `level-design` skills (#962); every-game-owns-custom-UI invariant codified (#1148).

### Changed

- `npx jgengine create` scaffolds a thin infinite flat `world()` place; the editor `blankWorld` no longer pre-bakes seeded grass. Dressing belongs in `editor.scene.json`.
- Environment studio visual-quality pass — turf tufts, depth-aware water, relief soil, weathered poles; grass fields no longer rebuild geometry per frame (#1090).

## 0.11.0

### Migrate

- **Nothing required** — classic `loop.onTick` fan-out still runs after systems. Prefer moving per-frame work into `defineGame({ systems: [...] })` with `defineSystem` (`@jgengine/core/game/defineSystem`); install a system with `feature: "quest"` (etc.) instead of a redundant `features` flag. See skill `jgengine` → [reference-systems.md](.claude/skills/jgengine/reference-systems.md).

### Added

- **Composable game systems** (#842) — `defineSystem` / `compileSystemSchedule` / `composeGameLoop` / `installSystems`. `defineGame({ systems })` is the single authoring path: fixed / frame / interval / event-only / manual ticks, multi-subscribe channels, deterministic stage order + optional `before`/`after`/`dependsOn`, system-owned save / replicate / reset / dispose. Installing a system activates its `feature` without a separate flag. `GameLoop` gains optional `onReset` / `onDispose`. `ctx.game.registerSave` / `registerReplicate` for system modules. Adopters: tower-guard, claudecraft (runtime without a giant tick fan-out).

## 0.10.0

### Migrate

- **Nothing to change for existing games** — the shared mobile-composition system (viewport allocation, region collision, `--jg-*` viewport vars) is wired automatically by the shell for every game; `HudPanel`s inside a `HudCanvas` register themselves. Legacy `orientation: "landscape" | "portrait"` keeps its advisory dismissible-hint behavior unchanged.
- **Opt a driving/landscape game into the strict gate**: replace the advisory `orientation` with the contract form — `orientation: { mobile: "landscape-required" }` (rules: `any` · `portrait`/`landscape` advisory · `portrait-required`/`landscape-required` · `unsupported`). In portrait the engine now shows a polished `RotateDeviceScreen`, suppresses input, freezes the sim, and unmounts the HUD/controls until the device is landscape.
- **Declare HUD intent** where useful: `HudPanel` gains `priority` (`critical`/`secondary`/`tertiary`), `mobileBehavior` (`hidden` unmounts on phones, `transient` softens collision, …), `allowOverlapWith`, and `collisionGroup`. Optional — omitting them keeps prior behavior.
- **Mobile validation now also fails on overlap**: `bun run shoot <game> --device mobile|mobile-landscape|both` exits non-zero on forbidden inter-element collisions (not just viewport overflow), naming both regions.

### Added

- Shared mobile layout composition — `@jgengine/core/ui/gameLayout` (pure geometry: `resolveLayoutMode`, `intersects`, `overlapArea`, `detectLayoutCollisions`, `computeGameplayRect`, `LayoutRegion`, `GameViewportLayout`) and `@jgengine/core/ui/orientation` (`resolveOrientationRequirement`, `orientationGateActive`, `MobileOrientationRule`). `@jgengine/react` adds `GameViewportProvider` (mounted by the shell), hooks (`useGameViewportLayout`, `useGameLayoutMode`, `useGameOrientation`, `useReservedControlZones`, `useLayoutCollisions`, `useRegisterLayoutRegion`), and a headless `RotateDeviceScreen`. The provider tracks `window.visualViewport`, publishes `--jg-viewport-*` / `--jg-visual-viewport-*` / `--jg-safe-*` CSS vars, resolves the explicit layout mode, and detects forbidden region overlaps (dev `data-jg-layout-collision` + console diagnostic).
- Mandatory orientation contract — `PlayableGame.orientation` accepts `{ mobile: <rule> }`; `landscape-required`/`portrait-required` render an engine-owned rotate gate that blocks gameplay (input suppressed, simulation frozen, HUD/controls unmounted), self-correcting when the device is turned. Reduced-motion and safe-area respected; `visualViewport`-sized for mobile Safari/PWA.
- Reserved touch-control zones — the touch dock registers its joystick / action-cluster / utility rectangles (runtime-measured) as `control` regions, so HUD placement and collision validation know exactly where controls sit.
- HUD placement metadata — `HudPanel` gains `priority`, `mobileBehavior`, `allowOverlapWith`, `collisionGroup`, and registers as a collision-tracked layout region.
- Mobile-landscape shoot device — `bun run shoot --device mobile-landscape` (844×390) plus collision-gate reads that fail mobile validation on forbidden overlaps.
- Canyon Chase migrated as the reference landscape-required game — declares `orientation: { mobile: "landscape-required" }`, composes its HUD through coordinated `HudPanel` regions (pursuit distance critical, border secondary, survey map hidden on mobile, radio transient) instead of independent fixed corners.

### Changed

- First-person projectile tracers now originate from the weapon muzzle instead of the camera/eye centerline. Hit detection is unchanged (still crosshair-accurate) — only the drawn tracer's start point moved to the viewmodel muzzle, which tracks full aim yaw and pitch. Non-viewmodel games and enemy tracers are unaffected.

## 0.9.0

### Added

- Mobile HUD fit — design-resolution UI scaling now applies to every game by default: `HudCanvas` measures the live viewport and scales the whole HUD from `PlayableGame.hudFit.designSize` (default 1600×900, clamps `minScale`/`maxScale` 0.4–1) so desktop-authored layouts shrink to fit a phone instead of overflowing it; `hudFit.mobile` overrides tune the phone fit separately. Pure math lives in `@jgengine/core/ui/hudScale` (`hudScaleForViewport`, `resolveHudFit`, `rectOverflow`, `overflowingPanels`); the shell mounts `@jgengine/react`'s `HudViewportProvider` around `GameUI` so games need no wiring.
- Graphics → UI scale — a player-facing `graphics.uiScale` slider (0.5–1.5, default 1) multiplies the computed HUD scale on every platform; the same resolution system drives desktop preference and mobile shrink.
- HUD overflow gate — `HudCanvas` measures every `HudPanel` against the viewport at runtime and reports offenders on a `data-hud-overflow` attribute (plus a console warning); `bun run shoot <game> --device mobile|both` now exits non-zero naming the panels that escape the viewport.
- Automatic visibility & streaming defaults — an engine-level `VisibilitySystem` (exported from `@jgengine/core`) gives every scene renderer-agnostic culling and asset-streaming policy with no per-object wiring: distance culling, preload margins, hysteresis, delayed unloading, multi-camera awareness (including cameras excluded from streaming), and per-object overrides (always-visible, never-unload, disabled culling/streaming, custom render distance and preload margin).
- Self-hosted asset mirror — `DEFAULT_RELEASE_BASE` now points at this repo's rolling `packs` release instead of the upstream host; a catalog-driven `mirror-assets` workflow (weekly cron + manual dispatch) keeps the mirror in sync with the asset catalog.

### Changed

- Mobile HUD fit is on by default — design-resolution HUD scaling now applies to every game with no config change (previously opt-in via `platforms: ["web", "mobile"]`). A desktop-only game keeps the legacy fixed 0.85 compact zoom by declaring `platforms: ["web"]` (without `"mobile"`).

## 0.8.0

Transport-agnostic multiplayer (socket.io, WebRTC p2p, LAN/Fly adapters) plus grid/voxel
and puzzle primitives, HUD-only presentation, cumulative leveling, and a round of
controller/camera/sensor additions. **Breaking:** the `gameui` component kit moved out of
`@jgengine/react` onto the shadcn registry.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.8.0` (the eight packages version in lockstep).
- Additive only, except for `gameui` — every other 0.7.0 API is unchanged; opt into any of the below by importing it directly.
- **Breaking:** replace any `@jgengine/react/gameui` import with the equivalent registry component (`npx shadcn@latest add https://jgengine.com/r/<name>.json`), and swap `GameUiThemeProvider` for `--jg-*` CSS variables on a wrapper element. `GameIcon` and friends moved to `@jgengine/react/gameIcons`.
- `leveling({ thresholdMode: 'cumulative' })` is opt-in; the default `perLevel` behavior is unchanged.
- `defineGame.physics.gravity`/`jumpVelocity` are now read by the built-in kinematics controller every frame — if a game already set them expecting a no-op, jump/fall now actually reflects them; omit both to keep the previous defaults.

### Added

- Cumulative leveling — `leveling({ thresholdMode: 'cumulative' })` tracks xp as a lifetime total that resolves upward across levels and clamps at the max-level threshold once capped (#12).
- Direction-aware pool depletion — `EffectSystem.canReceive(instanceId, effect, magnitude?)` takes an optional signed magnitude; negative checks the opposite direction and returns `pools-depleted` only when every stat in the receive order is already at max, so heals reach fully-depleted targets (#168).
- Puzzle primitives — `puzzle/cellGrid` (uniform-cell boards: line-clear, match-3 cascade, run detection) and `puzzle/fallingPiece` (rotation-state shapes, ghost drop, lock delay, classic gravity/level/score curves) for Tetris/match-3 games (#166).
- Voxel field — `world/voxelField` (`createVoxelField`, chunked block lattice, neighbors/exposedFaces, 3D DDA raycast, dirty-tracked `chunkVersion`) for voxel games and instanced renderers; assert on `field.summary()` the way environment worlds assert on `summarizeEnvironment` (#166).
- `defineGame` games may omit `assets` (an empty catalog is injected); `PlayableGame.presentation: 'hud'` mounts no 3D canvas/camera/pointer for board/card/menu games; an `environment()` world auto-renders as the shell's backdrop when `PlayableGame.environment` is unset (#166).
- Declared-action intent board — `turn/intent` `createIntentBoard` for one-turn-ahead intents (Slay-the-Spire style): declare/peek/all/consume/clear (#168).
- `turnLoop` lifecycle hooks — `config.onTurnStart`/`onTurnEnd` fire on every `advanceTurn()`; `ctx.game.turn.loop(id, config)` lazily creates/returns a notify-wrapped `TurnLoop` so every mutation (`advanceTurn`/`advancePhase`/`advanceRound`/`spend`/`gain`/`refill`/`setOrder`/...) auto-bumps `ctx.version()` with no manual wiring (#163/#168).
- `ctx.game.store` — a reactive per-game keyed store (`set`/`delete`/`get`/`has`/`subscribe`/`mapSnapshot`/`arraySnapshot`) plus `@jgengine/react`'s `useGameStore` selector hook, replacing hand-rolled module-level stores for ad-hoc reactive game state; `ctx.game.cards.pile(id, config?)` lazily creates/returns a notify-wrapped `CardPile` the same way; `createCardPile` gained an `onChange` hook for headless use; `CommandDefinition.apply` may return void for side-effect-only commands (#163).
- Camera — `sideScroll` rig (fixed lateral follow for 2.5D platformers/beat-'em-ups), a `none` rig (no camera mounted; pairs with `PlayableGame.presentation: 'hud'`), `rts.pan: false` (static backdrop camera: no pan/edge-scroll/rotate/zoom, still re-centers on the follow target), and the `observer` rig now defaults to the local player when `bind` is unset (#167).
- Sensors + session — `sensor/concealment` (`colorDistance`/`concealmentScore`/`createConcealmentSensor`), `sensor/freezeMonitor` (`createFreezeMonitor`), `session/roles` (`assignRoles`); `createRoundState`'s `RoundConfig.teams` accepts per-team roles and an optional `winCondition` that `evaluate()` checks each tick, and takes an optional `phaseOrder` for arbitrary named phase cycles (`concludeRound`/`evaluate` settle only while the current phase is neither the first nor the last entry) (#151).
- Appearance replication — presence rows carry an optional per-slot appearance channel (cosmetic ids, hex tints, model keys) alongside pose, riding the existing pose message with no protocol bump; wire `ctx.player.cosmetics.get(userId)` into the outgoing pose (#151).
- `ctx.input` — a per-frame held-action snapshot (`publish(held)`/`isDown(action)`/`held()`) without bumping `ctx.version()`; action bindings gained `repeatMs` (repeat-fire while held); every command resolved from a bound action now carries `aim`; `pointer.secondaryCommand` runs a command on right-click off the same raycast as move/ping (#164).
- Object spatial queries + entity patching — `ctx.scene.object.at`/`inBox`/`raycast`/`raycastAll` over unit-box objects; `ctx.scene.entity.update(id, patch)` for name/position/rotation/role/movement/behaviors/meta; per-instance `renderObject`/`objectStyles` overrides; `pointerService.worldHitCenter()` + pointer-lock center-ray aiming (#165).
- Controller movement config — `PlayerMovementConfig` (`mode`: free/axis/grid, `axis`, `cellSize`, `collideObjects`, `beforeCommit` pre-commit hook) for the shell-driven walk controller; `defineGame.physics.gravity`/`jumpVelocity` are honored by the built-in walk controller (distinct from the standalone `physics/physicsWorld` rigid-body sim); `ctx.player.motion.impulse`/`setVerticalVelocity`/`setY`/`takePending` (`MotionIntents`); `entity.spawnPoseOf`/`resetToSpawn`/`resetAllToSpawn` (#162).
- Model material/animation + paint — `ModelConfig.tint`/`metalness`/`roughness`/`animation` (GLTF clip playback, paused pose holds); `PointerHit.uv` + `pointerService.sampleSurface()` for material-aware picking; `ctx.scene.entity.paint` runtime paint layer, auto-rendered via a per-instance canvas texture with no per-game wiring; remote-player appearance tint recolors the shell's default capsule (#151).
- **Transport pipe seam** (`@jgengine/ws/pipe`) — `createWsBackend` runs over any bidirectional string channel, not just a raw `WebSocket`: `TransportPipe`/`TransportPipeHandlers`/`TransportPipeFactory`, with `webSocketPipe(url, webSocketFactory?)` as the default. `createWsBackend({ userId, url?, pipe? })` — `url` stays the common case, `pipe` opens the seam to socket.io, WebRTC, and in-process loopback below.
- **Browser-safe authoritative host** — `createGameHost` and `memoryPersistence` moved from `@jgengine/node` to `@jgengine/ws/host` (zero Node dependencies; `@jgengine/node` re-exports both unchanged from `@jgengine/node/host` / `@jgengine/node/persistence`, so existing imports keep working). `@jgengine/ws/hostRouter`'s `createHostRouter({ host, authenticate?, poseRules?, positionHistoryMs?, chatRateLimit?, chatHistoryLimit?, chatMaxBodyLength?, now? })` extracts the ws wire-protocol session logic out of `createGameWsServer` into a transport-agnostic `HostRouter` (`connect(transport) → { handleRaw, close }`, `rewind`, `close`); `@jgengine/node`'s `createGameWsServer` is now a thin binding of this router onto the `ws` npm package, same public API. `loopbackPipe(router): TransportPipeFactory` connects a `createWsBackend` straight into an in-process router.
- **Socket.IO transport** — `@jgengine/ws/socketIoPipe` (`SocketIoLikeSocket` structural type, `socketIoPipe(socket)`, `createSocketIoBackend({ socket, userId, … })`) and `@jgengine/node/socketIoServer` (`attachGameSocketIoServer({ io, host, …router options }): { rewind, close }`, structural `SocketIoLikeServer`/`SocketIoLikeServerSocket`) ride the existing ws JSON protocol over socket.io's `send`/`message` frames — no socket.io dependency in either package's types. New `socketIo({ topology?, url? })` adapter in `@jgengine/core/runtime/adapter`.
- **WebRTC peer-to-peer** (`@jgengine/ws/peer`) — one browser tab hosts, authoritatively, with no server process. `createPeerHost({ userId, host?, runtimes?, persistence?, tickMs?, router?, rtc? })` runs a `GameHost` + `HostRouter` in the host tab (`backend` is the host player's own loopback connection, `accept(offerCode) → Promise<answerCode>` per guest); `createPeerGuest({ userId, token?, rtc? })` offers/connects from the joining side. `encodePeerSignal`/`decodePeerSignal` turn SDP into copy-pasteable base64url codes for manual cross-machine signaling; `broadcastChannelSignaling(room)` automates it for same-origin multi-tab play, with `announcePeerHost`/`joinPeerSession` wiring host/guest to a `PeerSignaling` in one call. New `p2p({ topology?, room? })` adapter (topology defaults `"private"`).
- **LAN adapter + Fly sugar** — `lan({ topology?, port?, path? })` in `@jgengine/core/runtime/adapter` resolves through `@jgengine/shell/multiplayer`'s `resolveShellMultiplayer` to `ws(s)://<page hostname>:<port ?? 8080><path ?? /ws>` derived from `window.location`, so any browser on the LAN auto-connects to whichever machine served the page — no URL configuration. `fly({ app, topology?, path? })` is `ws` sugar for a Fly.io deploy: resolves to `wss://<app>.fly.dev<path ?? "/ws">`. `apps/dev`'s Vite server now listens on the network (`server: { host: true }`) and exposes `?p2p=host` / `?p2p=join` query params wired through the new `resolvePeerShellMultiplayer({ gameId, role, room?, userId?, feedActions? })`.
- `ws()` (`@jgengine/core/runtime/adapter`) gained an optional `url` field, carried through by `resolveShellMultiplayer` (`args.url ?? adapter.url ?? default`).

### Removed

- **The `gameui` component kit** (`@jgengine/react/gameui`) — the themed HUD kit (bars, slots, feedback, meters, panels, screens, reticles, icons) and its `GameUiThemeProvider`/`useGameUiTheme` theming have been removed. **Breaking** for anyone importing `@jgengine/react/gameui` (or its subpaths/barrel). The components now ship as installable shadcn registry items at `https://jgengine.com/r/<name>.json` (`npx shadcn@latest add https://jgengine.com/r/<name>.json`), styled with Tailwind + `--jg-*` CSS variables instead of a theme object. The icon catalog (`GameIcon`, `iconForAction`, `iconForItemId`, `isGameIconName`, `GameIconName`) moved to `@jgengine/react/gameIcons`. To theme, set the `--jg-*` variables on a wrapper element (the registry's `jg-theme` presets mirror the old `ember`/`synthwave`/`fieldkit` palettes) instead of wrapping in `GameUiThemeProvider`.

### Docs

- Added [CREDITS.md](CREDITS.md) crediting [achrefelouafi](https://github.com/achrefelouafi) for the MIT Three.js reference projects behind the procedural building, water, rain, and snow renderers, with links from the root, `@jgengine/core`, and `@jgengine/shell` READMEs.

## 0.7.0

The engine-gaps release — 22 system-level additions across turn/tactics, cards & boards,
crafting, survival, navigation & AI, camera rigs, physics & vehicles, traversal &
destruction, world items & building, map/HUD/ping, combat feel & abilities, audio,
interaction, sensors, embodiment, multiplayer depth, and objective/session machines.
**Every 0.6.0 API is unchanged** — the whole release is additive, so upgrading is a version bump.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.7.0` (the eight packages version in lockstep).
- No code change is required — 0.7.0 only adds surface; no 0.6.0 API moved or was removed. Existing games keep the orbit/first-person camera, single-player-entity control, and every existing primitive exactly as before.
- Opt into any new system by importing it directly: a camera rig via `camera.rig` + its config block; a `sensor/*` probe with `@jgengine/shell/vision` renderers; an `ai/*` director over the `nav/` navmesh; `turn/*` + `tactics/*` for turn-based/grid games; `cards/*` + `board/*` for deckbuilders; `crafting/*` for recipes/production/farming; `survival/*` + `world/{envField,weather,realm}` for survival; `combat/{abilityKit,animationState,defensiveWindow,…}` for action feel; `physics/{vehicleBody,traversal,structure,ragdoll,…}` for vehicles/destruction; `session/*` for contested/round/downed/ring/extraction machines; and `multiplayer/*` for lag-comp/hidden-commit/matchmaking.
- `entityStore.update()` now also accepts `name`, so possession/form can retarget an instance's catalog id without despawn/respawn — no action needed unless you relied on `name` being immutable.

### Added

- **Turn-based & tactics stack** — six pure, renderer-free `@jgengine/core` primitives for turn-based, grid-tactics, and card games (XCOM, BG3, Into the Breach, Slay the Spire, Marvel Snap, Tactical Breach Wizards, Divinity surfaces).
  - `@jgengine/core/turn/turnLoop` (`createTurnLoop`) — initiative machine with configurable `phases` and per-turn action-economy `pools` (`{ id, max, start? }`) that reset when a participant enters their turn; `advanceTurn`/`advancePhase`/`advanceRound`, `spend`/`canSpend`/`gain`/`refill`, and `setOrder`/`addParticipant`/`removeParticipant`. Covers both Slay-the-Spire single-energy resets and BG3's Action/Bonus/Movement/Reaction set.
  - `@jgengine/core/turn/commit` (`createCommitController`, also `turnLoop.commit`) — three commit modes: `immediate`, `simultaneous` (sealed hidden submissions → `reveal()` on `allReady()`), and `rewind` (visible `pending()` → `rewind()`/`commit()`).
  - `@jgengine/core/tactics/tacticalGrid` (`createTacticalGrid`) — tile occupancy, `reachable(from, budget)` flood-fill, `path`, and `push(id, dir, { distance, chain })` discrete knockback-to-tile with chained collisions (Into the Breach).
  - `@jgengine/core/tactics/predictiveQuery` (`predictAreaEffect`/`predictArcEffect`/`predictTiles`) — a would-this-effect-hit query for pre-commit overlays and enemy-intent telegraphs, reusing the exact AoE/LoS targeting behind `ctx.scene.entity.effect` (new shared `resolveAreaTargets` in `combat/effects`) so predictions match what the effect actually drains.
  - `@jgengine/core/tactics/snapshot` (`createSnapshotStore`, `deepClone`) — cheap, repeatable turn-undo over registered `capture()/restore()` slices (the grid, surfaces, and turn loop all qualify), with a `push()/pop()` undo stack.
  - `@jgengine/core/tactics/surface` (`createSurfaceLayer`) — a stateful tile surface layer with its own `tick(dt)` and a data-driven combination matrix (`reactions: [{ when: [a, b], result }]`) — grease+fire, water+lightning — distinct from terrain/water.
- `@jgengine/core/combat/effects` now exports `resolveAreaTargets` (+ `AreaTarget`, `AreaTargetInput`), the shared in-radius→LoS→falloff→accept targeting that both `applyEffect` and the predictive query run, guaranteeing parity by construction. No behavior change to `effect`.

Pure, renderer-free primitives for card, board, and deckbuilder games — they sit **beside** the slot inventory, never replace it.

- **`@jgengine/core/cards/cardPile`** — a `cardPile` of named ordered zones (deck/hand/discard/exhaust) with seeded `shuffle`, `draw(n)` (hand limits + reshuffle-on-empty), `discard`/`exhaust`/`move`. Reuses the engine's seeded RNG (`pileRng`), so shuffles are deterministic under a seed. Slay the Spire, Balatro.
- **`@jgengine/core/cards/modifierPipeline`** — an ordered `{ source, apply(value) → value }` pipeline (`runPipeline` / `createModifierPipeline`) with an inspectable per-step `trace` (before/after/changed) for Balatro-style scoring readouts. Generic over the scored value.
- **`@jgengine/core/board/laneBoard`** — N lanes, per-side power aggregate + optional per-lane `LaneRule` modifier, with `laneOutcome`/`boardTotals`/`lanesWon`. Marvel Snap, Inscryption.
- **`@jgengine/core/board/timelineBoard`** — N slots each on an independent cooldown, `tick(dtMs)` resolving fires in expiry order (then slot index), multiple fires per slot per tick. The Bazaar auto-battlers.
- **`@jgengine/core/inventory/shapedGrid`** — a polyomino inventory variant: `Footprint` placement, `rotateFootprint`, `canPlace` overlap/bounds check, plus `gridAdjacencyQuery` (orthogonal/diagonal neighbors) feeding synergy effects, and `cellFromPoint` for pointer→cell snap. Backpack Hero, Tetris inventory.
- **`@jgengine/react/dragLayer`** — a 2-D UI-space drag/rotate/drop/snap gesture layer over the above: `useDragLayer`, headless `DraggableCard` (right-click rotate), `DropZone` (cell snap + active state), `DragGhost`.

- `@jgengine/core/crafting/recipe` — a recipe graph primitive: `RecipeDef { inputs, outputs, seconds?, station?, stationRange?, requires? }` turns inputs + an optional required-workstation-in-range + time into outputs. `craft` / `canCraft` consume and produce on an `InventoryState` atomically (rejecting `missing-inputs` / `no-station` / `locked` / `no-output-space`); `stationSatisfied` does the range check against placed `{ catalogId, position }` stations; `createRecipeGraph` indexes recipes by `producing` / `using` / `category`. For Valheim/Enshrouded-style workbench tiers, Tarkov hideout stations, Palworld base craft. (#71)
- `@jgengine/core/economy/techTree` — a prerequisite-gated tech tree that **generalizes flat `unlocks`** rather than duplicating it: `TechNodeDef extends UnlockDef` adds `requires` (prereq ids), a `recipe` payload, and `grants`. `createTechTree(defs)` wraps `createUnlocks` and gates `unlock(userId, id)` on prerequisites, exposing `available` (frontier) and `recipes` (payloads unlocked). Flat unlocks are just nodes with no `requires`. For Once Human Memetics / Abiotic Factor branching trees. (#72)
- `@jgengine/core/crafting/production` — `productionBuilding({ inputs, outputs, rate, power? })` plus `tickProduction`, which consumes buffered inputs and emits outputs continuously through game-time `dt` (so pause/fast-forward apply for free). `feedProduction` / `drainOutput` are the buffer I/O, `advanceTransport` slides items along a conveyor path, `resolvePowerGrid` powers demands greedily against a supply. For Palworld/Satisfactory/Factorio automation. (#74)
- `@jgengine/core/crafting/crop` — a `cropTile` soil-and-growth state machine (`tillTile` / `plantCrop` / `waterTile` / `advanceCropDay` / `harvestCrop`, with regrow and daily-water rules) that advances stages on the simClock day tick, plus `applyToolToTiles(tiles, center, pattern, apply)` with `squarePattern` / `diamondPattern` / `rectPattern` for watering-can/hoe AoE under the cursor. `createCropField` wraps a tile grid; `createDayTicker` reads day rollovers off `ctx.time.calendar()`. For Stardew/Coral Island/Palia farming. (#75)
- **Survival & environment layer.** Renderer-free `@jgengine/core` primitives for survival games (Project Zomboid moodles, The Long Dark / Green Hell survival, DayZ / Tarkov per-limb health, weather-driven games, Nightingale realm cards), plus the `@jgengine/shell` fire visuals.
  - `@jgengine/core/survival/decayMeter` — named `decayMeter`s (`createDecayMeterSet`) that drain/recover on game-time `dt`, refill from consumables/actions, raise threshold moodles, and take environment-driven rate modifiers (cold speeds warmth loss, toxic biomes drop oxygen).
  - `@jgengine/core/survival/moodle` — a stacking status-effect display distinct from numeric bars: `stackMoodles(...)` folds meter/ailment/buff moodles worst-first, and `createMoodleStack()` holds timed buffs (Valheim-style concurrent food buffs) that expire on `tick(dt)`.
  - `@jgengine/core/survival/regionHealth` — a multi-region health component (`createMultiRegionHealth`): per-part pools with vulnerability + vital death, a stacking ailment queue (bleed/fracture) that drains over time, and per-injury treatment items (`treat("bandage")`). Shares the moodle display via `ailmentMoodles()`.
  - `@jgengine/core/world/envField` — sampleable environment fields (`createEnvironmentField`): temperature, wetness, light-exposure, and ambient-light at any world position and time, with sky occluders, heat sources, and a day/night sun cycle. Meters and spawn gating read it renderer-free.
  - `@jgengine/core/world/weather` — weather → gameplay modifiers (`resolveWeather` → grip/visibility/structure-damage/chill/ignition/spread) over a game-owned table, plus a **coarse cellular** fire-spread grid (`createFireGrid`, not a fluid solver): wind-biased propagation, fuel burn-through, firebreaks, and rain/wetness suppression.
  - `@jgengine/core/world/realm` — runtime realm composition (`composeRealm`): assemble a played instance from a deck of modifier cards (major biome + minor weather/day-length/spawn cards) that override environment params and spawn tables, recomposing a sampleable environment field on top of the weather hooks.
  - `@jgengine/shell/weather` `FireSpreadLayer` — renders a `FireGrid`'s burning flames + scorched cells; a `survival-demo` game wires the whole stack (moodle stack, per-part body panel, condition meters, weather readout, spreading fire).
- `@jgengine/core/audio/audioFalloff` — the audio contract + pure distance→gain math. `SoundDef`/`AudioBusDef` catalog types, `computeFalloffGain(distance, config)` (`"linear" | "inverse" | "none"` curves), and `resolveEmitterGain`/`distance3` helpers. No Web Audio in core — this is the tested math the shell plays from.
- `@jgengine/core/time/beatClock` — a BPM tick signal, separate from `simClock`. `createBeatClock({ bpm, beatsPerBar? }, onBeat?)` advances on **game-time** `dt` and fires `onBeat` per crossed beat; `createBeatInputBuffer` auto-corrects an off-beat press to fire on the next beat tick (`nextBeatTime` is the underlying pure quantization). For rhythm-quantized combat (Hi-Fi Rush–style).
- `@jgengine/shell` positional audio — `PlayableGame.audio = { sounds, buses? }` + `entitySounds`/`objectSounds` (kind/catalog-id → sound id, same convention as `entityModels`) declare looping positional emitters; the shell (`shell/audio/audioEngine`, `shell/audio/AudioComponents`) owns the `AudioContext`, attaches the listener to the camera every frame, and drives emitter gain from the core falloff curve. Music/SFX buses are plain per-bus gain nodes. No per-game Web Audio glue.
- `@jgengine/ws/voiceChannel` — a thin, coarse voice-channel router riding the same transport/presence model (channel/falloff model only, no WebRTC media). `createVoiceChannelRouter(channels?)`: `join`/`leave` any number of channels at once, `updatePosition` for proximity falloff (reusing the core audio falloff curve), `setMuted`, and `resolveRoutes(listenerUserId)` — one `{ fromUserId, channelId, gain }` per shared channel, so a positional proximity channel and a flat-gain walkie/crew channel resolve simultaneously and independently.
- `@jgengine/core/interaction/skillCheck` — a moving-target-zone, timed minigame (`evaluateSkillCheck`, `skillCheckMarkerPosition`, `skillCheckZoneAt`) for casting/reeling, active-reload, and production minigames from an `item.use` handler.
- `@jgengine/core/interaction/qte` — a timed-prompt QTE sequencer (`evaluateQteSequence`, `pendingQteStep`, `qteProgress`).
- `@jgengine/core/scene/captureCheck` — `captureChance`/`rollCapture`, an hp%+catchPower→probability formula for capture/tame mechanics.
- `@jgengine/core/scene/roster` — `createRoster()`, a persisted per-owner roster (capture/release/list/setEquipped) wired onto the runtime as `ctx.game.roster`, distinct from the ephemeral `game.social.party`.
- `@jgengine/core/stats/rollCheck` — `rollCheck`, a d20-style roll vs. DC with advantage/disadvantage and critical detection.
- Dialogue choices can now gate a branch behind a roll: `DialogueChoice.check` (+ `onSuccess`/`onFailure`) on the `@jgengine/react/components` `DialogueDef`/`DialogueChoice` types, resolved via `resolveDialogueInvoke`.
- `@jgengine/react` gained `SkillCheckBar`, `QteTrack`, and `CaptureOdds` headless minigame UI components, plus a `useRoster(userId?)` hook and extra `DialogueBox` slot classNames (`lineClassName`, `speakerClassName`, `choicesClassName`, `choiceClassName`, `checkClassName`).
- **Navigation & pointer-driven input.** A renderer-free foundation for click-to-move, RTS unit command, and pointer verbs.
  - `@jgengine/core/nav/navGrid` — a walkable grid + A* pathfinding (`createNavGrid`, `findPath`, `smoothPath`); blocked start/goal snap to the nearest walkable cell, paths are string-pulled, and one graph feeds both click-to-move and AI routing.
  - `@jgengine/core/nav/pathFollow` — an authored-polyline mover for tower-defense creeps needing no navmesh (`createPathFollow` + pure `advancePathFollow`); `pathFromNav` lifts an A* route so the same follower drives click-to-move.
  - `@jgengine/core/input/pointer` — the renderer-free `PointerHit` contract (`{ point, normal, entity, object }`) plus `aimToPoint` / `moveTargetFromHit` / `groundOf` so gameplay consumes cursor hits (aim, move-to, routing) without three.js.
  - `@jgengine/core/scene/selection` — pure box-select math (`createSelectionSet`, `screenRect`, `selectWithinRect`, `isMarquee`).
  - `@jgengine/core/interaction/contextMenu` — `contextVerb` / `buildContextMenu` / `contextVerbInput`; catalog entities/objects carry `verbs` for right-click menus.
  - `PlayableGame.pointer` config (`moveCommand`, `select`, `orderCommand`, `contextMenu`, `aim`) — the `@jgengine/shell` `GamePlayerShell` casts the cursor (`pointer.worldHit()`), renders a drag-marquee + right-click verb menu, routes primary-ability aim to the cursor, and remaps orbit to middle-drag so the left button drives verbs.
- **AI over the navmesh.** A renderer-free `ai/` domain for directors, aggro, jobs, and crowds — all ticking on game-time `dt` (the `ctx.time` simClock delta, so pause/fast-forward come free) and routing over the `nav/` navmesh.
  - `@jgengine/core/ai/spawnDirector` — a budget/escalation spawn director for wave shooters and difficulty directors (`createSpawnDirectorState` + pure `advanceSpawnDirector`). Per-`WaveManifest` budgets spent on weighted `SpawnEntry`s (`cost`/`weight`/`minWave`) under a `maxAlive` cap; `duration` auto-advances waves (or `advanceWave` on clear); budget trickles, ramps with sim-time (`escalationPerSecond`), scales per player, and surges on `raiseAlert`. Seeded/deterministic; `pickSpawnPoint` biases placement toward players.
  - `@jgengine/core/ai/threat` — an aggro/threat table (`createThreatTable`): accumulate/`decay` per source, `highest({ current, stickiness })` for sticky MMO target selection feeding `scene/targeting`, `ranked` for a threat meter.
  - `@jgengine/core/scene/behaviors` gained `patrol({ waypoints, speed, loop? })` — a waypoint route as a `BehaviorDescriptor` on top of `wander`, driven by `pathFollow` over `findPath`.
  - `@jgengine/core/ai/jobBoard` — a task/job queue NPCs pull from (`createJobBoard`): `post`/`claim`/`assign`/`release` plus a per-tick `advance(worker, dt, { distanceToStation })` state machine (`travelling → working → done`, `repeat` for production loops) that reports on completion. For colony/companion assignment (Palworld, Schedule I, Sons of the Forest).
  - `@jgengine/core/ai/crowd` — a flow field with congestion + POI routing for management sims (`computeFlowField` Dijkstra steering without per-agent A*, `createCrowdField` per-cell occupancy whose `penalty()` reroutes flow around crowds, `selectPoi` weighting appeal/proximity/capacity with a `findPath`-length distance override).
- **Dropped-item world entities & loot filter.** Loot no longer has to teleport straight to inventory — it can lie on the ground as a rarity-coded, beam-and-labelled `worldItem` you walk up to and grab (Borderlands/Diablo loot beams, ARPG ground loot, Apex/Lethal-Company pick-ups).
  - `@jgengine/core/game/worldItem` — the `worldItem` scene-entity model (position + item ref + rarity): `ctx.scene.worldItem.spawn / get / list / nearestInRadius / pickup` (a third scene bucket alongside object/entity, never merged into inventory). Pure helpers `createWorldItemStore`, `resolveDeathDrops` (splits rolled drops into scattered ground items vs direct grants), `scatterOffset` / `scatterPosition` (the on-death scatter impulse), `selectNearestWorldItem` (pickup-radius nearest selection), and `resolveWorldItemPresentation` (rarity baseline + filter overlay → render binding). Emits `worldItem.dropped` / `worldItem.picked_up`.
  - `onDeath.dropMode: "world"` (+ optional `onDeath.scatter`) routes an entity's death drops through scattered ground items instead of granting straight to the killer; currency still grants directly. Item catalog entries carry `rarity` / `baseType` read by the render binding + filter.
  - `@jgengine/core/game/lootFilter` — a PoE/Last-Epoch-style rule evaluator (`lootFilter`, `evaluateLootFilter`) keyed on rarity + base type + affix-tier that hides/recolors/beams/labels ground items. Rules are **data the game supplies**; first match wins, field-by-field over the rarity baseline. The render binding is engine-owned.
  - `PlayableGame.worldItem` config (`rarityStyle`, `filter`, `pickupRadius`, `beamHeight`) + `pointer.grabWorldItems` — `@jgengine/shell`'s `WorldItems` draws the rarity beam/color/label per drop and `GamePlayerShell` grants + despawns on a click within pickup radius (using `pointer.worldHit()`). `@jgengine/react`'s `useWorldItems()` / `useNearestWorldItem(radius)` drive a HUD pickup prompt.

- **Interactive placement, building & terraform.** Data-only placement becomes the build tooling of Valheim/Enshrouded/The Sims/Fortnite/Dinkum/Palia, all pure `@jgengine/core/world` driven by `pointer.worldHit()`, with shell renderers for the ghost/tint/brush.
  - `@jgengine/core/world/placementController` — `createPlacementController(footprint)` owns the placement ghost: `hover(hit)` → `PlacementPreview` (valid/invalid tint wrapping `validatePlacement`), `rotate`, grid/free/surface `snapMode`, `commit` → `PlacementCommit`.
  - `@jgengine/core/world/connectors` — typed connector sockets with `snapToNearest` snap-to-nearest-compatible (`socketsCompatible`, `worldSockets`).
  - `@jgengine/core/world/support` — `solveSupport` walks the connector graph to ground (`supported`/`unsupported`/hop-`distance` for white→red decay); `toDebrisBodies` sinks collapsed pieces into the `PhysicsWorld`.
  - `@jgengine/core/world/walls` — `createWallDrawTool` (drag walls → auto-enclose → `footprintFromWalls` → `autoRoof` hip/gable/flat) plus `createSurfacePaint` for per-tile floor/wall surfaces.
  - `@jgengine/core/world/placedStructureStore` — `createPlacedStructureStore` save/load/select/move/delete with a `snapshot`↔`load` round-trip that survives reload.
  - `@jgengine/core/world/terraform` — `createEditableTerrain({ bounds, base, cellSize })` makes a `TerrainField` you can **write back to** via `apply(edit)` (raise/lower/flatten/paint), and `createTerraformBrush` is the cursor tool. This height-offset grid is the shared terrain-edit write-back pattern.
  - `@jgengine/core/world/buildPermissions` — `createPlotPermissions` (per-plot/guild `BuildRole` edit authority) + `createContributionPool` (co-op pooled-resource contribution model).
  - `@jgengine/shell` renderers: `structures/PlacementGhost` (tinted ghost), `terrain/EditableGround` (renders an `EditableTerrain` with surface paint), `terrain/TerraformBrushCursor` (brush ring); the `builder-sandbox` demo game wires them to `pointer.worldHit()`.
- **Map, fog of war & contextual ping.** Minimap/world-map/fog/compass + a squad ping verb, built on renderer-free core state, a shell terrain bake, and react HUD components. (Stacked on the pointer foundation above.)
  - `@jgengine/core/world/markers` — a reactive `createMarkerSet()` of `MapMarker`s (objective/entity/loot/ping) with `add`/`remove`/`query`/`prune`/`subscribe`; `DEFAULT_MARKER_KINDS` supplies content-agnostic colors + glyphs.
  - `@jgengine/core/world/fog` — reveal-on-event fog: `createFogField({ bounds, cellSize })` with `reveal` (dig/act) and `revealAlong` (walked trail); revealed cells stay revealed and render from a stable `cells()` snapshot.
  - `@jgengine/core/world/minimap` — pure projection + bearings (`projectToMinimap`, `clampToMinimapEdge`, `compassBearing`, `headingToBearing`, `bearingToCardinal`, `relativeBearing`).
  - `@jgengine/core/game/ping` — `classifyPing(hit, …)` (hostile → enemy, tagged object → its category, ground → location) + `createPingSystem` that classifies, drops a categorized marker, and broadcasts a `PingPayload` over the existing party feed under `PING_FEED_ACTION`. `PlayableGame.pointer.pingCommand` binds the `ping` action → `worldHit()` → your command.
  - `@jgengine/react` — `useMarkers` / `useFog` hooks and `Minimap` / `Compass` / `WorldMap` headless components (bind a core `MarkerSet`/`FogField`, override the `kindStyles` palette).
  - `@jgengine/shell/map` — `bakeTerrainMap` (top-down terrain image for the map background) and `MapMarkerBeacons` world-space beacons; the `extraction-map` demo game wires the whole loop.
- **Physics joints & constraints** — `PhysicsWorld` gains `hingeJoint`/`fixedJoint`/`distanceJoint`/`springJoint(JointOptions)` between two bodies or a body and a fixed world point, plus `removeJoint`, `setJointAnchor` (move a follow point), `setJointRest`, and `readJointSegments`. The sim is translational: `hinge`/`fixed` pin the shared anchor, `distance` holds a separation, `spring` drives toward `restLength` with stiffness/damping. Foundation under vehicle suspension, ragdolls, grapples, and carry. Tune the buffers with `jointCapacity` / `jointCorrection` in `PhysicsWorldConfig`.
- **Physics collision → gameplay-event hook** — `PhysicsWorld.onCollision(listener, minApproachSpeed?)` delivers each impacting contact as a reused `CollisionEvent { a, b, nx, ny, nz, approachSpeed, impulse }` during `step`. The seam crash-damage and destruction read; contacts otherwise stay inside the sim.
- **`@jgengine/core/physics/ragdoll`** — `createRagdoll(world, { bones, links, balance? })` builds a jointed multi-body character on the joint API: floppy by default, or active-ragdoll when a balance motor drives the root toward a target height (`Ragdoll.balance(dt, moveX?, moveZ?)`), with `centerOfMass`, `applyImpulse`, `remove`.
- **`@jgengine/core/physics/carryable`** — `Carryable` grabs a physics body to a moving follow point via a spring constraint (the raycast pick is the caller's), supports shared multi-owner carry (follow point = owner average), drop/throw, and `carrySpeedMultiplier(mass, capacity, owners)` encumbrance.
- **`@jgengine/core/physics/forceVolume`** — `ForceVolume` (impulse/velocity/accelerate trigger region, `once` for boost pads vs continuous fans) and `PlatformCarry` (carry bodies standing on a moving platform by its per-`step` delta).
- **`@jgengine/core/physics/spatialGrid`** — `SpatialGrid`, a broad-phase uniform grid over the x/z plane, separate from the rigid-body sim, for cheap same-tick proximity across hundreds–thousands of simple movers: `rebuild(count, xs, zs)` then `queryCircle` (swarm enemies hitting a player/AoE) or `forEachPair` (mutual separation).
- **`@jgengine/shell/world/InstancedJoints`** — debug LineSegments overlay drawing a `PhysicsWorld`'s active joints from `readJointSegments`.
- **`@jgengine/core/physics/traversal`** — `Grapple` (a fired-anchor rope on the joint API: `fire`/`reel`/`payOut`/`moveAnchor`/`release` for grapple, zipline, and swing traversal) and `Glide` (reduced-gravity, forward-thrust wingsuit/glider via `apply(dt, steerX, steerZ)` before `step`). Grapple/zipline/glide (Sekiro, Deep Rock, Enshrouded) over the shared physics sim.
- **`@jgengine/core/world/carve`** — runtime destructible terrain. `VoxelVolume` is an editable dense voxel grid with `carve`/`deposit` sphere ops honouring per-material `strength` against a tool (Deep Rock dig, Astroneer deposit); `CarvableField` / `carvableTerrain(base)` writes craters and mounds back into any `TerrainField`'s height so ground-snap, collision, and the terrain mesh all see the deformation (Helldivers 2 craters).
- **`@jgengine/core/physics/structure`** — `StructureGraph`, a structural-integrity graph over a building: nodes (pieces), load-bearing edges, anchored foundations. `damage`/`damageEdge`/`severEdge` recompute reachability to an anchor and return one `CollapseEvent` of every newly-disconnected piece; `toDebris(world, event)` sinks the fallen pieces into a `PhysicsWorld` as rigid bodies. Coarse by design — the collapse **event** replicates, not each fragment (The Finals, Rainbow Six).
- **`@jgengine/shell/terrain/CarvedTerrain`** — meshes any `TerrainField` (a `CarvableField` with its craters/mounds) into a vertex-coloured deformed ground; `createFieldGroundGeometry` is the underlying geometry builder.
- **Analog axis input** (`@jgengine/core/input/axisInput`) — `AxisInput { throttle, brake, steer, handbrake }` continuous channel, distinct from the digital action bindings. `AxisChannel` ramps held keys into pedal-like analog values (`sample`) or takes a raw gamepad axis (`setAnalog`); `DRIVE_AXIS_BINDINGS` is a ready WASD/arrow map.
- **Vehicle controller** (`@jgengine/core/physics/vehicleBody`) — `createVehicleBody(world, config)`: chassis body + per-wheel suspension raycast + spring-damper (on `springJoint`) + a `GripCurve` (`sampleGripCurve`) that bleeds lateral velocity for cornering and, under handbrake, drift. Driven by an `AxisInput`; still a colliding body, so contact feeds crash damage. (Rocket League, Trackmania, Wreckfest.)
- **Buoyant boat** (`@jgengine/core/physics/buoyancy`) — `createBuoyantBody(world, { body, water, … })` floats a body on a CPU `waterSurface` (Archimedes per hull point + water drag) and, given an `AxisInput`, drives it as a boat (thrust + yaw + keel).
- **Mount / rideable controller** (`@jgengine/core/scene/mount`) — `createMountController()` transfers camera + input to a driven entity with its own movement kit: `register({ id, kit, seats })`, `mount`/`dismount`, `cameraTarget`/`driveTarget`, `driver`/`occupants`. Control seat drives, passenger seats ride (multi-seat shared vehicles). (Palworld, V Rising, Sea of Thieves.)
- **Crash-damage stages** (`@jgengine/core/physics/damageZones`) — `createDamageModel({ zones, disableAt })` maps accumulated `onCollision` impulse to coarse discrete stages (`absorb`/`routeCollision`), with an optional `detachStage` (part → debris) and a `disabled` threshold. Coarse stages, not soft-body. (Wreckfest.)
- **Race state machine** (`@jgengine/core/game/race`) — `raceTrack({ checkpoints, laps })` + `createRaceState({ track, win })` emit `checkpoint.hit` / `lap.completed` / `position.changed` / `race.finished` on game time, keep split times, resolve a pluggable win condition (`firstPastPost`, `topK`, `everyoneFinishes`, `lastStanding`), and `resetToCheckpoint`. (Trackmania, Mario Kart, Fall Guys.)
- **Lag-compensated hit registration** (`@jgengine/core/multiplayer/lagCompensation`) — `createPositionHistory({ historyMs })` retains an N-sample position ring per entity; `rewindTimestamp(now, rtt, interpDelay)` and `resolveHitscan(history, targets, ray, atMs)` (ray-sphere) register a shot where the target *was* at the shooter's perceived time. Coarse server-side rewind, not full rollback. The `@jgengine/node` ws host records accepted presence poses and exposes `server.rewind({ serverId, atMs })` (`positionHistoryMs` option). (Valorant, Apex.)
- **Simultaneous hidden-commit + reveal** (`@jgengine/core/multiplayer/simultaneousCommit`) — `createCommitRound({ participants })`: each player `seal`s a sealed action, nothing is readable until `allSealed()`, then `reveal()` returns commits in deterministic participant order (independent of network arrival) for `resolveCommits`. (Marvel Snap.)
- **Combat-snapshot replay** (`@jgengine/core/multiplayer/combatSnapshot`) — `serializeBoard({ ownerId, units, stats, seed })` deep-freezes a build into a portable `BoardSnapshot`; `replayCombat(a, b, rules)` resolves it deterministically (seeded PRNG) against a live opponent's snapshot — an async-PvP primitive distinct from the live-sync adapters. (The Bazaar.)
- **Shared-vehicle stations** (`@jgengine/core/scene/stationClaim`) — `createStationClaim(controller?)` layers facet stations (`steer`/`sails`/`cannon`) on `scene/mount`: `register({ id, kit, stations })`, `claim`/`release`, `controllerOf(vehicleId, facet)`, `facetOf`, `openFacets`, `crew`. One control station drives the hull; the rest ride but command their facet. (Sea of Thieves.)
- **Shared / group wallet** (`@jgengine/core/economy/sharedWallet`) — `createWalletBook()` holds per-`WalletScope` balances (`userScope`/`groupScope`) beside the per-user `economy/wallet`: `grantTo`/`chargeFrom`/`balanceIn`, with a `contributionOf`/`contributorsOf` ledger tracking who funded a shared pool. (Schedule I company funds, Lethal Company quota.)
- **Session matchmaking** (`@jgengine/core/multiplayer/matchmaking`) — data-driven browse/filter (`browseSessions`, `matchesFilter`, `quickMatch`) hiding private/closed lobbies, plus join-by-code (`findByJoinCode`, `normalizeJoinCode`, `generateJoinCode`). The node host carries generic `SessionAttributes` (`label`/`mode`/`visibility`/`joinCode`/`tags`) on `GameServerRecord`/`ServerListing` and gains `browseServers` + `joinByCode`; the ws backend exposes `browse` / `joinByCode` / `createSession`. (Fortnite island browse, Web Fishing code lobbies.)
- **Camera rig library** (`@jgengine/shell`, config types in `@jgengine/core/game/playableGame`) — the single orbit camera is now one of eight rigs, selected and tuned through `PlayableGame.camera` (never by writing camera positions from `onTick`). Set `camera.rig`:
  - `topDown` — fixed height/pitch/yaw with decoupled follow for ARPG-iso and top-down (Diablo IV/PoE 2/Last Epoch, Hades II); `camera.topDown: { height, pitch, yaw, followSmoothing, zoom }`.
  - `rts` — free-pan / edge-scroll / rotate / zoom independent of any avatar (The Sims 4, Manor Lords, Two Point Museum); `camera.rts: { panSpeed, edgeScroll, rotateSpeed, bounds, start }`.
  - `shoulder` — over-the-shoulder with ADS transition and shoulder-swap, reticle decoupled from camera center (Remnant II, Helldivers 2, The First Descendant); `camera.shoulder: { shoulderOffset, distance, ads, side }`.
  - `lockOn` — yaw bound to the player→target vector with the move axis reinterpreted as strafe (Elden Ring, Sekiro); `camera.lockOn: { targetEntityId?, distance, framingBias, yawSmoothing }`.
  - `chase` — speed-reactive vehicle chase (speed→FOV curve, spring-arm damping, procedural shake) plus fixed `cockpit`/`hood`/`rear` views (Forza Horizon 5, Rocket League, Trackmania); `camera.chase: { distance, springDamping, fov, shakePerSpeed, view }`.
- **Every rig accepts `followEntityId: null`** — avatar-less games (city-builders, card games, auto-battlers) can now mount a camera; the orbit rig no longer bails when there is no follow target.
- **Camera-shake / trauma channel** — every rig reads a shared trauma channel; feed it from any system with `import { cameraShake } from "@jgengine/shell/camera"` (`cameraShake(amplitude, decayPerSecond?)`, amplitude 0..1) or from React via `useCameraShake()`. Tune with `camera.shake: { maxOffset, maxRoll, decayPerSecond, exponent, frequency }`. (Combat hitstop and other systems feed the same channel.)
- **Cinematic camera + mode-swap cross-fade** — `camera.cinematic: { keyframes: [{ position, lookAt, fov?, duration?, ease? }], loop? }` plays a scripted keyframe path over the active rig, and `camera.transitionSeconds` cross-fades the camera when the rig changes so mode swaps no longer hard-cut.
- Pure rig math (shake decay/trauma, spring-arm damping, speed→FOV, lerp/cross-fade, offset/strafe vectors, keyframe sampling) is exported from `@jgengine/shell/camera` as testable functions.
- **Sensors, vision & observer tools** (`@jgengine/core/sensor/*`, renderers in `@jgengine/shell/vision` and `@jgengine/shell/replay`) — a coherent "query hidden/tagged/framed world state and surface it" family:
  - **Reveal vision** (`sensor/revealQuery`) — `createRevealQuery` is an occlusion-ignoring tagged-entity radius query (`inRadius` already never checks occlusion; this scopes it to catalog-declared tags for a vision readout) paired with a toggleable screen-space reveal effect (`shell/vision/RevealVision`: `RevealHighlights` for through-wall 3D highlights, `RevealScreenTint` for the full-screen tint) — Dark Sight / detective-vision / wallhack-style highlight (Hunt: Showdown).
  - **Hidden-state probe** (`sensor/hiddenStateProbe`) — `probeHiddenState`/`probeHiddenStateAll` read a hidden zone/entity state variable in range and surface a distance-weighted reading; `shell/vision/HiddenStateProbeHud`'s `SensorReadoutMeter` renders it as a handheld sensor needle (EMF reader/spirit box/thermometer/geiger, Phasmophobia).
  - **View-frustum sensor** (`sensor/frustumSensor`) — `projectToView`/`framingScore`/`createFrustumSensor` answer "what's in this held camera's view, how well framed, and for how long" (dwell time resets the instant a subject leaves frame); `shell/vision/FrustumSensorHud`'s `FrustumSensorReadout` drives it off the live render camera for a photo-mode HUD (Content Warning).
  - **Session-recording buffer** (`sensor/recordingBuffer`) — `createRecordingBuffer` appends timestamped snapshots on game-time and seeks/scrubs them for replay, photo mode, or kill-cam; `shell/replay/useSessionRecorder` records an entity's pose every frame.
  - **`observer` camera rig** (config in `@jgengine/core/game/playableGame`: `ObserverCameraConfig`) — a detached spectator/photo cam bound to any entity or fixed point that reads no player input at all (van CCTV spectate, Forza-style photo mode free cam, Trackmania ghost/kill-cam).

- **Possession** (`@jgengine/core/scene/possession`, `createPossession`) — a player can own N scene entities and switch which one is under active control, distinct from the social party. `ctx.player.possession.own/disown/owns/listOwned(userId, entityId)` tracks ownership; `possess(userId, entityId)` swaps active control (rejecting entities the user doesn't own), flips the previous/next entity's `EntityRole` between `"player"`/`"npc"` (reusing entity control, not forking it), and emits `possession.swapped`. `active(userId)` defaults to `userId` itself until a swap happens. `@jgengine/shell`'s `GamePlayerShell` rebinds WASD movement, targeting, hotbar `from`, and the camera rig's `followEntityId` to the active possessed entity on every swap — no per-game camera glue required.
- **Form / shapeshift** (`@jgengine/core/scene/form`, `createForms`) — a `form` bundles movement params + an ability-id list + a mesh (reusing the entity's catalog name, so mesh, movement defaults, and receive/role all follow the swap through the existing name-keyed resolution — no parallel mesh system). `ctx.scene.entity.form.register(defs)` in `onInit`; `shapeshift(instanceId, formId, durationSeconds?)` applies the bundle and optionally reverts automatically after `durationSeconds` of **game time** (`ctx.time.after`, so it obeys pause/fast-forward); `revert(instanceId)` reverts early. Emits `form.changed`.
- **Cosmetic loadouts + emote broadcast** (`@jgengine/core/game/cosmetics` `createCosmetics`; `@jgengine/core/game/social` `Social.emotes`) — `ctx.player.cosmetics.register(defs)` + `apply(userId, loadoutId)` / `equip(userId, slot, cosmeticId)` manage a per-player cosmetic slot map (skin/back/aura/…), emitting `cosmetics.changed`. `ctx.game.social.emotes.play(fromUserId, emoteId, radius?)` broadcasts to nearby **player**-role entities (reusing `scene.entity.inRadius`, not a parallel proximity system) and emits `emote.played` — bind it through the existing `ctx.game.feed` primitive (`feed.bind("emote.played")`) for a HUD feed, no new hook needed.
- `entityStore`'s `update()` patch now also accepts `name`, so possession/form (and any future system) can retarget an instance's catalog id without despawn/respawn.

An additive layer over effects/projectiles/death that adds melee/action feel. Every model is a renderer-free `@jgengine/core` factory a game composes per entity; `@jgengine/shell` renders the world/HUD side. No existing API moved.

- **Animation state machine** — `@jgengine/core/combat/animationState`: `createAnimationState({ clips })` over `AnimationClip`s whose `FrameRange`s tag `windup | active | recovery | cancel` windows. The root contract combat/defense subscribe to (`inPhase`, `isActive`, `canCancel`, `activeWindowMs`).
- **Shared accumulator meter** — `@jgengine/core/stats/accumulatorMeter`: `createAccumulatorMeter({ max, mode, decayPerSecond, decayDelayMs, tiers })`, the fill/decay/threshold-fire/tier primitive. `@jgengine/core/combat/breakMeters` builds `createStaggerMeter` (poise/posture break → riposte) and `createBuildupMeter` (bleed/frost/rot proc) on it.
- **Defensive window + attack tags** — `@jgengine/core/combat/defensiveWindow` (`resolveDefense` / `createDefensiveWindow`, parry/block/dodge evaluated against the attacker's active frames) reading `@jgengine/core/combat/attackTags` (`attackMeta`, unblockable/thrust/sweep/grab; `counters` for Mikiri-style reads).
- **Combo strings** — `@jgengine/core/combat/comboString`: `advanceCombo` / `createComboRunner` — ordered attacks with stance-conditioned cancel points over the animation SM.
- **Dash / dodge** — `@jgengine/core/movement/dash`: `createDashState` — directional burst + i-frame window + stamina/cooldown.
- **Hit reaction, telegraphs, typed damage numbers** — `@jgengine/core/combat/hitReaction` + `ctx.scene.entity.hitReaction(...)` (knockback impulse + hitstop + `combat.hitReaction` shake channel); `@jgengine/core/combat/telegraph` + `ctx.scene.entity.telegraph(...)` (windup→activation ground decal bound to an effect, drawn by the shell); `ctx.scene.entity.floatText({ crit, element, hitType, scale })` styled by `@jgengine/shell/world/floatTextStyle`.

Genre systems over the existing effects/projectiles/targeting/loot primitives. Every model is a renderer-free `@jgengine/core` factory the game ticks on game-time `dt`; `@jgengine/react` adds four-state slot binding hooks. No existing API moved. The ult/streak meters build on the `stats/accumulatorMeter` from the combat-feel layer above.

- **Ability kit** — `@jgengine/core/combat/abilityKit`: `createAbilityKit([{ id, cooldownMs, chargesMax?, resourceCost?, castType? }])` models an ability slot **separate from an inventory item**, exposing the four HUD states `ready | cooldown | no-resource | just-cast` plus charges + cooldown fraction. Resource-agnostic — reports `no-resource` against a supplied `resourceAvailable`, the game spends. (MOBA/ARPG action bars, hero-shooter kits.)
- **Event-fed meters** — `@jgengine/core/stats/eventMeter`: `createEventMeter({ max, mode, gains, resets?, tiers? })` on the shared accumulator. Mode `"hold"` = ult/adrenaline charge (`feed` combat tags, `ready()`, `consume()`); mode `"reset"` = kill-streak/combo with tiered thresholds that resets on a break tag. (Overwatch/Marvel Rivals ult, Returnal/DMC streak.)
- **Auto-target policy** — `@jgengine/core/scene/autoTarget`: `selectAutoTarget` / `createAutoTargeter` — zero-input per-tick target selection `nearest | farthest | random | strongest | weakest | first | last` (path-progress aware). (Vampire Survivors auto-fire, Bloons tower priority.)
- **Resistance matrix** — `@jgengine/core/combat/resistance`: `resolveResistance` / `resistanceScale` — damage-category × target-property → `immune | resist | normal | vulnerable` multiplier over the `receive` gate. (Bloons pop-types, elemental RPG weaknesses.)
- **Run draft** — `@jgengine/core/game/runDraft`: `createRunDraft` / `createRunModifierStack` — pause, present N weighted picks (`pickWeighted`), choose, stack the modifiers for the run (aggregated onto `stats/statModifiers`). (Vampire Survivors level-ups, Hades boons.)
- **React** — `@jgengine/react` `useAbilitySlots` / `useAbilitySlot` (four-state snapshots) and `useEventMeter` (ult/streak bar view).

- `@jgengine/core/item/durability` — per-instance item durability + repair. A catalog `DurabilitySpec` (`max`, `wearPerUse`/`wearPerHit`, `disableAtZero`, `repair`); `createDurability`/`wear`/`isDisabled`/`durabilityFraction` for the wear loop, `repairQuote(spec, state, { station?, to? })` for a quote-then-apply repair (material cost scaled by points restored, optional `qualityLossPerRepair` shrinking `max`), and `createDurabilityTracker()` to hold state per instance id. For weapon/tool/armor degradation repaired at stations.
- `@jgengine/core/item/affix` — rarity-weighted procgen roller. `createAffixRoller({ pools, rarities })` turns `base × rarity` into `{ rolled affixes, computed stats, name }`: draws `affixCount` distinct affixes without replacement (weighted via the engine `pickWeighted`), computes stats (base × rarity scale, then `add` then `mul` affixes), and composes a name from rarity + prefix/suffix parts. `seededRng(seed)` gives deterministic drops. For looter-shooter / ARPG generated weapons.
- `@jgengine/core/item/modularItem` — parts-in-typed-slots assembly. `ModularItemDef` with category-constrained `MountSlotDef`s; `install`/`uninstall` validate slot + category + occupancy, `computeEffectiveStats` rolls part `stats` (additive) then `multipliers` over the frame's `baseStats`, `missingRequiredSlots`/`isComplete` gate a buildable whole; `createModularItem(def)` is the stateful wrapper. For piece-by-piece guns and mech loadouts.
- `@jgengine/core/inventory/storageTier` — tiered extraction-economy inventory. A `tier: "carried" | "banked"` on inventory containers (`InventoryDeclaration.tier`); `partitionOnDeath` splits a death snapshot into kept (banked) vs lost (carried) with merged stacks, `createDeliveryQueue()` is the delayed-delivery (insurance) hook (`schedule`/`due`/`claimDue` on the game clock), `insureLost` filters the lost set to insured items with a delayed `deliverAt`, and `resolveConsolation` yields a baseline loadout id (apply via `applyLoadout`) for the post-death consolation grant. The inventory foundation the extraction session/round machines build on.
- `InventoryDeclaration` (`@jgengine/core/game/defineGame`) gained an optional `tier?: StorageTier` flag so containers declare carried-vs-banked storage directly.
- `@jgengine/core/session/contestedChannel` — the interrupt-on-damage progress objective (plant/defuse, cash-out, urn deposit, hold-to-extract). `createContestedChannel({ duration, interruptOnDamage?, resetOnInterrupt?, favorability?, ratePerOccupant?, contested?, decayRate? })`: `start(team)`, `tick(dt, occupants)` (per-team occupancy → `start`/`tick`/`contested`/`paused`/`complete` events), `damage()` interrupts. `favorability`/`ratePerOccupant` scale the fill rate; `contested: "pause" | "decay"` handles a contesting team.
- `@jgengine/core/session/roundState` — the buy→live→end match machine. `createRoundState({ phases, teams, maxRounds?, winReward?, lossBonus? })`: `tick(dt)` runs phase timers and auto-advances rounds, `concludeRound(winner)` settles win + escalating loss-bonus economy (`lossBonusFor`), `onPhaseEnd(hook)` gates commerce/spawns, `match.end` fires at `maxRounds`.
- `@jgengine/core/combat/downed` — the alive→downed→dead revive chain. `createDownedState({ bleedoutSeconds, reviveSeconds?, reviveHealthFraction?, banner? })`: `down`/`tick` (bleedout → `died` + optional banner), `revive(id, dt)` accumulates ally hold time, `finish` executes, `respawnFromBanner` beacons back. Sits in front of engine death resolution.
- `@jgengine/core/session/ring` — the shrinking battle-royale safe zone. `RingConfig` = `{ center, phases }`; `ringSampleAt(config, t)`/`createRing` give the live `{ center, radius, damagePerSecond }` (interpolated on the game clock), `isOutside`/`distanceOutside`/`damageOutside(t, dt, positions)` for out-of-bounds DoT.
- `@jgengine/core/session/extraction` — the raid-scoped extract-to-bank session, composed from the contested channel + `inventory/storageTier`. `createRaidSession({ extracts, insurance?, consolation? })`: `beginExtract`/`tickExtract`/`damage` drive hold-to-leave, `resolveExtraction` banks everything carried, `resolveDeath` partitions/insures/consoles via storage tiers, `claimDeliveries(now)` drains insured returns.
- `@jgengine/core/runtime/persistenceScope` — run-vs-meta persistence split with reset boundaries. `partitionScopes`/`resetRun`/`mergeScopes` over flat records, `clearRunFields`/`applyRunReset` over player rows/profiles, `planScenarioReset(...)` normalizes a season/scenario wipe applied through the new optional `HostPersistence.resetScenario` — implemented by `@jgengine/sql` (deletes a server's chunks + session and run-resets each profile in one transaction, keeping account meta).


## 0.6.0

An additive release: **every 0.5.0 API is unchanged**, so upgrading is only a
version bump. The headline is a whole outdoor-world layer — composable
`environment(...)` descriptors, renderer-free query primitives so gameplay reads
the same world the shell renders, a standalone rigid-body physics sim, and the
`@jgengine/shell` renderers that draw it all.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.6.0` (the eight packages version in lockstep).
- No code change is required — 0.6.0 adds surface, it doesn't move or remove any.
- Optional: describe an outdoor scene once with `environment({ terrain, weather, vegetation, water, structures })` from `@jgengine/core/world/features`. `@jgengine/shell`'s `EnvironmentScene` renders it (terrain, rain/snow, grass, ocean, buildings), and gameplay reads the same world through the renderer-free primitives — `resolveTerrainField(...)` for ground-snap/collision, `windField(...)` for sway/sailing, `waterSurface(...)` for buoyancy, `scatter(...)` for prop/spawn placement, `buildingIndex(...)` for placement avoidance — no three.js needed.

### Added

- `@jgengine/core/world` query primitives — pure, renderer-free world sampling so gameplay and rendering read one source of truth. `world/terrain` (`TerrainField`, `noiseField`, `resolveTerrainField`, `resolveGroundStep` for slope-limited movement), `world/wind` (`windField` — one wind source for weather sway, grass, sailing, fire spread), `world/water` (`waterSurface` / `waterSurfaceFromDescriptor` — CPU Gerstner matching the ocean shader, for buoyancy and shorelines), `world/scatter` (`scatter` — seeded, overlap-aware point distribution for vegetation/props/spawns), `world/buildings` (`generateBuilding`, `generateBuildingDistrict`) and `world/buildingIndex` (`buildingIndex` — `at`/`within`/`nearest`/`isInside`/`blockers` over a district).
- `@jgengine/core/world/features` composable outdoor descriptors — `environment(...)` plus `terrain()`, `rain()`, `snow()`, `grass()`, `ocean()`, `building()`.
- `@jgengine/core/world/regions` (`createRegionField` — blend content-agnostic biomes by nearest selector, adding `tint`/`water`/`fog`/`speedMultiplier`/opaque `data`; extends `TerrainField` so it ground-snaps too) and `@jgengine/core/world/scatterItems` (`scatterItems` — region-driven content scatter: density per region, grounded, above-water/slope-aware, with `pickWeighted` for weighted rolls).
- `@jgengine/core/physics/physicsWorld` — standalone fixed-capacity rigid-body sim (SoA buffers, spatial-hash broadphase, sleeping) for many colliding dynamic bodies (piles, debris, stress scenes). Distinct from the `defineGame` `physics: { gravity }` character-controller config.
- `ctx.time` simulation clock (`@jgengine/core/time/simClock`) — `onTick`'s `dt` is now **game time**, so `rate * dt` decay/regen/AI obeys pause and fast-forward for free without per-system wiring. Configure with `defineGame({ time: { scale?, speeds?, dayLength?, start?, startPaused? } })` (all optional; default is real-time 1:1). `ctx.time` exposes `pause`/`play`/`toggle`/`setSpeed`/`cycleSpeed` + `snapshot()`/`calendar()`; `useGameClock()` binds it in React.
- `@jgengine/shell` environment/terrain/water/weather/structures renderers — `EnvironmentScene` mounts an `environment()` descriptor as R3F renderers; `GrassField`, `ProceduralGround`, `Ocean`, `RainField`, `SnowField`, `LightningStrike`, `GeneratedBuilding`, and `world/InstancedBodies` (renders `PhysicsWorld` bodies).
- `@jgengine/react/liveBind` — `useFrameBind` drives a DOM/SVG element from a per-frame value without re-rendering React (HUDs bound to live engine state never re-render or lag).

## 0.5.0

An additive release: **every 0.4.0 API is unchanged**, so upgrading is only a
version bump. New pure primitives across progression, inventory slots, world
geometry, and React store bindings.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.5.0` (the eight packages version in lockstep).
- No code change is required — 0.5.0 adds surface, it doesn't move or remove any.
- Optional: replace a game's hand-rolled `progression/curves.ts` with the new `leveling(...)` track. `leveling({ xpForLevel: { kind: "power", base, exponent, round: "floor" }, maxLevel })` returns `xpForLevel`, `resolve`, and `grantXp(ctx.scene.entity.stats, userId, amount, onLevelUp?)` — a drop-in for the old `xpRequiredForLevel` / `resolveLevelProgress` / `grantXp` exports. `ctx.scene.entity.stats` satisfies the primitive's `LevelingStatAccess` structurally, so no adapter is needed.

### Added

- `@jgengine/core/game/progression` — genre-agnostic progression primitive. `curve(spec)` / `evalCurve(spec, x)` evaluate declarative scalar curves (`const`, `linear`, `power`, `geometric`, `steps`, `piecewise`, each with optional `round`/`min`/`max`) for speed-by-level, difficulty-by-wave, loot drop-rate ramps, and similar scaling. `leveling(config)` builds the stateful XP→level track (threshold accumulation, multi-level grants, cap handling, `stat.levelUp` emit) on top of an `xpForLevel` curve.
- `@jgengine/core/inventory/slotModel` — pure slot-grid primitives (`createSlots`, `placeAt`, `removeAt`, `moveSlot`).
- `@jgengine/core/world/geometry`, `/world/interiors`, `/world/placement` — pure world primitives: grid snapping, footprint AABBs and overlap, interior/exterior spaces, and placement validation.
- `@jgengine/react/engineStore` — raw-store React bindings (`useEngineState`, `useEngineStore`, `useEngineEvent`).
- Pure/functional tiers for the `trade`, `unlocks`, `quest`, and `feed` verbs in `@jgengine/core/game`.

## 0.4.0

Baseline release: the eight `@jgengine/*` packages (core, ws, sql, react,
convex, node, shell, assets) as the first tracked version. No migration —
this is the floor changelog entries are measured against.
