# JGengine engine-gaps — PR grouping plan

104 open `gaps` issues (#22–#125), assigned to 22 system-level PR groups. Foundation groups land first; dependents follow. One issue = exactly one group.

## LIVE STATUS (orchestrator ledger)

| Group | Model | Branch | State | PR |
|-------|-------|--------|-------|----|
| G1 Navigation & pointer | opus | claude/gaps-nav-pointer | in-flight (batch1) | — |
| G2 Camera rig library | opus | claude/gaps-camera-rigs | ✅ DONE (green) | #128 |
| G3 Physics constraints | opus | claude/gaps-physics-actors | ✅ DONE (green) | #127 |
| G9 Crafting/tech/production | opus | claude/gaps-crafting | in-flight | — |
| G7 Character combat feel | opus | claude/gaps-combat-feel | in-flight (batch1) | — |
| G10 Item & gear | opus | claude/gaps-item-gear | ✅ DONE (green) | #126 |
| G15 Turn-based & tactics | opus | claude/gaps-turn-tactics | in-flight (batch1) | — |
| G16 Card & board stack | opus | claude/gaps-card-board | in-flight | — |
| G4,G5,G6,G8,G11,G12,G13,G14,G17,G18,G19,G20,G21,G22 | — | — | todo | — |

G2 camera shake channel (for G7 #47): `import { cameraShake } from "@jgengine/shell/camera"` / `useCameraShake()`. Camera config types on `@jgengine/core/game/playableGame`.
STACK-READY single-parent dependents (launch next as slots free): G14←G3 (off gaps-physics-actors), G21←G2 & G22←G2 (off gaps-camera-rigs), G17←G10 (off gaps-item-gear), G6←G7 (off gaps-combat-feel, reuse accumulatorMeter). Two-parent G13 (G2+G3) waits for #127+#128 to merge to main.

G10 storageTier API (for G17 #99): `@jgengine/core/inventory/storageTier` — `partitionOnDeath`, `createDeliveryQueue`, `insureLost`, `resolveConsolation`; `InventoryDeclaration.tier?: StorageTier`.
G3 physics API (for G13/G14): `@jgengine/core/physics/physicsWorld` — joints (`hingeJoint`/`fixedJoint`/`distanceJoint`/`springJoint`, `setJointAnchor`), `onCollision(listener, minApproachSpeed) → CollisionEvent{a,b,nx,ny,nz,approachSpeed,impulse}`; `physics/ragdoll`, `physics/carryable`, `physics/forceVolume`, `physics/spatialGrid`. Suspension→springJoint; grapple/rope→distanceJoint to world anchor.

Batch 1 launched. Next to launch as slots free (Wave-1 independents, no foundation dep): G6 (abilities, reuses G7 accumulator-meter — land after/with G7), G15 (turn-based), G16 (card/board), G9 (crafting), G11 (survival), G18 (audio), G20 (interaction verbs). Then Wave-2 once foundations open.

Waves: W1 can start now (G1,G2,G3,G6,G7,G9,G10,G11,G15,G16,G18,G20). W2 needs foundations (G4,G5,G8,G12←G1; G13←G3,G2; G14←G3; G21,G22←G2). W3: G17←G10; G19←G13.


## Dependency-order execution list

**Wave 1 — start immediately (no external group deps):**
G1 Navigation & pointer · G2 Camera rig library · G3 Physics constraints & actors · G6 Abilities/resources/cooldowns · G7 Character combat feel · G9 Crafting/tech/production · G10 Item & gear · G11 Survival & environment · G15 Turn-based & tactics · G16 Card & board · G18 Audio & voice · G20 Interaction verbs & minigames

**Wave 2 — after their foundation lands:**
G4 World items & loot (←G1) · G5 Placement & building (←G1) · G8 AI director/behavior/crowds (←G1) · G12 Map/HUD/ping (←G1) · G13 Vehicles/mounts/racing (←G3, G2) · G14 Traversal & destruction (←G3; shares terrain write-back with G5) · G21 Sensors/vision/observer (←G2) · G22 Player embodiment & expression (←G2)

**Wave 3 — after Wave 2:**
G17 Objective/mode/session machines (←G10) · G19 Multiplayer depth (←G13)

Cross-cutting note: G7 (#47 hitstop) pairs with G2 (#28 camera-shake channel) — soft dep, no ordering block. A shared **accumulator-meter primitive** underlies #40/#43/#46/#119 (charge/stagger/buildup/streak); build it once (land with the first of G6/G7) and reuse.

---

## G1 — Navigation & pointer-driven input
- **PR title:** `feat(shell,core): navigation & pointer-driven input`
- **Closes:** #22, #30, #31, #51, #52
- **Target packages/layer:** `core` (navmesh + A* grid, `pathFollow` polyline behavior, pointer-hit contract types) + `shell` (screen→world/ground raycast service, drag-marquee, right-click context menu render). Renderer-side raycast lives in shell; the walkable graph and path math stay renderer-free in core.
- **Scope:** The most-depended-on foundation. Build `pointer.worldHit() → { point, entity, object, normal }` in the shell and expose it to the loop and as an `item.use` aim / move-to target (#22). On top of it: a drag box-select set + marquee with an "issue command to selection at world point" verb (#30) and a right-click `contextMenu(entity|object)` that lists the target's verbs and dispatches the chosen command (#31). In core, a walkable navmesh/grid + A* feeding both click-to-move and AI routing (#51), plus a lighter authored-polyline `pathFollow` behavior for tower-defense movers that needs no navmesh (#52). Catalog-first: verbs are commands; the pointer is a service, not per-game glue.
- **Depends-on:** none
- **Status:** todo

## G2 — Camera rig library
- **PR title:** `feat(shell,core): camera rig library (top-down/iso, RTS, OTS, lock-on, chase, shake, cinematic)`
- **Closes:** #23, #24, #25, #26, #27, #28, #29
- **Target packages/layer:** `shell` (the only renderer — all rigs) + `core` (camera config/param types on `PlayableGame.camera`).
- **Scope:** A rig library replacing the single orbit camera. Fixed top-down/isometric rig with height/pitch/zoom + decoupled follow (#23); free-pan/edge-scroll RTS rig that allows `followEntityId: null` on every rig so avatar-less games can mount a camera (#24); over-the-shoulder rig with lateral/vertical offset, ADS transition, shoulder-swap, reticle decoupled from camera center (#25); lock-on rig binding yaw to the player→target vector with move-axis reinterpreted as strafe (#26); speed-reactive vehicle chase rig (speed→FOV curve, spring-arm damping, procedural shake) with cockpit/hood/rear views (#27); a `cameraShake(amplitude, decay)` trauma channel any rig reads (#28); and a keyframe/path player + cross-fade lerp on rig swap so mode changes don't hard-cut (#29). Params flow through `PlayableGame.camera`, not `onTick` position writes.
- **Depends-on:** none
- **Status:** todo

## G3 — Physics: constraints, actors & mass
- **PR title:** `feat(core,shell): physics constraints, ragdoll, carryables & force volumes`
- **Closes:** #68, #79, #81, #82, #85
- **Target packages/layer:** `core` (`PhysicsWorld` joint API, broad-phase index, ragdoll bodies, carryable constraint + collision→event hook, force volumes / platform-carry) + `shell` (`InstancedBodies` render of new body types).
- **Scope:** The physics foundation under vehicles, traversal, and destruction. A small joint API on `PhysicsWorld` — `hingeJoint`/`distanceJoint`/`springJoint`/`fixedJoint` between two bodies or body↔world-point (#79). A ragdoll (bones + joints, optional balance motor for active-ragdoll walking) on that API (#81). A `carryable` (grab-raycast → follow-point constraint, encumbrance, drop/throw), a shared multi-owner grab, and — load-bearing for many groups — a **physics collision → gameplay-event hook** so contacts reach game code (#82). A `forceVolume` trigger (impulse/velocity on entry) + `platformCarry` composing a standing body's transform with a moving platform's delta (#85). And a broad-phase spatial index (grid/quadtree) for cheap same-tick collision across hundreds–thousands of simple enemies, separate from the rigid-body sim (#68).
- **Depends-on:** none
- **Status:** todo

## G4 — World items & loot presentation
- **PR title:** `feat(core,shell,react): dropped-item world entities & loot filter`
- **Closes:** #32, #33
- **Target packages/layer:** `core` (`worldItem` entity model, rarity metadata, loot-filter rule evaluator) + `shell` (beam/color/label render, scatter impulse) + `react` (pickup prompt/hook).
- **Scope:** A `worldItem` entity (position + item ref + rarity) with a rarity→beam/color/label render binding, pickup radius + click-to-grab, and on-death drops routed through it with a scatter impulse (#32) — replaces loot teleporting straight to inventory. Over it, a rule evaluator keyed on rarity + base type + affix tier that hides/recolors/beams/labels ground items (#33). Rules are data the game supplies; the render binding is engine-owned.
- **Depends-on:** G1 (click-to-grab uses the pointer ray)
- **Status:** todo

## G5 — Placement, building & terraform
- **PR title:** `feat(core,shell): interactive placement, building & terraform tools`
- **Closes:** #34, #35, #36, #37, #38, #111
- **Target packages/layer:** `core` (connector graph + support solver, wall/roof pipeline, `placedStructureStore`, terrain-field write-back, per-plot edit permissions) + `shell` (ghost mesh, valid/invalid tint, wall-draw tool, terraform brush).
- **Scope:** Turns data-only placement into interactive build tooling. A `placementController(footprintData)` owning ghost mesh, valid/invalid tint (wrapping `validatePlacement`), rotate, snap-mode (grid/free/surface), commit — driven by the pointer ray (#34). Typed connector sockets (snap-to-nearest-compatible) + a support solver that walks to ground and collapses unsupported pieces into rigid-body debris (#35). A wall-draw → auto-enclose → auto-roof-from-footprint pipeline + per-surface floor/wall paint (#36). A `placedStructureStore` (save/load, re-select, move, delete) (#37). A `terraformBrush` (raise/lower/flatten/paint paths) writing back to the terrain field under the cursor (#38). And per-plot/guild edit permissions + a pooled-contribution model for co-op shared structures (#111).
- **Depends-on:** G1 (ghost + terraform driven by the pointer ray)
- **Status:** todo

## G6 — Abilities, resources & cooldowns
- **PR title:** `feat(core,react): ability kit, resource meters, auto-target & run drafts`
- **Closes:** #39, #40, #67, #69, #70, #119
- **Target packages/layer:** `core` (`abilityKit`, accumulator-meter primitive, `autoTargetPolicy`, resistance matrix, run-scoped modifier stack) + `react` (four-state slot binding hooks).
- **Scope:** Models an ability as separate from an inventory item. An `abilityKit` component: named slots with `{ cooldownMs, chargesMax, resourceCost, castType }` reusing existing effects/projectiles, exposing ready/cooldown/no-resource/just-cast states so the HUD's four slot states have something to bind to (#39). An event-fed `resourceMeter` that increments from tagged combat events and gates/fires at a threshold (ult charge/adrenaline) (#40) and its sibling — a build-on-kill/reset-on-damage streak/combo meter with tiered thresholds (#119); both share one accumulator-meter base. An `autoTargetPolicy` (nearest/random/strong/first/last-on-path) evaluated each tick and wired to cooldowns/effects (#67). An attack-tag × target-property resistance matrix (immune/resist/normal/vulnerable) over the existing `receive` gate (#69). And a run-scoped stacking-modifier stack + pause-present-N-weighted-picks-resume flow over loot-table weighting (#70).
- **Depends-on:** none
- **Status:** todo

## G7 — Character combat feel
- **PR title:** `feat(core,shell): animation state machine & melee/combat feel`
- **Closes:** #41, #42, #43, #44, #45, #46, #47, #48, #101, #102
- **Target packages/layer:** `core` (animation SM contract, dash/stamina, stagger/buildup meters, defensive window, attack tags, combo model, hit-reaction) + `shell` (telegraph decal render, hitstop freeze-frame, typed damage-number styling).
- **Scope:** Land **#41 first** — the animation state machine with tagged windup/active/recovery/cancel frame ranges that combat and defense subscribe to; it is the root blocker under parry windows, combo cancels, and telegraphs. Then: dash/dodge = directional burst + i-frame window + stamina/cooldown cost (#42); an entity-agnostic `staggerMeter` (fills from hits, decays, threshold-break → riposte/deathblow) (#43); a `defensiveWindow` (parry/block) evaluated against the attacker's active frames (#44); attack-metadata tags (unblockable/thrust/sweep/grab) that defense logic reads (#45); a `buildupMeter` (bleed/frost/rot accumulate → timed status at threshold → decay) (#46); a `hitReaction` layer (freeze-frame + knockback impulse, pairs with G2's shake channel) (#47); a combo-string model (ordered attacks with stance-conditioned cancel points) over the animation SM (#48); a telegraph render (ring/cone/decal) with windup→activation timing bound to an effect (#101); and hit-type metadata on float-text → crit/element color+scale (#102). Meters reuse the G6 accumulator base.
- **Depends-on:** none (soft: G2 #28 shake for #47)
- **Status:** todo

## G8 — AI: director, behavior & crowds
- **PR title:** `feat(core): spawn director, threat/patrol, jobs & crowd flow`
- **Closes:** #49, #50, #53, #54
- **Target packages/layer:** `core` (all — renderer-free AI over the navmesh from G1).
- **Scope:** A `spawnDirector` that budgets spawns, biases toward players, and escalates on alert or over sim-time (using the existing simClock), with per-wave manifests (#49). A threat table (accumulate/decay aggro per source) + patrol/waypoint following on top of `wander` (#50). A `job`/task-queue component NPCs pull from — path to station → run loop → report — assignable by players (#53). And a crowd steering/flow field with congestion + "route to a chosen POI" selection over the navmesh (#54).
- **Depends-on:** G1 (routing/patrol/jobs/crowd use navmesh + pathfinding)
- **Status:** todo

## G9 — Crafting, tech & production
- **PR title:** `feat(core): crafting graph, tech tree, production buildings & farming`
- **Closes:** #71, #72, #74, #75
- **Target packages/layer:** `core` (recipe graph, tech-tree nodes, production-building component, `cropTile` machine).
- **Scope:** A recipe graph node — inputs + optional required-workstation-in-range + time → output (#71). A tech-tree node with prerequisites that can carry a recipe payload, generalizing flat unlocks (#72). A `productionBuilding({ inputs, outputs, rate })` component + optional item-transport-along-path (conveyor/power) (#74). And a `cropTile` state machine (soil state + stage advance on simClock day tick) with `applyToolToTiles(pattern)` under the cursor (#75).
- **Depends-on:** none
- **Status:** todo

## G10 — Item & gear systems
- **PR title:** `feat(core): durability, affix roller, modular items & storage tiers`
- **Closes:** #73, #76, #77, #100
- **Target packages/layer:** `core` (durability on item instances, affix roller, `modularItem`, storage-tier flag + delayed-delivery hook).
- **Scope:** Per-instance durability (decrement on use/hit, disable at 0, repair for material cost at a station) (#73). An affix-roller: `base × rarity → { rolled affixes, computed stats, name }` for procgen weapons (#76). A `modularItem` (category-constrained mount slots, `computeEffectiveStats()` rolling up installed parts) for guns/mechs (#77). And a storage-tier flag (`carried` vs `banked`) on inventory containers + a delayed-delivery (insurance) hook + a consolation-loadout grant on death (#100) — the inventory half of the extraction economy that G17's #99 builds on.
- **Depends-on:** none
- **Status:** todo

## G11 — Survival & environment
- **PR title:** `feat(core,shell): decay meters, environment fields, weather hooks & realm composition`
- **Closes:** #78, #90, #91, #92, #125
- **Target packages/layer:** `core` (decay meters, sampleable env fields, weather→gameplay modifiers, multi-region health, realm-composition) + `shell` (weather render hooks, fire-spread visuals).
- **Scope:** Named `decayMeter`s (configurable rate, consumable/action refills) + a stacking status-effect "moodle" display distinct from numeric bars (#90). Sampleable environment fields — light-exposure/temperature/wetness/ambient-light at a world position — that meters and spawns read (#91). Weather → gameplay modifiers (movement grip/visibility/structure damage) + a coarse fire-spread propagation across terrain (#92). A multi-region health component (per-part pools) + a stacking ailment queue with per-injury treatment items (#78) — re-homed here from item/gear because its shape is survival-medical and shares the status-stack UI with #90. And a runtime realm-composition primitive (assemble an instance from modifier cards overriding environment params + spawn tables) (#125) — re-homed here from the meta grab-bag because it recomposes environment and hard-depends on the weather hooks in this same group.
- **Depends-on:** none (internal: #125 ← #92)
- **Status:** todo

## G12 — Map, HUD & ping
- **PR title:** `feat(core,shell,react): minimap, world map, fog-of-war & ping`
- **Closes:** #93, #94
- **Target packages/layer:** `core` (fog/marker state, ping classify + broadcast) + `shell` (top-down map render) + `react` (minimap/compass component).
- **Scope:** A top-down map render of world features + entity/objective markers, with reveal-on-event fog (dig/walk) and a compass (#93). A ping verb: camera/aim ray → hit classification → broadcast to party → world-space marker + minimap icon (+ optional callout) (#94).
- **Depends-on:** G1 (ping uses the pointer/aim ray); consumes G12's own map render
- **Status:** todo

## G13 — Vehicles, mounts & racing
- **PR title:** `feat(core,shell): vehicle controller, mounts, crash damage & race state`
- **Closes:** #80, #83, #86, #87
- **Target packages/layer:** `core` (`vehicleBody`, axis-input channel, mount/rideable controller, `damageZones`, `raceTrack`/`raceState`) + `shell` (vehicle + boat render, checkpoint volumes).
- **Scope:** A `vehicleBody` (chassis + wheel colliders: suspension raycast + spring-damper + tire-grip curve sampling surface friction) + an `axisInput { throttle, brake, steer, handbrake }` channel (#80). A mount/rideable controller (attach camera + input to a driven entity with its own movement kit), including a buoyant boat variant over the existing water surface (#83). `damageZones[]` per body mapping accumulated contact-impulse → discrete stage (visual/collider swap + optional part-detach debris) + a disabled state — **coarse stages, not soft-body** (#86). A `raceTrack` (checkpoint volumes + lap count) + `raceState` emitting checkpoint.hit/lap.completed/position.changed/race.finished with a pluggable win condition and reset-to-last-checkpoint (#87).
- **Depends-on:** G3 (joints for suspension, collision→event for crash damage), G2 (#27 chase camera)
- **Status:** todo

## G14 — Traversal & destruction
- **PR title:** `feat(core,shell): grapple/glide traversal & destructible terrain/structures`
- **Closes:** #84, #88, #89
- **Target packages/layer:** `core` (grapple/rope constraint, glide, voxel carve/deposit + terrain write-back, structural integrity graph) + `shell` (debris/crater render).
- **Scope:** A traversal component: fired anchor + rope/pull constraint (grapple/zipline) and a reduced-gravity + forward-thrust glide, on the G3 joint API (#84). A runtime voxel carve/deposit op + terrain-field write-back (crater), triggerable from a tool/effect (#88) — shares the terrain write-back mechanism with G5's #38 terraform brush. A structural graph (`integrity`, `connectedTo[]`) that severs edges on damage and hands disconnected subgraphs to the rigid-body debris system, **replicating the collapse event, not every fragment** (#89).
- **Depends-on:** G3 (joint API + debris body sink); shares terrain write-back infra with G5 (#38)
- **Status:** todo

## G15 — Turn-based & tactics stack
- **PR title:** `feat(core): turn loop, action economy, tactical grid & surfaces`
- **Closes:** #55, #56, #57, #58, #59, #60
- **Target packages/layer:** `core` (all — turn/phase machine, per-turn pools, tile grid, predictive query, snapshot/restore, surface layer).
- **Scope:** A `turnLoop` with configurable phases, a per-turn resettable resource, and three commit modes — immediate, simultaneous-hidden-reveal, rewind-then-commit (#55). Configurable per-turn action-economy pools (Action/Bonus/Movement/Reaction, reset on turn-enter) on the turn loop (#56). A `tacticalGrid` (tile occupancy, flood-fill reachable tiles, discrete push/knockback-to-tile with chained collisions) (#57). A predictive "would-this-effect-hit" query over the existing AoE/LoS math, rendered as an overlay before commit (#58). A cheap sim snapshot/restore for turn undo, callable multiple times per turn (#59). And a stateful `surface` tile/volume layer with its own tick and combination matrix (grease+fire, water+lightning) (#60).
- **Depends-on:** none
- **Status:** todo

## G16 — Card & board stack
- **PR title:** `feat(core,react): card piles, board zones, modifier pipeline & drag layer`
- **Closes:** #61, #62, #63, #64, #65, #66
- **Target packages/layer:** `core` (`cardPile`, `laneBoard`, `modifierPipeline`, `timelineBoard`, `shapedGrid` + adjacency) + `react` (2-D drag/rotate/drop/snap gesture layer).
- **Scope:** A `cardPile` primitive (named ordered zones with `shuffle(seed)`/`draw(n)`/`discard(ids)`, hand limits, exhaust) beside inventory, not replacing it (#61). A `laneBoard` (N zones, per-side aggregate + per-lane rule modifiers) (#62). A `modifierPipeline` — ordered `{ source, apply(value) → value }` with a replay/trace for inspectable scoring (#63). A `timelineBoard` (N slots, each an independent cooldown, resolving on expiry) for auto-battlers (#64). A `shapedGrid` inventory variant (polyomino footprint, rotate, overlap-check) + a `gridAdjacencyQuery` feeding effects (#65). And a UI drag/rotate/drop/snap gesture layer over the card/grid primitives (#66).
- **Depends-on:** none
- **Status:** todo

## G17 — Objective, mode & session machines
- **PR title:** `feat(core,sql): objective channels, round/session state & persistence scopes`
- **Closes:** #95, #96, #97, #98, #99, #110
- **Target packages/layer:** `core` (contested channel, `roundState`, `downedState`, ring zone, extraction session) + `sql`/`ws` seam for the run-vs-meta persistence split (#110).
- **Scope:** A `contestedChannel` (progress + interrupt-on-damage + per-team-favorability rate) emitting start/tick/complete/interrupt — the plant/defuse/cash-out/extract pattern (#95). A `roundState` machine (phase buy|live|end, timer, onPhaseEnd hooks, win/loss-bonus) (#96). A 3-state `downedState` (alive → downed/bleedout, ally-interactable → dead) + optional banner/beacon respawn (#97). A `{ center, radius(t), damageOutside }` shrinking zone driven by simClock (#98). An extraction zone + hold-to-leave (reusing #95's contested channel) + a raid-scoped session that banks or drops carried items on exit (#99) — consumes G10's carried/banked storage tier. And a dual-scope persistence layer (run-scoped vs account/meta) with explicit reset boundaries + server-scenario reset (#110).
- **Depends-on:** G10 (#99 needs the #100 carried/banked tier)
- **Status:** todo

## G18 — Audio & voice
- **PR title:** `feat(shell,ws,core): positional audio, voice chat & beat clock`
- **Closes:** #103, #112, #113
- **Target packages/layer:** `shell` (positional emitters + listener falloff via Web Audio) + `ws` (voice channel layer on the transport) + `core` (`beatClock` signal).
- **Scope:** Land **#112 first** — positional audio emitters + listener falloff (minimum viable for footstep/gunshot cueing) plus music/SFX buses; there is no audio subsystem today (#112). A `voiceChannel` layer on the multiplayer transport — per-entity distance falloff + opt-in non-positional channels (walkie/crew) running simultaneously (#103). A `beatClock` emitting ticks at a BPM + an input buffer that executes a buffered action on the next tick (#113). Voice transport capture stays a thin coarse layer — the engine ships the channel/falloff model, not a full WebRTC stack.
- **Depends-on:** none (internal: #103/#113 ← #112)
- **Status:** todo

## G19 — Multiplayer depth
- **PR title:** `feat(core,ws,node): netcode depth — rewind, hidden-commit, snapshots, seats, shared wallet, matchmaking`
- **Closes:** #104, #105, #106, #107, #108, #109
- **Target packages/layer:** `core`/`ws` (position history + rewind, `simultaneousCommit`, snapshot replay, seat/station claim, shared wallet scope, session discovery) + `node` host support.
- **Scope:** Server retains an N-tick position history per entity; hitscan resolves against `history(now − RTT/2 − interpDelay)` — coarse lag-compensated hit reg (#104). A `simultaneousCommit` network primitive (submit sealed action → server unlocks on all-ready → reveal + deterministic resolve) (#105). A serialize-board+stats → replay-vs-live-opponent snapshot primitive distinct from live-sync adapters (#106). A seat/station claim system where each player controls a facet (steer/sails/cannon) of one shared networked vehicle (#107). A shared/group wallet scope alongside per-user economy (#108). And a session-discovery/matchmaking layer (browse/filter/join-by-code) above the transport (#109).
- **Depends-on:** G13 (#107 multi-seat rides on the vehicle controller)
- **Status:** todo

## G20 — Interaction verbs & minigames
- **PR title:** `feat(core,react): skill-checks, capture/tame & dialogue rolls`
- **Closes:** #114, #118, #122
- **Target packages/layer:** `core` (`skillCheck`/QTE sequencer, capture-check + owned roster, dialogue skill-check gate) + `react` (minigame UI).
- **Scope:** A `skillCheck` (moving target zone + time window → success/fail) and a QTE sequencer, usable from `item.use` handlers — casting/reeling, production minigames, active-reload (#114). A capture-check (hp% + item stat → probability) that re-parents a wild entity into an owned, persisted, optionally-equippable roster (#118). And a skill-check gate on a dialogue choice (roll vs DC + advantage/disadvantage) selecting the success/failure branch, extending the existing dialogue tree (#122). Grouped as "timed/rolled interaction gates" — the coherent slice split out of the original meta grab-bag.
- **Depends-on:** none
- **Status:** todo

## G21 — Sensors, vision & observer tools
- **PR title:** `feat(core,shell): reveal vision, sensor probes, view-frustum sensor & spectator cam`
- **Closes:** #115, #116, #117, #120
- **Target packages/layer:** `core` (occlusion-ignoring tagged query, hidden-state probe, view-frustum sensor, recording buffer) + `shell` (screen-space reveal effect, detached observer camera).
- **Scope:** An occlusion-ignoring tagged-entity radius query + a toggleable screen-space reveal effect (Dark Sight) (#115). A sensor verb: probe a hidden zone/entity state variable in range → surface a reading (EMF/thermometer) (#116). A view-frustum sensor on a held camera object (entities-in-view + dwell time + framing) (#117). And a detached observer-camera mode (bind to any entity/point, no control) + a session-recording buffer for replay/photo/kill-cam (#120). Coherent "query hidden/tagged/framed world state and surface it" family; #117/#120 build on the G2 camera system.
- **Depends-on:** G2 (#117/#120 use the camera rig system)
- **Status:** todo

## G22 — Player embodiment & expression
- **PR title:** `feat(core,shell,react): possession, shapeshift & cosmetics/emotes`
- **Closes:** #121, #123, #124
- **Target packages/layer:** `core` (cosmetic loadout, possession model, `form` component) + `shell` (camera/input rebind on swap) + `react` (emote broadcast).
- **Scope:** A per-player cosmetic loadout + an emote broadcast to nearby players over the existing presence layer (#121). A possession model (player controls one of N owned entities, switch active control) distinct from the social party — rebinds input + camera on swap (#123). A `form` component bundling movement params + ability set + mesh, swappable for a duration (shapeshift) (#124). Coherent "what the player embodies and how they express it" family; #123/#124 rebind through the G2 camera.
- **Depends-on:** G2 (#123/#124 rebind the active camera on control/form swap)
- **Status:** todo

---

## WON'T-DO / non-goals (build the coarse version)

- **Soft-body deformation (BeamNG-style)** — *coarse version only.* #79 joints are spring/hinge/distance/fixed constraints, **not** per-beam soft-body meshes. #86 vehicle damage is discrete `damageZones` stages + part-detach, **not** continuous mesh crumple. The issue bodies themselves flag full soft-body as a non-goal.
- **Full destruction fragment replication** — #89 replicates the collapse *event* and hands subgraphs to the debris sim; it does **not** network-replicate every fragment.
- **Volumetric fluid simulation** — #92 fire-spread is a coarse cellular/terrain propagation, not a fluid solver. No standalone fluid-sim issue exists; keep any fire/water spread grid-based.
- **Full WebRTC voice stack** — #103 ships the channel-scope + distance-falloff model and hooks on the transport; actual capture/transport stays a thin coarse layer, not a from-scratch media server.
- **Perfect netcode** — #104 lag comp is a pragmatic N-tick history + rewind against `now − RTT/2 − interpDelay`, not full rollback netcode.

No issues found to be true duplicates or already-solved. Notable kinships kept as distinct issues (documented in-scope, not merged): #45 attack-type *defense* tags vs #69 attack-tag *resistance* matrix; #40 ult-meter (grows) vs #119 streak-meter (resets) vs #43 stagger vs #46 buildup — all four sit on one shared accumulator-meter primitive (build once, land with the earlier of G6/G7). #38 terraform write-back and #88 voxel/terrain carve share the terrain-field write-back mechanism across G5/G14.

## Re-homed from the starting hypothesis
- **#78** (per-body-part health): hypothesis G10 (item & gear) → **G11 (survival & environment)**. Its shape is a multi-region health + stacking ailment/treatment queue (survival-medical), sharing the moodle status-stack with #90; not an item primitive.
- **#125** (runtime realm recomposition): hypothesis G20 (meta) → **G11 (survival & environment)**. It recomposes environment params + spawn tables and hard-depends on the weather hooks (#92) in that group.
- **Split of the hypothesis G20** (11 issues, #114–118, #120–125) into three coherent system groups — **G20 Interaction verbs & minigames** (#114, #118, #122), **G21 Sensors, vision & observer tools** (#115, #116, #117, #120), **G22 Player embodiment & expression** (#121, #123, #124) — to avoid one monster PR spanning unrelated systems. (#125 pulled out to G11 as above.)

All other issues follow the starting hypothesis. #99/#100 kept in separate groups (G17 session / G10 inventory tier) with an explicit G17→G10 dependency rather than merged.

coverage check: 104 issues assigned across 22 groups (must equal 104)
