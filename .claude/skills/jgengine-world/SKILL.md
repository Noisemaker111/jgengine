---
name: jgengine-world
description: World API: movement, cameras, physics, maps, sensors, spawn placement.
---

# jgengine-world

## Movement, pose, input

```ts
ctx.player.movement.getPose(id) / setPose(id, "crouch")   // validates catalog movement.poses
ctx.player.movement.getAim(id) / setAim(id, "ads")        // ADS = aim state + zoom modifier, not a pose
```

Poses (`standing/crouch/prone/running`) change the collision capsule (`POSE_HITBOX`); aim pairs with a `player.stats` zoom modifier on `"reticle"`. Game code reads action names only (`isDown("aim")`, `wasPressed("interact")`) — hold vs toggle is resolved by the binding config, never by raw key branches.

### `ctx.input` — polling the raw controls

`ctx.input` (`@jgengine/core/runtime/inputSnapshot`) is a per-frame held-action snapshot for `onTick` to poll, distinct from the command-dispatch path (bound actions still run commands the normal way): `publish(held: readonly string[])` (the shell calls this once per frame before `onTick`), `isDown(action)`, `held()` for the full list. Publishing never bumps `ctx.version()` — it's a poll surface, not reactive state.

**Rising-edge polling** — `justPressed(action)` / `justReleased(action)` are true only on the frame `publish` rolls the action's held state from up→down (or down→up); derived purely from the last two published held sets, so replay/rewind stays deterministic. Use these for once-per-press logic (menu toggles, jump, restart) in `onTick` instead of hand-rolling an `edgeState` object + per-tick reset — `justPressed` is a pure read, safe to call from multiple branches in the same tick.

**`repeatMs`** — bind an action as `{ hold: [...], repeatMs: 150 }` (`input/actionBindings`) and the shell fires its command on the down edge, then again every `repeatMs` while held, resetting on release (hotbar-style repeat-fire without a per-game timer).

**Aim on generic commands** — every command resolved from a bound action now runs with `{ yaw, pitch, aim: { yaw, pitch } }` in its payload, so a handler can read the camera-relative aim without going through `pointer.worldHit()`.

### Controller kinematics — movement config, physics tuning, respawn

`PlayableGame.movement` (`PlayerMovementConfig`) tunes the shell's built-in walk controller (never touch `PhysicsWorld` for ordinary player movement):

```ts
movement: {
  mode?: "free" | "axis" | "grid";           // "free" (default) camera-relative; "axis" locks travel to one world axis; "grid" snaps each committed position to cell centers
  axis?: "x" | "z";                          // world axis for mode "axis". Default "x"
  cellSize?: number;                         // cell size for mode "grid". Default 1
  collideObjects?: boolean;                  // collide the walking player against placed scene objects (unit-box AABBs) even without collision.voxel
  beforeCommit?: (frame: MovementCommitFrame) => readonly [number, number, number] | undefined | void;   // intercepts each frame's resolved position before the pose commits; return a replacement to constrain/redirect the step
}
```

`nav/navConstrain`'s `constrainToNavGrid(grid, { y? })` is a standalone walkable-pass-through + wall-sliding helper over a `nav/navGrid`; its `(proposed, entity)` shape doesn't match `beforeCommit`'s `(frame) => [x,y,z]` signature directly, so wire it in with a small adapter closure rather than passing it straight through.

`defineGame({ physics: { gravity, jumpVelocity } })` drives the kinematics controller directly: `gravity` (signed, e.g. `-24`) and `jumpVelocity` override the built-in tuning; omit either to keep the defaults. This is the one global exception to "never player tuning in `defineGame`" — it configures the shared controller, not a catalog entry. It is still **distinct** from `physics/physicsWorld`'s standalone rigid-body sim (see below) — `defineGame.physics` never touches that sim.

**Vertical motion intents** — `ctx.player.motion` (`@jgengine/core/runtime/motionIntents`): `impulse(vy)` adds to the vertical velocity the shell's controller is about to integrate, `setVerticalVelocity(vy)` replaces it outright, `setY(y)` wins over physics for that frame. The shell calls `takePending()` once per frame, before integrating gravity, to drain what accumulated; this is not reactive state (jump pads, launch abilities, bounce pads).

**`collision: { voxel: true }` — object lattice as solids.** When set, the shell's local player uses a voxel body whose `isSolid(x,y,z)` is rebuilt from `ctx.scene.object.list()` as exact `` `${x},${y},${z}` `` keys (integer cell queries). Integer-placed objects are walkable/blocking; fractional-coord objects decorate without colliding. Removing an object opens a real trapdoor under gravity — do not fake the fall with `setPose`. `visual.scale` does not shrink the collider (always a unit cell). The voxel body is created once; prefer `motion.setY` / `impulse` for vertical relocation — full XY teleport of the local voxel body is not supported. Solid cache rebuilds when object **count** changes. Recipe: `jgengine` → voxel trapdoor board.

**Respawn** — `ctx.scene.entity.spawnPoseOf(id)` reads the spawn pose, `resetToSpawn(id)` teleports back to it with zero velocity, `resetAllToSpawn(filter?)` does it for every entity matching an optional filter and returns the count (round resets, out-of-bounds recovery).

## Touch & mobile

Every game is touch-playable with zero per-game input code. On a coarse-pointer device the shell derives a `TouchScheme` from the game's `input` bindings (`deriveTouchScheme`, `@jgengine/core/input/touchScheme`): a virtual joystick binds whichever of `moveForward`/`moveBack`/`moveLeft`/`moveRight` (or `turnLeft`/`turnRight`) are bound, on-screen buttons cover the remaining actions, and drag-to-look mounts automatically for `first`-person camera rigs. Touch controls feed synthetic `touch:<action>` codes into the same `ActionStateTracker` the keyboard uses — game code reads `isDown`/`wasPressed` and never branches on input source.

Refine the derived scheme with the `touch` field of `defineGame({...})` (`TouchControlsConfig`, all optional):

```ts
touch: {
  gestures: {
    tap: "rotateCw",
    swipeUp: "hold",
    swipeDown: "hardDrop",
    drag: { left: "shiftLeft", right: "shiftRight" },
  },
  buttons: [
    { action: "rotateCcw", label: "CCW" },
    { action: "softDrop", label: "Soft" },
  ],
},
```

- **`gestures`** — bind `tap` / `swipeUp` / `swipeDown` / `swipeLeft` / `swipeRight` / `drag` (`{ left?, right?, up?, down?, stepPx? }`, repeats its action every `stepPx` of travel) on the play surface. An action consumed by a gesture is removed from the derived button set.
- **`buttons`** — curate the on-screen cluster (order preserved; bare string or `{ action, label?, icon? }`); omit to auto-derive one button per remaining bound action. Buttons render a glyph, not text: `iconForAction` (`@jgengine/react/gameIcons`) resolves the action name to a `GameIconName` (`jump`, `sprint`, `rotateCw`, `hardDrop`, `swap`, `hand`, `restart`, arrows, …), the `label` becomes the `aria-label`; set `icon: "<GameIconName>"` to pick one explicitly or `icon: false` to force the text label.
- **`hidden`** — actions to drop from the derived buttons without gesture-binding them.
- **`movement: false`** — suppress the virtual joystick even when movement actions are bound.
- **`look` / `lookSensitivity`** — drag-to-look on the play surface; defaults to `true` for `first`-person camera rigs, `0.005` radians/px.
- **`touch: false`** — opt out entirely when the game's own DOM UI is already touch-native.

`useDisplayProfile()` (`@jgengine/react/display`) reports `{ coarsePointer, compact, portrait }` — live media-query state, SSR-safe — for adaptive HUD layout; see the mobile/touch rules in [`../jgengine-ui/reference.md`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-ui/reference.md).

## Interaction — `proximityPrompt`

One primitive for all float UI: `{ radius, display, invoke }` where `display` is `{ kind: "keybind", actionId }` | `{ kind: "gauge", gaugeId }` | `{ kind: "label", text }` and `invoke` is `{ command, args? }` or null (display-only). `talkable: "dialogue_id"` on an entity expands to a talk prompt. Engine picks the nearest prompt in radius (priority tie-break). Never build per-game hint resolver chains.

`@jgengine/core/interaction/lockpick` — a solvable grid depth-puzzle minigame (see `jgengine-gameplay` for the full `generateLock`/`stepLock`/`visibleCells` walkthrough). `solveLock(spec)`/`solveLockPath(spec)` verify or compute a concrete row-per-column solution over a generated `LockSpec` — drive a "reveal the solution" hint button, or step a test/bot through a session deterministically by walking the returned path's row deltas as pick actions.

## Pointer-driven input and navigation
The **pointer is a service, not per-game glue**. Opt in with `camera` plus a `pointer` config in `defineGame({...})`; the shell casts the cursor into the world and dispatches commands you define — verbs stay commands, catalogs stay data.
- **`pointer.worldHit()` (shell service).** The shell raycasts the cursor to `{ point, normal, entity, object }` (a renderer-free `PointerHit` from `@jgengine/core/input/pointer`) — entity/object are the topmost instance ids under the cursor, else `null`, with a ground-plane fallback for open terrain. Consume it renderer-free: `aimToPoint(origin, point)` builds an `Aim` for `item.use`/projectiles (ground-target skillshots, twin-stick), `groundOf(hit)` drops to `[x, z]` for routing. `pointer.worldHitCenter()` is the same raycast pinned to the viewport center instead of the live cursor — the reticle-aim query a locked/hidden-cursor rig (first-person, gamepad) needs when there is no cursor position to read.
- **The `pointer` field of `defineGame({...})`** (all optional): `moveCommand` (left-click ground → `run(cmd, { point, entity, object })`, click-to-move), `select` (left-drag marquee + single-click box-select of entities), `orderCommand` (right-click ground → `run(cmd, { selection, point })`, issue a command to the selection), `contextMenu` (right-click an entity/object → its catalog `verbs` menu), `secondaryCommand` (right-click ground/entity/object → `run(cmd, { point, entity, object, aim })` when neither `orderCommand` nor `contextMenu` claims the click — a generic right-click verb for games with no selection/RTS model), `aim` (route the primary ability's aim to the cursor), `grabWorldItems` (left-click a `worldItem` within pickup radius → engine-owned `ctx.scene.worldItem.pickup`, no game command). Enabling `select`/`moveCommand` frees the left button for verbs; orbit moves to middle-drag.
- **`createDragCapture({ maxPull?, grabRadius? })`** (`@jgengine/core/input/pointer`) — a renderer-agnostic slingshot/drawback state machine: `begin(origin, at)` starts a pull (rejected outside `grabRadius`), `update(at)` tracks the cursor, `release()` returns the final `DragState { origin, current, pull, magnitude, fraction }` (pull clamped to `maxPull`), `cancel()` aborts. Angry Birds-style slingshots, bow drawback, throwable wind-up — pair with `aimToPoint` to fire.
- **Selection math** (`scene/selection`) is pure and testable: `createSelectionSet()`, `screenRect`/`selectWithinRect`/`isMarquee` over projected screen points.
- **Context menu** (`interaction/contextMenu`): a catalog entity/object carries `verbs: contextVerb(label, command, args?)[]`; the shell builds the menu with `buildContextMenu` and dispatches the chosen command via `contextVerbInput` (verb args + `target`/`point`, so one handler can walk-then-act).
- **Navmesh + A\*** (`nav/navGrid`): `createNavGrid({ bounds, cellSize, diagonal? })` → mark obstacles with `blockAabb`/`setWalkable`, or `populateNavGridFromEnvironment(grid, world)` to block every generated building's footprint on an `environment()` world's `structures` in one call (returns the count blocked) instead of hand-walking the district. `findPath(grid, from, to, { clearance?, smooth?, stepCost? })` returns a string-pulled `[x, z]` polyline (blocked start/goal snap to the nearest walkable cell) feeding **both click-to-move and AI routing**; `stepCost?(from, to)` multiplies the base cost of a grid step — `slopeStepCost(terrainField, weight?)` is the ready-made factory that penalizes steep terrain (routes around cliffs instead of over them). Renderer-free — AI and gameplay consume it without the shell.
- **`pathFollow`** (`nav/pathFollow`): the lighter authored-polyline mover for tower-defense creeps that needs no navmesh — `createPathFollow({ waypoints, speed, loop? })` + pure `advancePathFollow(config, state, dt)` (crosses multiple waypoints per tick, reports `done`/`heading`/`distanceTravelled`). Feed it a navmesh route with `pathFromNav(route, elevation, offset?)` and the same follower drives click-to-move — `elevation` is either a fixed `y` or a `{ sampleHeight(x, z) }` field (any `TerrainField` qualifies), so a route across relief rides the ground instead of a flat plane.
- **`constrainToNavGrid(grid, { y? })`** (`nav/navConstrain`) is a standalone walkable-pass-through + wall-slide helper: it passes through walkable moves, slides along walls at the navmesh boundary instead of stopping dead, and optionally remaps `y` to the grid. Its `(proposed, entity)` shape doesn't match `PlayerMovementConfig.beforeCommit`'s `(frame) => [x,y,z]` signature, so wire it in with a small adapter closure (see "Controller kinematics" above) to wall a player/AI to the same navmesh `findPath` already routes against.
## AI — director, threat, jobs, crowds (`ai/*`)
Renderer-free AI over the same navmesh (`findPath`/`pathFollow`) gameplay already uses. Everything ticks on **game-time `dt`** (the `ctx.time` simClock delta), so it obeys pause and fast-forward for free. Manifests, patrol routes, job definitions, threat weights, and POIs are **game data** — the primitives own the loop, the catalog owns the content.
- **Spawn director** (`ai/spawnDirector`) — budgets and escalates spawns for wave shooters and difficulty directors (Brotato, Bloons TD 6, Risk of Rain 2, Helldivers 2, Deep Rock Galactic). `createSpawnDirectorState(config)` then pure `advanceSpawnDirector(config, state, dt, { alive, players? })` → `{ state, spawns: SpawnRequest[] }`. Each `WaveManifest` grants a `budget` spent on affordable weighted `SpawnEntry`s (`cost`/`weight`/`minWave`), capped by `maxAlive`; `duration` auto-advances waves (or call `advanceWave` on "wave cleared"). Budget also trickles via `budgetPerSecond`, ramps a difficulty curve with `escalationPerSecond` (grows with sim-time), scales with `playerBudgetPerSecond`, and surges on `raiseAlert(state, amount)` decaying over time (bug-breach/dropship escalation). Seeded (`seed`) so ticks are deterministic. `pickSpawnPoint(points, players, { roll, bias })` biases placement toward (or away from) players. `config.spawnPoints?: NavPoint[]` lets the director pick a point itself: each `SpawnRequest` then also carries `point` (the chosen `[x, z]`, biased by `config.spawnPointBias`) and `laneId` (the point's index into `spawnPoints`) — feed multiple named lanes/portals and read `laneId` back to route the spawned entity down its lane instead of correlating positions by hand.
- **Threat table** (`ai/threat`) — MMO/extraction aggro (Escape from Tarkov, WoW-style tanking). `createThreatTable({ decayPerSecond?, max?, forgetBelow? })`: `add(source, amount)` accumulates, `decay(dt)` bleeds off per game-second and forgets emptied sources, `highest({ current?, stickiness? })` returns the top-threat source to feed `scene/targeting` — `stickiness` (e.g. 1.1) keeps the current target until another exceeds it by that factor, so aggro doesn't jitter. `taunt(source, durationSeconds)` forces the mob onto a tank for that window (overriding `highest`) and lifts the taunter's threat to the current top so aggro stays after the window; `forcedTarget()` reports the active taunt, `decay(dt)` counts it down. `ranked()` for a threat meter.
- **Patrol** (`scene/behaviors`) — `patrol({ waypoints, speed, loop? })` is a `BehaviorDescriptor` (a route is data) that layers a fixed beat on top of `wander`; drive it with `createPathFollow`/`advancePathFollow` (lane creeps, scav patrols in Deadlock/Tarkov). Route waypoints between guard posts with `findPath`.
- **Job board** (`ai/jobBoard`) — colony/companion task assignment (Palworld stations, Schedule I employees, Sons of the Forest directives). `createJobBoard()`: `post(job)` a `JobDef` (`station`, `work` seconds, `priority`, `arriveRadius`, `repeat`), `claim(worker)` auto-pulls the highest-priority queued job or `assign(worker, jobId)` for a player order (steals it from its holder), `release` requeues. Per tick `advance(worker, dt, { distanceToStation })` runs the state machine `travelling → working → done` (path to `station(worker)` via `findPath`, occupy, run the loop), returning a `JobReport` on completion; `repeat` jobs re-run as a production loop and report each cycle.
- **Crowd flow** (`ai/crowd`) — many agents routing to their own points of interest with congestion (Two Point Museum corridors, Dave the Diver seating). `computeFlowField(grid, goals, { clearance?, congestion? })` runs Dijkstra from the goals over the walkable grid → `direction(point)`/`next(point)` steer any agent toward the nearest goal (no per-agent A*). `createCrowdField(grid)` tracks per-cell occupancy (`enter`/`leave`/`count`); pass `crowd.penalty(weight)` as the field's `congestion` to reroute flow around crowded cells each tick. `selectPoi(pois, from, { roll, occupancy?, distanceBias?, distance? })` weights a POI by appeal and proximity, skips ones at `capacity`, and accepts a `distance` override (e.g. `findPath` length) to choose over the navmesh, not line-of-sight.
- **Factions & reputation** (`faction/factions`, `faction/reputation`) — allegiance-based hostility for RPGs/MMOs/strategy (WoW-style Horde-vs-Alliance, at-war reputation grinds, guards-vs-thieves). `createFactionGraph({ factions, symmetric?, unaligned? })` models a faction-vs-faction relation matrix — each `FactionDef` lists `relations` toward others (`"hostile" | "neutral" | "friendly"`) with `towardSelf`/`towardOthers` fallbacks; `relationBetween(a, b)` resolves it (mirroring undeclared directions when `symmetric`, defaulting `unaligned` for unknowns). `createFactionRoster(graph)` maps entities to factions (`assign`/`factionOf`/`members`), then `relationBetweenEntities`/`isHostile`/`hostilesOf(observer, candidates)` answer "who is my enemy" as a data lookup — feed it into `scene/targeting`'s `classify` and `ai/threat` eligibility instead of a per-game role-string check. `createReputationLedger({ tiers?, initial?, min?, max? })` is the per-actor standing ledger: `gain`/`set`/`standing` track reputation, `tier`/`relation` map it through `DEFAULT_REPUTATION_TIERS` (the classic Hated→Exalted ladder, or your own), `standings(actor)` snapshots all. `effectiveRelation({ base, ledger, actorId, factionId })` overlays a player's earned standing on the base faction relation, so a reputation grind flips a normally-hostile faction to neutral/friendly.
## Map, fog of war & ping
Minimap/world-map/fog/compass state is renderer-free core (`world/*`), the top-down terrain image bakes in the shell, and the minimap/compass/world-map are react components. Ping rides the existing party + feed — it is not a new channel.
- **Markers** (`world/markers`): `createMarkerSet()` is a reactive keyed set of `MapMarker { id, kind, position, label?, owner?, expiresAt?, meta? }` — `add`/`remove`/`get`/`list`/`query({ kind, owner, near, radius })`/`prune(now)`/`subscribe`. `kind` is a game-owned catalog string; `DEFAULT_MARKER_KINDS` (objective/enemy/loot/location/danger/ping/player/ally) supplies colors + glyphs the react map reads (override with your own `MarkerKindStyle` palette). Objective/entity/loot markers all live here.
- **Fog of war** (`world/fog`): `createFogField({ bounds, cellSize })` is reveal-on-event — `reveal(x, z, radius?)` (a dig/act), `revealAlong(from, to, radius?)` (a walked trail); once a cell is revealed it stays revealed. `isRevealed`/`fraction`/`cells()` (stable snapshot for rendering)/`reset`/`subscribe`.
- **Minimap math** (`world/minimap`): pure projection + bearings — `projectToMinimap(worldPoint, { center, worldRadius, size, rotate? })` → pixel `{ x, y, inside, distance }` (north = −Z maps up), `clampToMinimapEdge` for off-map markers, `compassBearing(from, to)`/`headingToBearing(yaw)`/`bearingToCardinal`/`relativeBearing` for the compass strip.
- **Ping** (`game/ping`): `classifyPing(hit, { roleOf, categoryOf }, options?)` turns a G1 `pointer.worldHit()` `PointerHit` into a category (hostile entity → `enemy`, tagged object → its catalog category, open ground/ally → `location`). `createPingSystem({ markers, feed, party?, ttlMs?, classify, classifyOptions? })` composes classify + broadcast: `ping(from, hit, category?)` classifies, drops a categorized marker, and pushes the `PingPayload` to the party feed under `PING_FEED_ACTION` (`"party.ping"`) — the shell's feed bridge fans it to the squad. `DEFAULT_PING_CATEGORIES` is the enemy/loot/location/danger wheel. Enable the verb with the `pointer.pingCommand` field of `defineGame({...})`: the shell binds the `ping` input action → `worldHit()` → runs your command with `{ point, entity, object, normal }`.
- **Shell render** (`@jgengine/shell/map`): `bakeTerrainMap(field, bounds, { resolution? })` renders a `TerrainField`/`RegionField` to a top-down PNG data-URL for the map background; `MapMarkerBeacons({ markers })` renders world-space beacons (the visible side of a ping) — wire via the `WorldOverlay` field of `defineGame({...})`. See the `extraction-map` demo game.
## Sensors, vision & observer tools (`sensor/`)
Pure `@jgengine/core/sensor/*` primitives for querying and surfacing world state the player can't normally see or reach through the standard occlusion/proximity rules — reveal vision, hidden-state sensors, photo-mode framing, and session replay. Shell renderers/HUD pieces live in `@jgengine/shell/vision` and `@jgengine/shell/replay`.
| Primitive | Answers |
|-----------|---------|
| `createRevealQuery({ resolvePosition, resolveTags, candidates })` → `RevealQuery` | `inRadius(center, radius, tags)` — occlusion-ignoring tagged-entity radius query (Dark Sight / detective-vision reveal, #115). `inRadius` already never checks occlusion (only combat's AoE `effect()` layers a LoS filter on top of it) — this is that same query shaped for a vision readout: scoped to catalog-declared tags, sorted nearest-first |
| `probeHiddenState(origin, sources, { range, variableId, falloff? })` / `probeHiddenStateAll(...)` → `SensorReading \| null` | A sensor verb: reads a hidden zone/entity state variable (EMF/thermometer/geiger, #116) in range, strongest reading first; `strength` falls off linearly with distance by default |
| `projectToView(camera, point)` → `FrustumProjection` | Pure camera-frustum projection (no three.js) — `inView`, `screenX/screenY` (-1..1), `distance` |
| `framingScore(projection, config?)` → `number` | 0..1 framing quality from screen-center placement + distance-to-ideal (photo-mode "is this subject framed", #117) |
| `createFrustumSensor(config?)` → `FrustumSensor` | `tick(camera, targets, dt)` — per-target in-view + framing + `dwellSeconds` (resets the instant a target leaves frame); a view-frustum sensor on a held camera object (Content Warning-style monster-filming scoring) |
| `createRecordingBuffer(options?)` → `RecordingBuffer<T>` | `append(t, data)` / `seek(t)` / `range(fromT, toT)` — a session-recording buffer for replay/photo mode/kill-cam (#120), keyed on game-time so pause/fast-forward scrub consistently |
| `colorDistance(a, b)` / `concealmentScore(entityColors, backgroundColors)` / `createConcealmentSensor(config?)` → `ConcealmentSensor` | Camouflage/blend-in scoring — how well an entity's palette matches its surroundings (hide-and-seek, stealth camo checks) against a `threshold` |
| `createFreezeMonitor(config?)` → `FreezeMonitor` | Detects a tracked subject moving past a tolerance speed during a "freeze" window (red-light-green-light, statue games) and reports `FreezeViolation`s |
Shell wiring: `@jgengine/shell/vision/RevealVision` (`RevealHighlights` — depth-test-disabled 3D highlight meshes for tagged entities in radius, meant for `WorldOverlay`; `RevealScreenTint` — full-screen CSS tint for "vision mode is on", meant for `GameUI`), `@jgengine/shell/vision/HiddenStateProbeHud` (`SensorReadoutMeter` — needle-strength HUD readout), `@jgengine/shell/vision/FrustumSensorHud` (`FrustumSensorReadout` — drives the sensor off the live render camera via `useThree`/`useFrame`, portals its HUD through drei's `Html fullscreen`), `@jgengine/shell/replay/useSessionRecorder` (records an entity's pose into a `RecordingBuffer` every frame; drive an observer-cam ghost, scrubber, or kill-cam export from it). The detached spectator/photo cam itself is the `observer` camera rig (see Camera rigs above) — bind it to any entity or fixed point.

## World features

Renderer-free world surface — query primitives, environment fields + weather + realm composition, survival meters/moodles, interactive building & terraform, the optional headless physics world, vehicles/mounts/racing, and spawn placement. Full surface: **[reference.md](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-world/reference.md)**.

## Level design — places, not noise

Procedural terrain is a canvas, never the level. A world with only `terrain()` + spawn clusters reads as an empty sandbox no matter how big its bounds. Every open-world game composes **places** on top of the canvas, and the checklist below is the floor, not the ceiling:

- **Every site is a set-piece.** A camp is a wall ring with a deliberate gate opening facing the approach, cover inside, a tower or banner as its silhouette — never a bare radius of spawns. Compose from placed objects (`ctx.scene.object.place` with stable instance ids) driven by pure data functions (ring/scatter/route generators) so bun tests can assert the composition without rendering.
- **Roads make the space legible.** Physically connect sites: trace waypoint routes between them and feed the points into the terrain descriptor's `flatten` masks so the route is genuinely walkable, then dress it — markers, wrecks, signposts — every ~60 units so the player can read the path at a glance. A test should walk the route and assert the step height stays small.
- **One landmark per region.** A water tower, crashed vehicle, gate, or monument visible from the approach gives orientation without a map. Distinct silhouette + distinct color.
- **Anchor → approach → arena → reward.** Each combat site needs a visible anchor drawing the player in, a readable approach (the road), an arena with cover the AI and player both use, and a visible reward (chest, vendor, quest turn-in) at the back so clearing it feels earned.
- **People, not just spawns.** Hubs hold named NPCs (talkable entities with prompts), vendors, and light props (lamps, crates, stalls). A hub with only vending-machine objects is a menu, not a town.
- **Density budget.** Inside a site's flatten radius aim for roughly one placed object per 6–10 units of radius; along roads one prop per ~60 units; open wilderness stays sparse so sites contrast. Frustum/distance culling is automatic — err toward more dressing, not less.
- **Guided openness, never invisible walls.** Total freedom reads as emptiness: herd the player physically. Raise terrain amplitude so off-road relief is genuinely unclimbable, gate slope in `movement.beforeCommit` (block a step whose ground rises past a climb limit, with per-axis slide so it feels like a wall of rock, not a script), and carve the intended route as the one low path. Then buy the openness back deliberately: side pockets (a den, a cache, a wreck field) hang off the main road on short spur routes, each with its own reward, so exploration branches from the path instead of dissolving it. Test the herding the same way you test the road: assert off-road samples rise above the climb limit while every route and spur stays under it.

## Turn-based & tactics (renderer-free)

