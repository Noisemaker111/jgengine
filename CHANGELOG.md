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

- **Start game code at `@jgengine/shell/gameKit` (#1541).** Prefer that surface for `defineGame`, `GameHost`, stores, systems, authored-scene helpers, and HUD building blocks. `@jgengine/core/authoring` remains for pure core helpers the kit does not re-export but is no longer a competing start-here path.
- **Every game must now declare its run-phase story — silence is a gate error (#1337).** The run-phase
  contract used to be optional with a permissive default: a game that never published a phase read as
  `"playing"`, so the shell painted the touch dock over title/menu/results screens (Vice Isle #1329).
  `check-game-shape` now fails any game under `Games/*` that neither declares `lifecycle` in
  `defineGame({...})` nor calls `setGamePhase(ctx, phase)` somewhere in `src/`. To satisfy it, a game
  that runs live from boot with no menu/pause/end screens declares `defineGame({ lifecycle: "always-live" })`;
  a game with run states declares a `LifecycleConfig` or calls `setGamePhase` at its
  menu→playing→ended transitions. No runtime behavior changes for a game that already drove phases.
- **`generateCity` output is plot-first and no longer square by default.** Same options in, but the
  layout changes: lots derive from block-frontage plots (varied sizes), the street net clips to a
  seeded organic outline (`streets: { outline: 0 }` restores the legacy rectangle-filling footprint),
  and the landmark/interior-fill passes are gone — `content.landmarks` now dials the share of grand
  (block-scale) plots and `blockFill` dials frontage coverage/plot depth/park share.
  `ResolvedCityLot` drops the `interior`/`park` flags (no street-less interior lots exist anymore)
  and the `INTERIOR_LOTS_PER_BLOCK_CAP` export is removed; `GeneratedCity` gains `plots` + `parks`.
  A city consumer that only reads `lots`/`lotContent` (center/rotation/footprint/pieces) needs no
  code change.
- Walking-player object collision is now **on by default** (`PlayerMovementConfig.collideObjects`
  defaults `true`): placed scene objects with blocking colliders stop, support, and are stood upon by
  the player without opting in. A game that relies on walking through placed objects sets
  `movement: { collideObjects: false }` (or gives those objects non-blocking colliders).
- Ground drops taller than `movement.stepHeight` (default 0.4) now fall under gravity instead of
  snapping the feet down in one frame. Games that teleport-spawned players high above the ground will
  see them fall to it.
- **Projectile tracers are now opt-in and never drawn for ballistic shots.** `presentationEffects.tracers`
  defaults **off** (every other presentation channel still defaults on), so the shell no longer draws a
  straight muzzle→impact line for a game that never asked for one — `fireProjectile` is a generic seam
  (bullets, bolts, grenades, launchers), and a tracer only reads as a real shot for direct-fire weapons.
  A game that wants bullet tracers now sets `presentationEffects: { tracers: true }`. Even with tracers on,
  arced/exploding shots (anything ballistic — grenades, rocket/grenade launchers) never draw one, because a
  straight line through an arc is a fake beam. The `projectile.settled` event and `ProjectileSettleReport`
  gain a required `ballistic: boolean`; code that emits or consumes them directly must set/handle the field.

### Changed

- **SDK remediation Phase 0 — one start-here + correct UI guidance (#1541).** `@jgengine/shell/gameKit` is the sole happy-path game entrypoint; `@jgengine/core/authoring` no longer claims "Game code should begin here" (still a core helper barrel for pure exports the kit does not re-export). The whole-game recipe and scaffold `GameUI` header now match CLAUDE.md: compose shipped HUD building blocks (`StatBar`, `Hotbar`, `Coins`, …) and reskin via HudTheme — games own layout/terminology/art direction, not re-derivation. Studio Showcase and Tower Guard import kit-covered symbols from `gameKit`.
- **Kinematic vehicle drive feel** (#1515) — `createKinematicVehicle` gains a low-speed launch torque floor, softer reverse by default (`chassis.reverseForceScale`, default ~0.48 of engine force), handbrake rear-lock oversteer yaw, engine-braking that no longer fights powered reverse, and lighter ESC while handbraking. Existing chassis tunings pick this up with no migrate; override `reverseForceScale` only if you need the old full-force reverse.

### Fixed

- **City-scale player movement no longer freezes `pose` at ~3 fps (#1517).** Broadphase reach is split into capped horizontal vs vertical extents (tower height no longer inflates XZ/Y queries), `objectStore.inBox` bails to a linear object scan when the 1 m cell volume is huge, dense mesh-box colliders collapse to outer AABBs for walking, and `movement.frozen` skips the gather (seated drivers).
- **Generated intersections are compact carriageway unions, not plaza discs (#1511).**
  Apron pull-back is the projected crossing half-width only (opposite through-arms are ignored; curb
  return is no longer double-counted into the mouth distance). Exterior corners get small width-clamped
  returns; T far sides stay straight through-curbs; degree-2 turns form L-unions via the outer edge
  intersection. Sidewalk aprons offset along the local ring normal (not radially from the node), so
  corners no longer become giant octagonal bands. `buildIntersectionMarkings` still joins degree-2
  offsets and places stop lines at multi-arm mouths. Playground inspection hides buildings and does not
  render cuboid traffic. Deterministic fixture: `bun run shoot --fixture StreetGeometryPreview`.
- **Managed capture no longer steals Windows focus or waits on a background supervisor.** Daemon start
  launches hidden Chrome directly, while Git, taskkill, Vite, Chrome, and ffmpeg subprocesses all suppress
  console windows. Website query state hydrates before Three.js boot, preserving fail-fast route capture.
  Plot frontage is re-resolved after block-corner subdivision so buildings retain the correct street, and
  `lots.variety` now controls the deterministic plot-tier mix.
- **`extractBlocks` warns (dev-mode) instead of silently collapsing on wandered / arc-filleted streets (#1502).** Proximity welding assumes near-aligned centerlines; wandered arc-filleted streets weld into a degenerate face set (a real case went 38 streets → 2 faces with no signal, so the block fabric looked adoptable but was empty). `extractBlocks` now emits a `console.warn` when the extracted face count is implausibly low for the street count (≥8 streets yielding fewer than street-count/4 faces), pointing callers at `extractGraphBlocks` — which traces faces from the exact street graph and is robust against the centerlines that defeat welding. No-ops in a production build; no runtime behavior change.
- **`assets pull` / `assets add` default output dir now lands where the dev server serves models** (`@jgengine/assets` CLI, #1339) — inside the monorepo a bare `pull`/`add` previously wrote to a cwd-relative `public/`, so running it under `packages/assets` (or any subdir) dropped GLBs into a folder no game serves. It now defaults to the served root `apps/dev/public` when that exists (falling back to the historical cwd-relative `public` for out-of-monorepo consumers), so pulled bytes land in `apps/dev/public/models/<pack>` where the runner reads them. `--dir` still overrides.
- **The missing-model diagnostic now names the served target dir, and a bare `assets reindex` no longer disagrees with `assets pull` (#1499).** The runtime 404 / HTML-fallback diagnostic (`classifyAssetResponse` in `@jgengine/core/scene/assetDiagnostics`) told you to run `assets pull <source>` but never named where the bytes must land; it now points at the dev server's served models dir (`apps/dev/public/models` in the monorepo) and states no manual copy is needed. Completing #1339, a bare `assets reindex` / `assets reindex-sprites` (no dir arg) now defaults to that same served root via `resolveDefaultReindexDir` instead of a cwd-relative `public/`, so it can never scan an empty dir while `pull` writes to the served one. Explicit dir args are unchanged.

### Added

- **City generation now enforces plot clearance and planar streets (#1454).** Building plots clear
  one another and street corridors, building massing fits its plot, landmark footprints avoid roads
  and overlap, and generated street chords and branches cannot cross without a junction. Interior
  arterial stubs are demoted, dead ends receive cul-de-sac bulbs, and the playground exposes a
  linkable plan view plus plot spacing and variety controls.

- **`lifecycle: "always-live"` sentinel + `GameLifecycle` type (#1337).** `defineGame`'s `lifecycle`
  now accepts the string sentinel `"always-live"` alongside a `LifecycleConfig`. It is an explicit,
  truthful declaration that the game has no menu/pause/end screens and runs live from boot — runtime
  behavior is identical to declaring no lifecycle at all (no phase sync, no start/restart commands),
  but the intent is now *stated*, not implied by silence. `defineGameDefinition` resolves the sentinel
  to `undefined`, so downstream consumers still only ever see a real `LifecycleConfig` or nothing.
  `@jgengine/core/gameplay` exports the `GameLifecycle` union type. Pairs with the new
  `check-game-shape` run-phase requirement (see Migrate).
- **`debug_snapshot().probes.textureErrors` surfaces in-GLB texture-load failures (#1342).**
  `@jgengine/core/devtools/textureErrors` adds an allocation-aware collector
  (`armTextureErrors`/`reportTextureLoadError`/`resetTextureErrors`/`textureErrorsSnapshot`) that the
  shell's shared GLB loading manager feeds on every texture/image `onError`. Previously only whole-model
  catalog fallbacks (missing mapping/pack/scene) reached the `fallbacks` probe, so a model that resolved
  but whose textures 404'd read as a clean scene to `debug_snapshot` — the exact signal `jgengine-verify`
  tells agents to trust. The new `probes.textureErrors` list (`{ url, count }[]`) makes those failures
  visible so a texture-404'd scene can be treated like a model fallback. Dev-only (armed with devtools);
  a pure no-op in production.
- **Result/option types of public barrel functions are now re-exported (#1319).** The
  `@jgengine/core/gameplay` barrel re-exports `ChargeResult`, `ChargeOptions`, and `Overdraft`
  alongside `charge`/`chargeAll`/`canAfford`, and `@jgengine/core/combat` re-exports
  `DefenseResolution` (from `resolveDefense`) and `ResolvedShot` (from `resolveShot`). Consumers can
  now name these return/parameter types directly instead of resorting to `ReturnType<>`/`Parameters<>`
  gymnastics. Purely additive — no runtime or signature change.
- **Conflict-aware key-rebinding session.** `@jgengine/core/input/rebindSession` adds
  `createRebindSession({ actions | input, overrides?, now? })` — an observable key-remap
  editor over the existing action-binding model: it tracks the effective binding per action
  (default merged with `applyBindingOverrides`), exposes `rows()` with key glyphs + per-row
  conflict sets, groups every clash via `conflicts()`, drives click-to-capture rebinds
  (`beginCapture`/`capture`/`cancelCapture`, codes normalized), resets to defaults, and hands
  back `BindingOverrides` to persist, with `snapshot`/`restore`. React `KeybindingMenu` +
  `useRebindSession` (`@jgengine/react`) are the drop-in controls-settings surface — one row
  per action with key glyph, conflict badges, per-row and Reset-all, HudTheme-skinnable.
  Demo: `key-rebinding`.
- **Vendor / shop stock + grid.** `@jgengine/core/economy/shopStock` adds a serializable, observable
  `createShopStock({ entries })` — entries carry a free-string `kind`, a `price` in a free-string
  `currency`, a finite or unlimited (`qty: null`) count, and an optional `sellPrice`. `buy`/`sell`
  operate over a **caller-owned** `WalletState` (reusing the existing `wallet` model — `charge`/`grant`/
  `canAfford`), returning the debited/credited wallet for the caller to adopt; plus `restock`/`setPrice`/
  `add`/`remove`/`list`/`get`/`canAfford`/`subscribe`/`snapshot`/`restore`. `@jgengine/react`'s `ShopGrid`
  host + `useShopStock` hook render it as a token-themed grid of item cards (icon, price with currency
  glyph, stock count or "∞", afford-aware Buy, optional Sell) with a wallet balance readout.

- **Save-slot / profile select menu.** `@jgengine/core/game/saveSlots` adds `createSaveSlots(config)` — a
  serializable, observable index of per-slot *display* metadata (`{ id, name?, empty, savedAt?, meta }`
  with free-string `meta` the game fills: level, playtime, chapter, thumbnail ref, …) that complements
  `createSaveStore` (which owns the real payload). Ops: `write`/`clear`/`rename`/`get`/`list`/`mostRecent`
  (powers Continue) plus `subscribe`/`snapshot`/`restore`. `@jgengine/react/saveSlots` ships the drop-in
  `SaveSlotMenu` host (+ `useSaveSlots` hook) rendering the index as New / Continue / Load / Delete cards
  with meta chips and relative save times, HudTheme-skinnable. Demo: `save-slots`.
- **Event-log / kill-feed ticker.** `@jgengine/core/game/eventTicker` adds a thin, serializable,
  observable `createEventTicker({ now?, limit?, ttlMs? })` over the existing `appendFeed`/`pruneFeed`
  helpers: a single rolling, count-capped, time-fading list of free-string `{ kind, text, icon? }`
  entries (`push`/`recent`-with-`fade`/`entries`/`clear`/`subscribe`/`snapshot`/`restore`). `recent()`
  prunes expired entries and returns them newest-first with a `fade` `0..1` (age / `ttlMs`). The React
  `KillFeed` host + `useEventTicker` hook render it as a fading, newest-on-top stack of per-kind
  iconned, accent-colored rows over HudTheme tokens; `kill-feed` demo included.
- **Interaction prompt registry ("Press E to …").** `@jgengine/core/world` adds `createPromptRegistry()` — a thin
  observable, serializable store over the existing `resolveActivePrompt` resolver that owns positioned proximity
  prompts (`register`/`update`/`unregister`/`clear`/`all`), resolves the nearest in-range prompt as the player moves,
  and notifies subscribers only when the active prompt *changes* (so a HUD does not thrash per frame), with
  `snapshot`/`restore`. React `@jgengine/react` adds `InteractionPrompt` (a screen-anchored callout rendering the active
  prompt — key cap + label, gauge hold bar, or plain label, theme- and per-prompt-accent skinnable) and
  `useInteractionPrompt(registry, playerPosition)`. Demo: `interaction-prompt`.
- **Seeded trauma-based camera shake.** `@jgengine/core/vfx/cameraShake` adds `createCameraShake(config?)` —
  a serializable, deterministic camera-shake/impulse controller: `add(amount, kind?)` raises trauma `0..1`
  on impacts (free-string `kind` the game styles), `update(dt)` decays it, and `offset()` returns a pooled
  `{ x, y, z, pitch, yaw, roll }` kick (`trauma^exponent` × per-axis maxima × seeded value-noise) with
  snapshot/restore. `@jgengine/react` ships `CameraShakeMeter`/`useCameraShake` (trauma meter + kind label)
  and `@jgengine/shell` ships `ControllerCameraShake`, an R3F consumer that applies the offset to the active
  camera each frame so the view visibly shakes. Demo: `camera-shake`.

- **Observable wave/spawn runner + drop-in HUD.** `@jgengine/core/ai/waveRunner` adds
  `createWaveRunner(config)` — a thin, stateful, observable wrapper over the seeded `spawnDirector`
  that owns a `SpawnDirectorState`, ticks it from `update(dt, ctx?)`, forwards each `SpawnRequest` to an
  optional `onSpawn` sink (so the model never instantiates entities), and exposes a pooled `view()`
  readout (1-based `WAVE N`, wave progress `0..1`, budget/alert, spawned-this-wave/total, done) plus
  `forceNextWave`/`raiseAlert`/`subscribe`/`snapshot`/`restore`. `@jgengine/react/waveHud` adds
  `WaveHud`/`useWaveRunner` — a theme-skinnable panel with a big WAVE N label, wave-progress bar, and
  spawn/budget/alert readouts. Spawn-entry kinds stay free strings the runner never interprets.
- **Count-based combo / multiplier meter.** `@jgengine/core/combat/comboMeter` adds
  `createComboMeter({ windowMs, tiers?, dropStep?, multiplierPerTier? })` — an integer hit chain that
  climbs on `hit(kind?)`, resets a decay window each hit, and drops (to 0, or by `dropStep`) when the
  window elapses, driven by an injected `now` and/or `update(dt)`. Free-string `tiers` derive the active
  `tier()` and a score `multiplier()`, with `peak()`, a pooled `view()`, `subscribe`, and
  `snapshot`/`restore`. React `@jgengine/react/comboMeter` ships `ComboMeterHud` (big live count, tier
  label, draining window bar, multiplier — per-tier colored from a caller map) and a `useComboMeter` hook.
- **Off-screen objective / waypoint markers.** `@jgengine/core/ui/screenMarkers` adds a serializable,
  observable `createWaypointTracker()` (`set`/`remove`/`clear`/`all`/`subscribe`/`snapshot`/`restore`,
  free-string `kind`s the game styles) plus a pure, allocation-aware `layoutScreenMarker(projection,
  viewport, options?)` that passes an on-screen point through and clamps an off-screen or behind-camera
  point to the viewport edge with a bearing `angle` — the edge-clamp/arrow half that `layoutEntityFrames`
  culls. `@jgengine/react`'s `WaypointMarkers` renders on-screen pins and off-screen directional arrows
  with distance labels over any caller-owned `project` (e.g. shell `useWorldProjection`), skinnable via
  HudTheme tokens and a per-`kind` color map. Demo: `waypoint-markers`.

- **Scoreboard / leaderboard ranking.** `@jgengine/core/game/leaderboardRank` adds `rankLeaderboard(rows, options)`
  — a pure, allocation-bounded selector that turns raw leaderboard rows (accepts `LeaderboardRow[]` straight from
  `createLeaderboard().snapshot()`) into a render-ready ranked table: stable value sort (`desc`/`asc`), correct tie
  handling (`standard` → 1,2,2,4; `dense` → 1,2,2,3), `isTie`/`isLocal` flags via `highlightUserId`, and top-N `limit`
  — plus `medalFor(rank)` returning free-string `gold`/`silver`/`bronze` podium tokens. `@jgengine/react`'s reskinnable
  `Scoreboard` table renders it with medal-colored podium icons, a highlighted local row, and HudTheme `--jg-*` tokens.
- **Talent/upgrade tree from any unlock rule.** `@jgengine/core/game/talentTreeView` adds
  `talentTreeViewFrom(nodes, status, totals?)` — a general builder that places a node graph (branch/tier
  layout, prerequisite edges, learned/available/locked/maxed state) from a caller-supplied per-node
  `{ rank, allocatable }`, so unlocks can come from a currency threshold, a level, a quest flag, or
  nothing — not only point-spend. `talentTreeView(nodes, tree)` is now the point-spend adapter over it.
  The React `TalentTree` widget accepts a precomputed `view` (plus `showPoints`) alongside the existing
  `nodes`+`tree`, so the same widget renders a buy-with-points talent tree *or* a money-gated upgrade tree
  with no renderer change.
- **Floating combat text / damage numbers.** `@jgengine/core/ui/floatingText`' `createFloatingTextField` is a
  genre-agnostic, deterministic, allocation-aware field of world-anchored text pops (damage, crits, heals, XP/gold,
  status, barks): `emit({ position, text, kind?, color?, size?, rise?, drift?, lifetime? })`, `update(dt)` (rise +
  seeded drift + fade + swap-remove reaping), `active()` views, a capped pool that recycles the oldest, `clear`,
  `subscribe`, and serializable `snapshot`/`restore`. `kind` is a free string the presentation styles — no combat
  coupling. New `@jgengine/react`: `layoutFloatingText` (pure project/cull/depth-sort over the `EntityFrames`
  projector seam) and `FloatingText` (per-`kind` skinnable overlay). New `@jgengine/shell/vfx/WorldFloatingText`
  binds the live R3F camera and advances the field. New `floating-text` demo.
- **Codex / bestiary.** `@jgengine/core/game/codex`' `createCodex` tracks discovery over a fixed set of
  defined entries — `discover`, `isDiscovered`, category-filtered `list`, `categories`, `discoveredCount`/
  `total`/`completion`, an `onDiscover` seam, secret masking, and serializable `snapshot`/`restore`; the view
  list keeps a stable identity for React. New `@jgengine/react` `Codex` gallery: category tabs, discovered vs.
  locked cards (secret entries masked until found), and a completion header. First adopter: the apps/dev
  `codex` demo.
- **Generated street elevation** (`@jgengine/core/world/streetGenerator`) — new optional `elevation` (0..1 relief dial, default 0 = flat, byte-identical output) and `maxGrade` (default 0.07) rules: a seeded smooth field emits per-point `Street.heights` (grade-capped, loop-continuous across a circuit's start/finish) and a shared `StreetNetwork.elevationAt(x,z)` so renderers drape roads, junction welds, sidewalks, and building bases off one consistent surface. Distinct from `context.heightAt` terrain (bridges/tunnels unchanged).
- **Per-corner radius classes on circuits** (`@jgengine/core/world/streetGenerator`) — circuit corners now fillet from a seeded radius mix (hairpins near `minCurveRadius`, standard corners at 2-4x, 1-3 sweepers per lap at 5-8x, inversely correlated with turn magnitude) so track layouts show genuinely different corner radii instead of one pinched minimum.
- **`compactness` circuit dial — space-filling kart-style tracks** (`@jgengine/core/world/streetGenerator`) — 0..1 (default 0 = the open flowing hull loop, byte-identical): rising compactness lays the lap as the wall-follower cycle around a seeded direction-biased spanning tree on a corridor grid — provably one self-avoiding loop that folds back through its own footprint with parallel corridors at a clearance-safe pitch, switchback mazes, leaf hairpins, and a ≥3-pitch main straight — then runs the same spline/curvature-floor pipeline. At 1 a default-seed lap triples in length with 19-37 corners and ~61-77% footprint usage.
- **`blockFill` density dial** (`@jgengine/core/world/cityGenerator` / `buildingLots`) — 0..1 (default 0.45): rising fill packs street frontage toward a touching streetwall, deepens plots toward the block spine, and reserves fewer whole blocks as parks — Manhattan-dense cities at 1, sparse suburbs near 0. Block interiors are never filled with street-less buildings; every plot fronts a street.
- **Plot-first city generator** (`@jgengine/core/world/cityGenerator`) — `generateCity` now extracts closed blocks from the street network's exact graph (`extractGraphBlocks` in `world/cityBlocks`) and subdivides every block's frontage into size-tiered polygonal PLOTS (`small`/`medium`/`large`/`grand` — many different plot sizes per city) via the new `deriveCityPlots`. `GeneratedCity` gains `plots` (`CityPlot[]`, `plots[i]` pairs with `lots[i]`) and `parks` (whole-block open space). The landmark cluster-merge pass and the street-less interior fill are gone: a landmark is just a grand plot (same pass, biggest tier — `content.landmarks` dials its share, `0` disables), building class now follows plot size (wide plots pull towers/slabs, narrow plots pull rowhouses/houses), and every building stands on street-fronting land by construction.
- **`outline` street dial** (`@jgengine/core/world/streetGenerator`) — 0..1 (default 0 = the legacy full-rectangle footprint, byte-identical): rising values clip the lattice to a seeded organic boundary blob (radial harmonics), so every seed grows a differently-shaped city — lobes, bays, shaved corners — reduced to its largest connected component. `generateCity` defaults it to 0.4.
- **Residential branch streets and cul-de-sacs** (`@jgengine/core/world/streetGenerator` / `cityGenerator`) — new `residentialBranches` rule (0..1 share, default 0 = legacy alleys byte-identically) grows two spur kinds off the mains under the `branching` dial: service alleys (the legacy lane stubs) and RESIDENTIAL BRANCHES — winding 1–3-segment street-level side streets that may fork once, never cross existing roads, end in a turning-bulb cul-de-sac, and are lined with small/medium house plots down both sides by the plot pass (dead-end corridors carry their street/level through `extractGraphBlocks`). Dead-ending chains are never classified arterial, so no bulb-capped boulevards. `generateCity` defaults `branching` to 0.4 and `residentialBranches` to 0.6.
- **`TrimmedIntersections.junctionIndices`** (`@jgengine/core/world/roads`) — each welded junction surface now reports which input junction it belongs to, so renderers can color crossing patches by the junction's street level instead of one global junction color.
- **`trimBandAtJunctions`** (`@jgengine/core/world/roads`) — clip a sidewalk/parallel band polyline out of every junction apron (arm-derived radius widened by the band's half-width + clearance), returning the surviving sub-paths — so sidewalks end at crossings instead of sailing through them. The playground consumes it for `Street.sidewalks`.
- **Shared map drawings (multiplayer).** `@jgengine/core/world/sharedAnnotations`' `createSharedAnnotations`
  makes a map annotation layer collaborative: local `addStroke`/`addShape`/`addNote`/`remove`/`clear` apply
  then broadcast a serializable edit over the party feed (the same seam `createPingSystem` pings ride), and
  `apply` mirrors inbound edits from other players while dropping our own echoes. Ids are globally unique per
  client (`owner:n`) so two players' strokes never collide; transport-agnostic (`ANNOTATION_FEED_ACTION` +
  any replicated feed). Pings were already shared via `createPingSystem`; this completes the pair. Verified by
  a two-client sync test.
- **Terrain surface shading + layered grass wind** (`@jgengine/shell/terrain`, #1373) — plain (untextured) ground now reads as terrain instead of a two-tone gradient: `buildGroundGeometry`-based grounds (`ProceduralGround`, field ground) gain slope-aware darkening/desaturation and seeded, deterministic hash mottling, tunable via the new optional `TerrainSurfaceColorOptions` (`FieldGroundOptions.surface`; defaults in `DEFAULT_TERRAIN_SURFACE_COLOR`, strengths `0` restore the old flat lerp). Grass wind gains a layered rolling gust field (`GrassWindOptions.layered`, default on — three phase-offset directional waves so visible fronts sweep the meadow; `false` restores the single sine) plus a warm lit-tip sheen, and the default grass distance fade widens from 35–95 m to 55–150 m so meadows read expansive at no extra instance cost. `createProceduralGroundGeometry` now delegates to the shared ground builder (behavior-identical geometry, minus the duplication).
- **Debounced control commits: `useDebouncedCommit`** (`@jgengine/react/useDebouncedCommit`, #1372) — a live-mirrored, trailing-debounced commit binding for slider/number/color/text controls whose commit path is expensive (scene-document patches that regenerate streets, scatter, or grass). The control renders from the local mirror for instant thumb/readout feedback; the real commit fires once per pause (default 180 ms) and flushes on release/blur/unmount; external changes (undo, RPC echo) resync the mirror unless a drag is in flight. The editor's inspector fields (`SchemaInspector`, `SliderRow`/`NumberField`, vegetation and scatter-coverage density) and the shell settings sliders now commit through it, so one drag lands one patch instead of ~50.
- **Stage / objective banner.** `@jgengine/core/ui/objectiveBanner`' `createObjectiveBanner` is a genre-agnostic,
  serializable announcement queue: a game calls `announce({ title, subtitle?, kind?, holdMs?, inMs?, outMs? })` and the
  controller flies the classic transient centered title stamp ("WAVE 3", "VICTORY", "OBJECTIVE COMPLETE") in, holds it,
  and fades it out — one banner at a time — on an injected clock (`advance()`), exposing the current banner plus its
  phase (`in`/`hold`/`out`) and `progress` `0..1` for a renderer to animate. `kind` is a free label the game styles; the
  model never interprets it. Allocation-aware (the `current()` view is pooled) with `subscribe` + `snapshot`/`restore`.
  `@jgengine/react`' `ObjectiveBannerHost` subscribes, drives the clock per frame, and maps phase + progress to
  opacity/scale/translate, HudTheme-skinnable and colorable per `kind` via `kindThemes`. Demo: `objective-banner`.
- **Talent / skill-tree widget.** `@jgengine/react`'s `TalentTree` is a drop-in widget over the existing
  talent model (`@jgengine/core/game/talents`): pass the node definitions plus a live `createTalentTree`
  instance and it lays nodes out by branch column and prerequisite-depth tier, draws SVG prerequisite
  edges, styles each node learned/available/locked/maxed with an icon + rank badge, and fires
  `onLearn(nodeId)` on allocatable clicks. A new thin core selector `@jgengine/core/game/talentTreeView`
  (`talentTreeView`) flattens the model into a serializable per-node render view (tier, state, met/unmet
  edges) so the widget never re-derives topology or eligibility. HudTheme-token skinned; node ids and
  branches stay opaque game data.
- **Countdown / timer HUD.** `@jgengine/core/time/timerSet`' `createTimerSet` is a serializable set of named
  countdown/countup timers on an injected clock — one primitive for round timers, respawn clocks, and ability
  cooldown/charge (identical mechanics; `id`/labels are free strings the engine never interprets). Start, pause,
  resume, stop, reset, and read `{ remainingMs, elapsedMs, durationMs, progress01, running, expired }` per timer
  (allocation-aware `read(id, out)`), observe structural changes via `subscribe` and expiry edges via
  `poll`/`onExpire`, and `snapshot`/`restore` round-trip through a save. `@jgengine/react`'s `TimerReadout`
  (live digital mm:ss/m:ss.d) and `TimerRing` (SVG radial fill/drain), plus the `useTimerRead` per-frame hook,
  render it HudTheme-skinned — no hand-rolled interval math. See the `countdown-timer` dev demo.
- **Branching dialogue UI.** `@jgengine/core/game/dialogueGraph`'s `createDialogueRun` / `selectDialogueView` add a
  thin, serializable branching-conversation model over the existing `features.dialogue` open/close bridge — a graph of
  nodes (free-string speaker + line + choices that name the node they lead to) with choose-to-advance traversal, visited
  history, and snapshot/restore. `@jgengine/react`'s `DialogueView` (+ `useDialogueRun`) is the drop-in view: speaker
  name, an optional portrait slot, the current line, and clickable response buttons that advance the run — a game passes
  its dialogue graph and gets working node traversal and choice state with no hand-rolled walk. Genre-agnostic:
  speaker/choice `kind` are free strings the model never interprets, surfaced as `data-*` for game styling; HudTheme-skinned
  via `--jg-*` tokens. See the `dialogue` demo.
- **Damage-direction indicators.** `@jgengine/core/vfx/damageDirection`' `createDamageDirectionTracker` is a
  serializable, allocation-aware "hit-from" brain: `registerHit({ angle, intensity?, kind? })` (angle in radians,
  `0` = front, free-string `kind` never interpreted) turns each hit into a directional indicator that fades over a
  duration on an injected clock, with `active()` reporting live indicators at eased current intensity, optional
  same-direction merging, a bounded pool, `subscribe`, and `snapshot`/`restore`. `@jgengine/react`'s
  `DamageDirectionOverlay` (+ `useDamageDirection` hook) renders the classic red arcs flaring around a center reticle
  toward each recent hit, opacity/scale from intensity, color per `kind`/HudTheme, `pointer-events: none`. New
  `damage-direction` dev demo. Genre-agnostic, renderer-free core.
- **Turnkey day-night cycle.** `@jgengine/core/time/dayNightCycle`' `createDayNightCycle` is a genre-agnostic,
  serializable brain that advances a normalized day fraction on an injected clock and blends per-keyframe phase labels
  and tint/light colors (`DayNightKeyframe` → `DayNightSample`), with `pause`/`play`/`setSpeed`/`setDayFraction`,
  `subscribe`, `snapshot`/`restore`, and a `calendar()` adapter so it drops straight into any `{ dayFraction }` sky
  seam. The shell's `@jgengine/shell/environment` adds `DayNightSky`, a drop-in R3F presenter that drives the existing
  `SkyDome` shader and lights from the model each frame — wire one thing for a moving, color-graded day-night sky
  instead of hand-rolling a clock plus a color lerp. `phase`/`kind` strings stay free-form; the model never interprets
  them. New `day-night` dev demo.
- **Status-effect timeline HUD.** `@jgengine/react`'s `StatusEffectBar` renders active buffs/debuffs as a row of
  painted icons, each with a radial countdown ring and stack-count badge, driven off the existing status model
  (`combat/statusApplication`'s `StatusInstance`). A thin genre-agnostic core selector,
  `@jgengine/core/combat`'s `toStatusEffectViews` / `toStatusEffectView` (+ `statusEffectRemainingFraction`),
  adapts live `StatusInstance`s into serializable `StatusEffectView`s (`id`, free-string `kind`, `remainingMs`,
  `durationMs`, `stacks`) so the widget re-derives no ring math or timers. `kind` is never interpreted by the engine —
  the game supplies icon/color/label; icons come from the existing game-icons.net icon system. Demo: `status-effects`.
- **Cutscene / sequence director.** `@jgengine/core/scene/sequenceDirector`' `createSequenceDirector` is a
  serializable, genre-agnostic timeline: an ordered list of typed cues (`{ atMs, kind, payload }`) advanced by one
  injected clock, firing each cue once and in order as its time passes — even across a large `seek` — with
  `play`/`pause`/`seek`/`skip`/`stop` and `snapshot`/`restore`. The director only schedules and emits cues via
  `onCue`; it never interprets a `kind`, so the same primitive drives camera moves, dialogue, fades, or any game
  event without a genre kit. `@jgengine/react`'s `useSequenceDirector` runs the per-frame tick loop and exposes
  playhead/progress + controls, and `CutsceneLetterbox` is a reskinnable cinematic bars + caption + Skip overlay.
  See the `cutscene` dev demo.
- **Modal / confirmation dialog system + reskinnable pause menu.** `@jgengine/core/ui/modalStack`'s
  `createModalStack` is a genre-agnostic, serializable stack of opaque modal records (`push`/`pop`/`resolve` with a
  free-form result, `top`/`isOpen`/`depth`, optional injected-clock auto-dismiss via `tick`/`timeRemaining`,
  `subscribe`, `snapshot`/`restore`) that never interprets a modal's `kind` or result. `@jgengine/react`'s `ModalHost`
  renders the top modal over a dimmed backdrop with a focus trap and Esc/backdrop-to-cancel, `ConfirmDialog` is a
  generic two-button confirm/cancel dialog, and `PauseMenu` is a drop-in Resume + game-filled Settings/Quit slot list.
  All `HudTheme`-token-driven common parts — the game owns final layout, terminology, and skin. Demo: `pause-menu`.
- **Screen-state effects (postfx).** `@jgengine/core/vfx/screenEffects`' `createScreenEffects` is a genre-agnostic,
  serializable screen-feedback controller: a game triggers transient full-screen flashes and edge vignettes
  (`flash`/`vignette`) or sustained, optionally oscillating tints (`pulse`, e.g. a low-health breathe) — each a
  free-string `kind` the game styles, plus color, peak intensity, easing, and duration. It is clock-driven
  (`advance()` against an injected `now`) and allocation-aware (the `composite()` array and entries are pooled, so
  steady-state ticking never allocates), with `subscribe` + `snapshot`/`restore`. `@jgengine/shell/postfx`'
  `ScreenEffectsOverlay` subscribes to the model and paints the composite as pointer-transparent color-grade layers
  over the canvas. Demo: `screen-effects`. The model never interprets `kind`; flash/vignette/pulse are just
  parameterizations of the same data (region shape, decay easing, sustained oscillation).
- **Coach-marks / tutorial hints.** `@jgengine/core/ui/coachMarks`' `createCoachMarkSequence` is a genre-agnostic
  onboarding model: an ordered list of `CoachMarkStep`s (title, body, optional `anchor`/`placement`, and a data-first
  string `condition`), a persisted "seen" set so completed hints never re-show, condition-gating via `satisfy`/
  `setSatisfied`, `current`/`advance`/`dismiss`/`skipAll`, `isComplete`/`remaining`, `subscribe`, and serializable
  `snapshot`/`restore`. New `@jgengine/react`: `useCoachMarks` plus `CoachMark` and `CoachMarkHost` (anchored or
  centered callout with an "N of M" counter, a dimmed spotlight backdrop, Next/Skip, and a `CoachMarkTheme` reskin).
  New `coach-marks` demo.
- **Fast-travel network.** `@jgengine/core/world/fastTravel`' `createFastTravelNetwork` is a genre-agnostic
  discovered-destinations model: game-defined `TravelPointDef`s (world-XZ position, region, icon, `initial`)
  with per-player discovery tracking — `discover`, `isDiscovered`, distance-sorted `list(from)` and
  `destinations(from)`, `nearest(from, { exclude })`, a `canTravel` gate, `discoveredCount`/`total`, an
  `onDiscover` seam, and serializable `snapshot`/`restore` (re-seeds `initial` points). New `@jgengine/react`:
  `useFastTravel` (re-render on discovery) and `FastTravelMenu` (region-grouped, distance-labeled destination
  picker with a discovery counter and "you are here" flag). New `fast-travel` demo.
- **Generic particle system.** `@jgengine/core/vfx/particles`' `createParticleSystem` is a genre-agnostic,
  deterministic, allocation-aware particle emitter: a fixed pool, data-only `EmitterConfig` (rate, position,
  lifetime, speed, cone `spread`, `gravity`, `drag`, size/color/alpha over life), burst `emit(n)` and continuous
  `rate`, `update(dt)` integration with swap-remove reaping, Structure-of-Arrays render `buffers()` (positions,
  sizes, colors, alphas) clamped to the live count, injected-seed determinism, and serializable `snapshot`/
  `restore`. New `@jgengine/shell/vfx/ParticleField` renders it as a one-draw-call soft-point GPU cloud with
  per-particle size/color/alpha (additive or normal blending). New `particle-vfx` demo (fire / smoke / sparks).
- **Notification center.** `@jgengine/core/game/notifications`' `createNotificationCenter` is a persistent,
  read-tracked notification log (newest-first, capped, serializable, observable) — the durable counterpart to
  transient toasts: `push`, `list({ kind, unreadOnly })`, `unreadCount`, `markRead`/`markAllRead`, `remove`,
  `clear`, `snapshot`/`restore`. New `@jgengine/react`: `useNotifications`, `NotificationBell` (icon + unread
  badge), and `NotificationCenter` (scrollable panel with kind markers, relative time, unread highlight, and
  mark-all-read/clear). First adopter: the apps/dev `notification-center` demo.
- **Photo mode.** `@jgengine/core/ui/photoMode`'s `createPhotoModeStore` is a serializable, observable
  photo-mode state (active + hide-HUD) a game binds its capture flow to. New `@jgengine/react`
  `usePhotoMode` + `PhotoModeControls` (hide-HUD toggle, capture, exit). New `@jgengine/shell/render/
  sceneCapture`: `captureCanvas(gl)` reads the live frame to a PNG data URL (the shell canvas already sets
  `preserveDrawingBuffer`), `downloadImage` saves it, and `SceneCaptureBinding` (mount in `WorldOverlay`)
  hands the in-Canvas capture fn to the HUD's Capture button. The game reads `hideHud` to drop gameplay
  chrome for a clean shot. First adopter: the apps/dev `photo-mode` demo.
- **Welded street intersections** (`@jgengine/core/world/roads`, #1363) — `trimPathAtJunctions` cuts every road back to an arm-derived apron at each crossing (through-roads split in two) and `buildJunctionSurface` welds a curb-return-filleted junction polygon whose boundary vertices are bitwise-shared with the trimmed ribbon ends; `buildTrimmedIntersections` runs the whole pipeline for a street network in one call. Junctions read as real intersections instead of overlapping ribbons under a floating disc (`buildJunctionPatch` is deprecated but still works). The shell's authored-road and city renderers consume it out of the box.
- **`GROUND_DECAL_LAYERS`** (`@jgengine/core/world/roads`, #1366) — one owning table for ground-decal elevations (terrain < road = junction < marking < glow) replacing scattered per-callsite Y epsilons; ribbon/junction builders default from it, and markings/glow overlays pair it with renderer-side `polygonOffset` so road surfaces stop z-fighting at distance.
- **Real curves and sidewalks in the street generator** (`@jgengine/core/world/streetGenerator`, #1364, #1368) — corners are now sampled circular-arc fillets honoring `minCurveRadius` instead of single bevels; street hierarchy comes from sampled betweenness centrality with an arterial-connectivity repair pass instead of a length percentile; and boulevard/avenue/street chains carry `sidewalks` offset polylines (new optional `sidewalkWidth` rule, default 2).
- **Race-track synthesis in circuit mode** (`@jgengine/core/world/streetGenerator`, #1365) — circuits are grown from seeded scatter → convex hull → inward midpoint displacement with chicane/ess/hairpin corner templates, an enforced start/finish straight, deterministic self-clearance retries, and a pit lane that leaves and rejoins the loop at two real junctions — an actual track layout instead of a wobbled ellipse.
- **City lot content resolution** (`@jgengine/core/world/cityGenerator`, #1367) — `resolveCityLotContent` (or `generateCity`'s new `content` option) enriches frontage lots with their zone band, building class from cityContent's weighted mixes (street-level-biased), floors, and massing pieces; a deterministic landmark pass merges clusters of adjacent lots into a few block-scale `hall`/`arena`/`market`/`campus` buildings (dial: `content.landmarks`, default 0.04). `GeneratedCity` gains an optional `lotContent`; the bare-lot path is unchanged.
- **Quick menu takes many forms.** The radial menu grows into a full quick-menu family. `@jgengine/core/ui/radialMenu`
  gains a `RadialArc` (`startAngle`/`sweep`) so the wheel can be a partial **arc** (bottom half, quarter, ping bar)
  with bounds-aware selection. `@jgengine/react`'s `RadialMenu` now renders per-slice **hotkeys, count badges,
  cooldowns, and submenu markers**, and takes an `arc`. New `@jgengine/react` **`QuickMenu`** presents one item
  model in four forms — `radial` · `arc` · `list` · `grid` — with section headers, hotkeys, badges, cooldowns,
  disabled states, and **nested submenus** (drill in / back). First adopter: the apps/dev quick-menu demo (form
  switcher across all four).
- **Per-context touch control modes** (`@jgengine/core/input/touchScheme` `TouchControlsConfig.modes` + `@jgengine/core/input/touchControlsMode` `setTouchControlsMode`/`activeTouchControlsMode`, re-exported from `gameplay`, #1370) — a game whose verbs change at runtime (on foot vs driving vs flying) declares one named touch config per context; each mode's fields replace the matching base fields and gameplay switches with `setTouchControlsMode(ctx, "car")` / `null`. The shell re-derives the dock the same frame, so a runner on foot never sees flight or vehicle chrome. Blind derivation past 8 buttons now logs a dev warning naming the curation seams. Vice Isle (on-foot/car/aircraft) is the first adopter.
- **Analog action values through the input snapshot** (`@jgengine/core/runtime/inputSnapshot` `publishAnalog`/`value`/`analog`, `InputFrame.analog`, #1370) — a continuous source (the virtual joystick today, gamepad sticks tomorrow) publishes per-action magnitudes (0..1) alongside the digital held set; `ctx.input.value(action)` reads them, `ctx.input.axis(...)` samples them per bound action (so steer/pitch/roll bound to action names become proportional automatically), and the walk controller consumes them via `resolveMovementIntent`'s new analog path — a slight stick tilt walks slowly in that direction at speed scaled by deflection, instead of slamming a full-speed digital strafe. Serializable: analog rides `InputFrame` to an authoritative host unchanged.
- **Floating joystick variant + Settings selector** (`@jgengine/shell` touch dock, `@jgengine/core/input/touchScheme` `TouchJoystickVariant`, #1370) — two shipped stick behaviors, player-selectable under Settings → Controls → "Joystick": `floating` (default; the dock corner is a capture zone with a faint resting ring and the stick spawns centered under the thumb) and `fixed` (classic always-visible stick). Both share the analog vector math with a radial deadzone (travel rescaled from 0.16), replacing the old per-axis 0.42 digital thresholds as the movement path.
- **Radial / quick menu (weapon/emote wheel).** `@jgengine/core/ui/radialMenu` ships the pure geometry —
  `radialSlices`, `radialIndexFromAngle`, `radialIndexFromVector` (pointer/stick vector → slice with a
  neutral dead zone), `radialSlicePosition` — with slices centered from "up" clockwise. New `@jgengine/react`
  `RadialMenu` renders the wheel: pointer angle drives the highlight, the neutral hub closes, click/confirm
  fires `onSelect`; the game supplies option icons/labels and skins it (`highlightIndex` for controller/test
  control). First adopter: the apps/dev `radial-menu` demo.
- **Accessibility options.** `@jgengine/core/ui/accessibility`'s `createAccessibilityStore` is a
  serializable, observable store of genre-agnostic accessibility preferences — reduced motion, high
  contrast, `textScale` (clamped), colorblind mode, and captions — with `snapshot`/`restore`. Ships the
  `COLORBLIND_MATRICES` (`feColorMatrix` values for protanopia/deuteranopia/tritanopia/grayscale),
  `clampTextScale`, and a `reducedMotionDuration` animation gate. New `@jgengine/react` layer:
  `AccessibilityProvider` (exposes a `--jg-text-scale` CSS var, sets `data-reduced-motion` /
  `data-high-contrast` / `data-colorblind` / `data-captions`, and wraps the subtree in the selected
  colorblind filter), `useAccessibility`, `usePrefersReducedMotion` (OS `prefers-reduced-motion`), and
  `ColorblindFilters`. Input rebinding already existed; this fills the rest of the a11y surface. First
  adopter: the apps/dev `accessibility` demo.
- **Quest / objective tracker HUD.** `@jgengine/core/game/quest`'s `describeTrackedQuest(def, instance)`
  joins a static `QuestDef` with a player's live `QuestInstance` into a flat, renderer-free `TrackedQuestView`
  (title, status, labelled objective progress — `defaultObjectiveLabel` derives "Defeat 5 Wolves" and can be
  overridden). New `@jgengine/react` `QuestTracker` draws it as a compact HUD panel: per-objective checkmark +
  strike on complete, `progress/count`, and a thin progress bar, with `maxObjectives` truncation. A widget over
  the existing quest models — no runtime coupling to `QuestJournal`. First adopter: the apps/dev `quest-tracker`
  demo.
- **Localization / i18n.** `@jgengine/core/i18n` (also on the `@jgengine/core/ui` barrel)'s `createI18n`
  translates a message `Catalog` with active-locale lookup, a fallback-locale chain, `{param}`
  interpolation, and `Intl.PluralRules`-based `plural(key, count)`; it's observable so `setLocale` re-renders
  bound UI, and the catalog stays caller-owned static data. New `@jgengine/react` layer: `I18nProvider`,
  `useT()` / `usePlural()` / `useLocale()` hooks, and a `<Trans k=… />` component — every HUD string binds to
  the catalog and swaps live on language change. First fully-absent-system gap closed; genre-agnostic, no
  content shipped. First adopter: the apps/dev `localization` demo (EN / ES / 日本語 switcher).
- **Click-to-place custom marker kinds** (`@jgengine/core/scene` `definePlaceableMarkerKind` + `@jgengine/editor`) — a game declares its own logical marker kind (a stash, checkpoint, bounty…) in one call and it becomes a click-to-place tool in the editor's `+ Add` menu, grouped under its `category`: pick it, click the world to drop a marker, Shift-click to keep placing, tune its `fields` in the Inspector. The light path skips a full studio's schema/resolver boilerplate; the runtime is unchanged (the game still reads the kind off `editorLayers.markers`). The Add menu now groups registered kinds by their `addCategory` header instead of lumping every one under "Studios". Register from a module the editor loads (a game's `editorLayers` import graph). Pairs with the `add_marker` RPC verb: `definePlaceableMarkerKind` is the designer's click-to-place path, `add_marker` the scripted one.
- **`add_marker` editor verb** (`@jgengine/editor`, #1360) — the one-shot counterpart to `add_path`: place a bare point marker (a spawn, checkpoint, pickup, bounty, or a game's own custom kind) at `x`/`z` (optional `y`) in a single `--rpc`/MCP call, no `export_document`/`import_document` roundtrip and no hand-editing `editor.scene.json`. `kind` is required; `color`/`label`/`rotationY`/`meta` are optional and `meta` is validated against the kind's registered schema when one exists. Re-ids on a document-global id collision and returns the landed id, exactly like `add_path`. Use `place_asset` when the marker should carry a mesh; `add_marker` is for logical, mesh-free markers a game reads off the document by kind.
- **World-anchored entity frames (overhead nameplates / health bars)** (`@jgengine/react/entityFrames`, `@jgengine/shell/world/WorldEntityFrames`, #1266) — a data-first, caller-owned seam for floating frames over entities. `EntityFrames` takes a plain `{ id, worldPosition, ... }[]` plus a `project` (world→screen) and a `renderFrame` that composes the shipped `HealthBar` + a name (reskinned via `barTokens`/`HudTheme`); it owns only the reusable behavior — projection offset, off-screen/behind-camera culling, and nearest-on-top stacking. The pure `layoutEntityFrames` core is unit-tested in isolation and imports no React DOM/Three.js. R3F games get the projector for free from `WorldEntityFrames` / `useWorldProjection` / `projectWorldToScreen` (`@jgengine/shell`), which sample the live camera and compose the react primitive — overhead enemy nameplates/health bars from a game's own entity array in a few lines, with no `GameProvider` or entity-store mirroring. See the `jgengine-ui` overhead-entity-frames recipe. Complements the store-driven `WorldNameplates`.
- **Per-entity render hide: `SceneEntity.hidden`** (`@jgengine/core/scene/entityStore`, `@jgengine/shell`, #1299) — a new optional render-only flag on scene entities, settable at `spawn` and via `update({ hidden })`. When `true` the shell's entity marker skips the visual entirely each frame while the entity keeps simulating (position, stats, AI targeting, queries untouched). Built for seated vehicle riders whose character model otherwise pokes through the vehicle body; equally fits cutscene actors and stealth cloaks. Absent/`false` renders exactly as before.
- **`ChaseCameraTuning` covers the full driving-feel surface** (`@jgengine/core/runtime/cameraDirector`, #1299) — the runtime `ctx.camera.setChaseTuning` patch now also accepts `shakePerSpeed` and `velocityYaw`, so a game can keep its static `camera.chase` block as a calm on-foot baseline and overlay the whole speed-reactive package (speed→FOV, lead, bank, speed shake, drift-lag) only while a vehicle is piloted. Existing tuning patches are unchanged.
- **Draw on the map: annotation layer + FullscreenMap draw tool.** `@jgengine/core/world/mapAnnotations`'
  `createAnnotationLayer` is a serializable player-drawing layer — freehand `strokes`, area `shapes`, and
  pinned `notes`, all world-XZ — whose `routes()`/`zones()` project straight into the `routes`/`zones` props
  `Minimap`/`WorldMap`/`FullscreenMap` already render, so drawing needs no new renderer; `snapshot`/`restore`
  round-trip through a save. `@jgengine/react/map`'s `FullscreenMap` gains a `tool` prop (`"pan"` | `"draw"`):
  in draw mode a pointer drag paints a freehand stroke committed to `onStrokeComplete(points)` (with a live
  in-progress preview via `drawTone`/`drawWidth`), while panning and click-to-place are suppressed. First
  adopter: the apps/dev extraction-map demo (Pan/Draw/Clear palette).
- **`jgengine shoot` / `jgengine drive` CLI verbs** (`jgengine` CLI, #1262) — the browser capture and play-driving rungs are now first-class CLI verbs, so a standalone project (scaffolded with `npx jgengine create`, outside this monorepo) can screenshot and playtest its own game without any monorepo-only tooling. Run inside a project that already ships `scripts/shoot.mjs` / `scripts/drive.mjs` and the verb delegates to them (parity with `bun run shoot`); run in one that lacks them (an older scaffold, or one whose scripts were removed) and it materializes the same dependency-free harness the scaffold embeds and drives the project's dev server. Chrome/Chromium is the only capture engine — no Playwright and no npm deps travel with the published CLI; a missing browser fails with an install hint. Makes the "visual claims are screenshot-judged" rule enforceable for the exact outside users it targets.
- **Engine preview-fixture capture route** (`@jgengine/react` `PREVIEW_FIXTURES`, #1272) — a registry of deterministic, engine-level preview fixtures (the real exported components `HudThemePreview`, `BarsPreview`, `IconsPreview`, …) keyed by name, with `previewFixtureNames()` and `resolvePreviewFixture(name)`. The dev runner mounts one from a `?fixture=<name>` URL overlay and `bun run shoot --fixture <name>` screenshots it with no game boot and no hand-rolled `--url` page; `bun run shoot --list` (or `--fixture` with no name) prints the registered set. Register any additional deterministic preview component in `PREVIEW_FIXTURES` and the route and CLI pick it up with no further wiring — genre-agnostic, additive.
- **Per-capture player-spawn override** (`@jgengine/core/world/spawnOverride`, #1255) — `installSpawnOverride`/`clearSpawnOverride`/`readSpawnOverride` and the pure `parseSpawnOverride("x,y,z"|"x,y,z,yaw")` install a session-scoped spawn that `authoredSpawnPosition`/`authoredSpawnRotation` honor for the *default* player-spawn resolution only (an explicit marker `id` or non-`player_spawn` kind still reads the document), so a close-up capture can relocate the player without editing `editor.scene.json`. The dev runner installs one from a `?spawn=` URL overlay (mirroring `?cam=`), and `bun run shoot`/`bun run drive` gain a `--spawn x,y,z` flag. Default is no override, so nothing changes until one is installed.
- **Aerial editor camera in one call** (`@jgengine/editor`, #1256) — `camera_goto` and `camera_frame` take optional `distance`, `pitch` (degrees above the horizon; 90 = straight-down), `yaw`, and `height`, and the `EditorFocusTarget` carries them so the orbit camera repositions instead of only panning. `camera_frame` with a `pitch` but no `distance` auto-fits the document bounds into view (`orbitCameraPosition`/`frameDistanceForBounds` are exported and unit-tested), so composing a district aerial no longer takes many guess-the-y-offset round-trips or buries the camera in terrain.
- **Achievements / trophies** — `@jgengine/core/game/achievements`' `createAchievementTracker`
  is a serializable tracker for counter-goal (`progress`/`setProgress`) and boolean (`unlock`)
  achievements, with `score()`, `completion()`, an `onUnlock` seam (wire to a toast queue, feed,
  or sound), and `snapshot`/`restore`; its view `list()` keeps a stable identity so React reads it
  through `useSyncExternalStore` without re-projecting each frame. New `@jgengine/react` presentation:
  `useAchievements(tracker)`, `AchievementGallery` (unlocked/locked grid with counter progress bars,
  secret masking, and a completion/score header), and `AchievementToast` (unlock banner). Genre-agnostic
  and additive — no defaults or content shipped.
- **World-space pings** (`@jgengine/shell/world/WorldPings`, `@jgengine/shell/world/pingPulse`) — the
  in-scene side of a ping/marker: a bobbing downward arrowhead pointing at the spot, a ground ring, and a
  billboarded callout (glyph + `meta.callout`/`label`), colored by marker kind and fading in/out over the
  marker's lifetime. Reads a `MarkerSet` (typically the one a `createPingSystem` writes to), a marker
  source, or a static array — mount through `PlayableGame.WorldOverlay`. `pingsOnly` (default true) limits
  it to `meta.ping` markers; `renderCallout` overrides the chip. The pure lifecycle math (`pingOpacity`,
  `pingBobOffset`) is exported and unit-tested. First adopter: the apps/dev `world-pings` demo.
- **Difficulty-aware AI driver** (`@jgengine/core/ai/driver`, #1311) — `driveStep(state, dt, pose, goal, profile, tuning, rng, obstacleAhead?)` turns a vehicle pose + goal into the shared `AxisInput` for `tickDrivableVehicle`, with a `DifficultyProfile` (#1301) deciding how well the car drives: a reaction delay-line makes low tiers chase where the target *was*, corners shed speed instead of full-throttle orbiting, obstacles are perceived late by `speed × reactionSeconds`, steering wobbles by `executionJitter` resampled on an interval, and a wall-grinding car reverses out with counter-steer after a tier-scaled delay. `pathTargetAhead` walks a road/route polyline to a pure-pursuit lookahead point so the same brain follows authored streets and circuits. State is one serializable object; randomness injected; no world scans. First adopter: vice-isle cruiser pursuit, whose cops now drive by wanted level (3★ sloppy rookies → 5★ sharp interceptors) instead of `steer = error*2, throttle = 1`.
- **Effect primitives: named hooks for the recurring `useEffect` shapes** (`@jgengine/react/hooks`, `@jgengine/shell/render/useDisposable`, #1298) — `useTicker(hz)` re-renders HUD elements at a steady rate for time-derived readouts (cooldowns, cast/swing bars); `useDomEvent(resolveTarget, type, handler, options?)` attaches a DOM listener with automatic cleanup and a stable handler ref; `useRafLoop(onFrame, active?)` runs a cancellable requestAnimationFrame loop with delta seconds; `useAutoScroll(dep)` pins a log/chat/console panel to its newest line; and shell's `useDisposable(create, deps)` (+ `disposeAll`) memoizes a three.js resource or tuple and disposes it on change/unmount, replacing the hand-rolled `useMemo` + dispose-effect pair. Prefer these over direct `useEffect` for their shapes — a lint restriction on direct `useEffect` outside the primitives layer follows in a later phase.
- **Three-tier AI decision quality** (`@jgengine/core/ai/difficulty`, #1301) — one serializable `DifficultyProfile` (reaction time, decision noise, execution jitter, ability discipline, perception scale, plan depth/width) owns how well any opponent decides, with canonical `easy`/`standard`/`expert` tiers (`DIFFICULTY_TIERS`, `difficultyProfile(tier, overrides)`) and deterministic appliers at the universal decision seams: `advanceReactionGate` (delay acting on new information), `pickScored` (noisy argmax over any caller-scored option list), `executionError` (aim/lead/timing fuzz), `shouldUseAbility` (spend-or-hold specials from a scored opportunity window), and `planLookahead` (depth/width-bounded negamax or own-sequence search over a game-owned `moves`/`apply`/`evaluate` domain — greedy at easy, multi-ply tactics at expert). Composes with the existing substrates: scale `MobBrainConfig.aggroRadius` by `perceptionScale`, route `acquireTarget` scores through `pickScored`, gate `advancePursuit` swaps behind the reaction gate.
- **Authored per-placement rig animation applies in game** (`@jgengine/core/world/authoredObjects`, `@jgengine/core/scene/objectStore`, #1276) — a placement's editor-authored `marker.meta.animation` (role→clip states, `"auto"`/`"none"`, walk/run/fade, one-shot bindings; the stable contract from #1274) now flows through `resolveAuthoredObjects` → `placeAuthoredObjects` → `ObjectStore.place` onto the placed object's `ModelConfig.animation`, so the override applies at play time instead of being write+preview only. `AuthoredObject.animation`, `PlaceOptions.animation`, and `SceneObject.animation` are new optional fields; the new `markerAnimation(marker)` reader exposes the contract. Markers with no override are unchanged — animation still comes from catalog resolution.
- **`EffectResult` carries the slain entity's identity** (`@jgengine/core/combat/effects`, #1263) — a lethal `ctx.scene.entity.effect()` hit now returns `slain: { catalogId, name?, userId? }` on the per-target result, captured before the death system despawns the target. Kill credit / XP reads the victim's `catalogId` (its spawn kind) straight off the result — no game-side spawn-time registry mirroring instance ids to kinds. Non-lethal hits omit `slain`. The new `EffectSystemDeps.resolveSlainIdentity` seam is optional and additive, so existing effect-system compositions keep their exact shape.
- Interactive fullscreen map + player waypoints. `@jgengine/core/world/waypoints`'
  `createWaypointStore` is a serializable player-waypoint layer (place/track/clear,
  snapshot↔restore) that mirrors pins into a `MarkerSet` so every map surface renders
  them, and reports bearing/distance `guidance` for an on-screen arrow. New React
  primitives in `@jgengine/react/map`: `FullscreenMap` (wheel-zoom/drag-pan overlay
  that never fires a click after a pan), `WorldMapSurface` (the viewport-aware map
  `<svg>` now shared by `WorldMap` and `FullscreenMap`), `MapLegend` (marker-kind key),
  and `WaypointArrow` (HUD guide needle). A new `waypoint` entry joins
  `DEFAULT_MARKER_KINDS`.
- Editor RPC/CLI verb `add_path` (`@jgengine/editor`): author a new path/route into the scene
  document from an ordered list of ≥2 `{x,z}` (optional `y`) points in one call, without an
  `export_document`/`import_document` roundtrip. `kind` defaults to `route`; `meta` is schema-validated
  like `set_path`, and a colliding `id` re-ids in the document-global namespace.

### Changed

- **`check-game-shape`/doctor accept editor-import-graph modules by convention** (`packages/jgengine` `gameShape`, #1377) — a top-level `src/editor<Name>.ts` module (plus its colocated `.test.ts`) is now an allowed game-shape extra, matched by the `editor<Name>.ts` naming convention instead of an exact-filename enumeration. Fixes `editorKinds.ts` tripping the shape gate and stops the next editor-graph module from re-reddening `main` the moment it lands. No game needs changes; `editorLayers`/`editorCatalogs`/`editorKinds` and any future sibling are all recognized.
- **Road ribbons no longer self-intersect at bends** (`@jgengine/core/world/roads`) — `buildRoadRibbon` now miter-joins the inner edge of a bend and welds any residual fold when the local turn radius drops under the half-width, so dense arc-sampled corners render as one clean surface instead of a doubled bowtie. Straight ribbons and terminal cross-sections stay byte-identical (junction welds unaffected).
- **Junction surfaces stopped emitting sliver triangles** (`@jgengine/core/world/roads`) — `buildJunctionSurface` grouped approach corners globally by angle, which interleaved unequal-width approaches and produced shard/sliver fans; corners now stay grouped per approach with wrap-safe ordering and outward curb-return arcs, and the fan runs over an angle-monotonic simple boundary.
- **Street corner arcs sample at ≤~9° per vertex** (`@jgengine/core/world/streetGenerator`) — corner fillets previously stepped up to `maxTurnAngle` (~28°) per vertex and read as hard polygons at road width; both net and circuit corners now sample finely, and sidewalk offsets became true parallel offsets (outside arcs, inside miter-clamp + weld) that never pinch into the road surface.
- **Circuit centerlines are curve-first splines** (`@jgengine/core/world/streetGenerator`) — the folded layout polygon (hull + deep inward displacement, guaranteed hairpin/ess) now serves as control points for a periodic centripetal Catmull-Rom spline with a curvature floor at `minCurveRadius` (weighted Laplacian relaxation), so a lap is mostly flowing sweepers and continuous esses with 1-3 deliberate straights — not straight segments with corner caps. Fitted radii form a smooth continuum (~1.1-11x the floor); property tests pin curvature continuity, curved-share, and hairpin+sweeper coexistence.

- **Chase camera yaw is smoothed by default** (`camera.chase.yawResponse`, `@jgengine/shell` chase rig, #1370) — the boom now eases toward the followed body's facing with `1-exp(-response*dt)` smoothing (default response 5) instead of rigidly equaling it every frame, so a strafe-flipped facing arcs the camera around the character rather than teleporting it to the far side. Set `yawResponse: Infinity` to restore the legacy rigid follow; drift-lag (`velocityYaw`) keeps its own response as before.
- **Editor content-browser thumbnails no longer crash the editor when a GLB's textures fail** (`@jgengine/editor`, #1270) — `getGlbThumbnailState` (the `getSnapshot` behind `useGlbThumbnail`/`AssetThumbnail`) returned a fresh object literal on every call, violating the `useSyncExternalStore` stable-snapshot contract; React's post-commit consistency check then forced a re-render every commit ("Maximum update depth exceeded"), and the `GameUiErrorBoundary` blanked the whole editor chrome. It now reuses the prior snapshot object while a URL's observable state (idle/loading/ready/error) is unchanged, so a permanently-failing asset settles to a stable error/glyph fallback instead of looping. No API change; behavior only.
- **Offline autosave no longer starves in a living world** (`@jgengine/core/runtime/runtimeSave`) — `autosave` mode previously debounced by *resetting* its timer on every world change, so an open world that mutates every frame (AI, physics, the day/night clock) pushed the timer forward faster than it could fire and never persisted; a game that drove no explicit `checkpoint()` effectively never saved. Autosave is now a trailing timer: the first unsaved change arms it, later changes ride the same timer, and it captures the latest snapshot when it fires — at most one write per `autosaveMs` and always within one interval, even while the world never idles. No API change; behavior only.
- **Effect consolidation phase 2: subscriptions on `useSyncExternalStore`, dispose pairs on `useDisposable`** (`@jgengine/react`, `@jgengine/shell`, `@jgengine/editor`, #1304) — hand-rolled `subscribe(() => setTick)` re-render mirrors across the editor chrome/panels, shell settings (`useSettingsRevision`), camera director, WorldHud selection, and AuthoredScene live-document hook now ride `useSyncExternalStore` (fewer redundant render passes, identical update timing); ~15 shell renderers moved their `useMemo` + dispose-effect pairs onto `useDisposable`; derived-state/prop-reset/focus effects were removed in favor of render-time derivation and `autoFocus` (editor inspector fields, hierarchy active row, animation panel, play-control mirrors via the new shared `usePlayControl`, GamePlayerShell binding overrides — kills a one-frame stale-keybinds render on game switch; `GameViewport` now renders `data-jg-layout-collision` declaratively). No public API removals; `usePlayControl` (`@jgengine/editor`) is new.

- **Blocking colliders are now walkable surfaces, and collision is on by default** (`@jgengine/core`
  movement, #1402) — the walking controller treats placed objects' blocking colliders as ground:
  `collideObjects` defaults `true`; a ledge within the new `PlayerMovementConfig.stepHeight`
  (default 0.4) is stepped up instead of walling; a jump that clears an object's top **lands standing
  on it** (new `obstacleSupportHeight`, integrated in absolute space so the arc stays continuous over
  changing ground) instead of sinking inside the box and being rubber-banded out by depenetration; and
  walking off a drop taller than a step falls under gravity instead of teleporting the feet down.
- **Movement and vehicles no longer tunnel through solids** (`@jgengine/core`, #1402) — the shared
  axis clamp in `resolveObstacleStep` is now swept: a step whose target lands *beyond* a box's far
  face stops on the near face instead of passing straight through (fast cars, dashes/impulses, low-FPS
  frames, thin walls). The walking broadphase also derives its reach from the scene's actual largest
  blocking collider instead of a hardcoded 4 m bound, so the player no longer walks through the edges
  of wide buildings whose center point sat outside the query; and the kinematic-vehicle clamp passes
  collider `offset`/compound `boxes` through instead of silently dropping them.
- **Walking collision now depenetrates instead of locking.** `resolveObstacleStep`
  (movement) previously slid along box faces but had no escape once the capsule was
  strictly *inside* a solid box — its per-axis clamps returned zero on both axes and the
  player was stuck forever. It now pushes an enclosed capsule out along the box's
  shallowest face before sliding. Resting exactly on a face still reads as contact, so
  normal wall-sliding is byte-for-byte unchanged; only the previously-unrecoverable
  "wedged inside a building" case now frees itself.
- `import_document` (`@jgengine/editor`) now answers a missing or mis-keyed document param with an
  error naming the expected `json` param instead of surfacing a raw `JSON Parse error: Unexpected
  identifier "undefined"`.

### Removed

### Fixed

- **A missing/mis-served GLB no longer white-screens the whole game — it degrades to one placeholder primitive** (`@jgengine/shell/render/modelLoad`, #1340). A Vite dev server returns its `index.html` fallback (HTTP 200) for a missing `/models/*.glb`; `GLTFLoader` then throws parsing HTML as a GLB, and that failure surfaced as a rejected `useLoader` Suspense promise which does **not** reliably re-throw into a per-model React error boundary inside the react-three-fiber reconciler — so it escaped to the app-level `GameUiErrorBoundary` and blanked the scene. `sharedGltfLoader` (`DiagnosticGLTFLoader`) now probes a failed URL and, for a diagnosed broken asset (missing / HTML fallback / corrupt / unsupported), **resolves to a `createFallbackModel` placeholder box instead of rejecting**, containing the failure at the load seam for every consumer with no reliance on boundary recovery; a genuine parse error over valid-looking bytes is still surfaced. Emits a dev console warning naming the broken path. No API change; `useLoader(sharedGltfLoader, url)` benefits with no call-site change.

## 0.14.0

### Migrate

- **Nothing required** — this release is additive drop-in primitives, editor authoring, CLI discovery, and fixes. Bump `@jgengine/*` pins to `^0.14.0` (CLI `jgengine` is 0.11.0; `@jgengine/github` unchanged at 0.1.0) and rebuild.
- One behavior fix to know about: in a `rig: "chase"` game, on-foot movement and aim are now camera-relative (the chase rig reports its yaw to the shell like every other rig). If a game somehow relied on world-yaw-0 movement under a chase camera, that was the bug this fixes.

### Added

- One authoring gesture for scatterable coverage: `@jgengine/core/world/scatterCoverage` owns shared density/budget semantics (per-kind unit, requested→count→capped, one clamp-and-warn phrasing) for `grass_field`/`scatter`/`city`; the editor inspector leads each kind with the same Area → Assets → Density coverage section, scatter truncates to the shared 250k instance budget, and city single-sources its 2,600-lot cap.
- **Created games ship a drive/playtest script** (#1248) — `npx jgengine create` scaffolds now include `scripts/drive.mjs` (`bun run drive`): dependency-free headless play/testing of the running game — ordered `--click`/`--key`/`--wait`/`--shot`/`--rpc` steps against the agent bridge, plus `--playtest --strict` progress/softlock verdicts off `capture.probe`. Shared Chrome/CDP machinery lives in `scripts/browser.mjs`; `scripts/shoot.mjs` is unchanged in behavior, now a thin CLI over it.
- Editor: viewport clip preview for rigged assets (Animation dock "Clips" mode — pick a rig or placed instance, play/scrub/loop/speed any catalog clip) and an Inspector "Animation" section that authors a placement's `ModelConfig.animation` (role→clip dropdowns, auto/none, walk/run/fade, one-shot event bindings) as undoable `marker.meta.animation` edits. New subpaths: `@jgengine/editor/shell/clipPreview`, `@jgengine/editor/modelAnimationAuthoring`, `@jgengine/editor/ClipPreviewLayer`.
- **`npx jgengine find <intent>`** — active capability discovery: searches every shipped domain's `capabilities.md` (staged inside the CLI tarball, so it works regardless of which `@jgengine/*` packages a project installed) and prints the drop-in primitive + its import for an intent like `"toggleable window"`, `inventory`, or `minimap`. Scaffolded games are now briefed (in `AGENTS.md` and the `jgengine` intake skill) to reach for it before hand-rolling a HUD/inventory/window/rig.
- **`EntityPreview`** (`@jgengine/shell/render/EntityPreview`) — drop-in live 3D entity portrait for character screens, unit inspectors, and loadout viewers. Owns the nested `<Canvas>`, the `GameContextBridge`, and a `StudioStage` lighting rig with optional turntable / face-camera; the game passes its own `renderEntity` as children (or a native `model` + `instanceId`) and, bound to a live entity, the portrait walks/flinches/topples in sync with the world.
- **`GameContextBridge`** (`@jgengine/react`) — re-provide the running `GameContext` across a nested React reconciler boundary (the R3F `<Canvas>`), so a game building its own preview canvas no longer re-derives the bridge by hand.

### Changed

- **Chase rig reports its yaw to the shell** — `ChaseRig` now writes the camera yaw back to the shared yaw ref like every other player-facing rig, so on-foot movement and aim in a `rig: "chase"` game are camera-relative instead of frozen to world yaw 0 (WASD no longer fights the camera the moment it swings behind the player). Interior views (cockpit/hood/rear) report the vehicle heading.
- **Combat VFX no longer render as black squares under AO/DOF post-processing** (#1247) — GTAO/Bokeh scene prepasses skip overlay effects. Games with custom additive overlay effects opt out the same way: spread `POSTFX_OVERLAY_USERDATA` (`@jgengine/shell/postfx/postfxOverlay`) onto the overlay group's `userData`.
- **`PanelHost` windows stack above the HUD by default** (`@jgengine/react`) — the host establishes its own stacking context at `zIndexBase` (default 40), so open windows always paint over stat bars / nameplates / frames instead of bleeding through. Overridable per instance.

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
