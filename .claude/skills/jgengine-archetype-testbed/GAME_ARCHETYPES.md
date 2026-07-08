# Game Archetype Catalog

A living document. Append new archetypes at the bottom. Update pain points when gaps close. Remove nothing — strike through resolved items.

> **Engine drift (2026-07-08):** entries predate the 0.7.0 surface. 0.7.0 shipped the eight-rig camera library (`rts` free pan, `topDown`/iso, `observer`, cinematic keyframes), `nav/navGrid` A* + `pointer` move/select commands, `world/placementController` grid placement + ghost renderers, `turn/*` + `tactics/*`, `economy/techTree`, `physics/vehicleBody`, `world/weather` + fire grid, and `@jgengine/react` `dragLayer`. Resolved rows are struck in the summary table; per-entry strikethroughs happen as each archetype is re-audited.

---

## Flappy Bird
**Family:** impulse-scroller / arcade
**Mechanical fingerprint:** One-button impulse against gravity, infinite horizontal scroll, collision = death, score = distance/pipes passed.
**Subsystems:**
- Camera: side-scrolling follow (2D), no pan/zoom/rotate
- Input: single tap/click = impulse; no keyboard needed
- Movement: physics impulse + gravity; no WASD
- Core loop: real-time tick; procedural obstacle generation; score increment
- World: 2D parallax background layers; procedural pipe gaps
- Entities: player (1), pipes (procedural), ground (static)
- Economy: none
- Progression: high score only
- UI: score counter, death screen, medal badges
- Multiplayer: leaderboards only
- Save/load: high score persist

**Pain points:**
- `blocked` `shell` — Shell hardcodes orbit/first-person camera; no side-scrolling 2D follow camera mode
- `blocked` `shell` — No single-tap input action (reserved actions are all keyboard/WASD)
- `blocked` `shell` — FrameDriver monopolizes player motion via WASD; game cannot drive entity position from impulse
- `blocked` `shell` — No parallax background rendering primitive
- `workaround` `core` — Procedural world generation is game-owned, not engine-provided
- `friction` `react` — Score counter is trivial, but death screen + medals need UI primitives

**Workarounds:**
- Use `WorldOverlay` for parallax layers (game-drawn, not engine)
- Fork camera to side-scroll (requires shell change)

**Engine gaps filed:** *not yet filed*

---

## Learn to Fly
**Family:** launch / upgrade
**Mechanical fingerprint:** Angle launch, physics glide/fall, distance = score, upgrade shop between runs, multiple stages (ground, air, space).
**Subsystems:**
- Camera: follow projectile/vehicle from side; zoom out as altitude increases
- Input: angle selection (hold/drag), launch trigger (click), mid-air boosts (click/tap)
- Movement: physics-driven launch trajectory; boost impulse
- Core loop: launch → glide → crash → upgrade → repeat; stage transitions
- World: 2D ground profile + sky + space; distance markers; obstacles
- Entities: player vehicle (1), obstacles, power-ups
- Economy: cash from distance/height; shop currency
- Progression: upgrade tree (glider, rocket, fuel, ramp)
- UI: launch gauge, speed/altitude HUD, shop screen, upgrade tree
- Multiplayer: leaderboards
- Save/load: upgrade persist + best distances

**Pain points:**
- `blocked` `shell` — No side-scrolling follow camera
- `blocked` `shell` — No angle-drag input primitive (drag-to-aim)
- `blocked` `shell` — WASD movement monopoly; launch trajectory must override shell motion
- `blocked` `core` — No upgrade tree primitive (game must hand-roll)
- `workaround` `core` — Economy is `ctx.game.economy`; shop is game-owned
- `friction` `shell` — No zoom-by-altitude camera behavior

**Workarounds:**
- Use `object.place` for ground profile segments
- Use `entity.setPose` for vehicle if shell movement is bypassed

**Engine gaps filed:** *not yet filed*

---

## Bloons Tower Defense
**Family:** tower defense / lane
**Mechanical fingerprint:** Fixed map with enemy lanes, tower placement on grid, wave-based spawning, tower upgrades, lives = leak count.
**Subsystems:**
- Camera: top-down or isometric; pan and zoom freely; no follow target
- Input: click-to-place tower, click-to-upgrade, click-to-start wave, drag-to-pan map
- Movement: enemy path following (spline/waypoint); no player entity
- Core loop: real-time tick; wave timer; enemy spawn → path → exit; tower AI auto-attack
- World: fixed map with path lanes, placeable zones, obstacles
- Entities: many (20–100 enemies per wave, 10–30 towers), projectiles
- Economy: cash per pop; tower buy/upgrade/sell costs
- Progression: tower upgrade branches; unlock new tower types
- UI: tower shop, upgrade panel, wave progress, lives counter, speed controls
- Multiplayer: co-op (shared map, split money) or vs (send enemies)
- Save/load: map progress, unlocked towers

**Pain points:**
- `blocked` `shell` — `enablePan={false}`; drag-to-pan is disabled
- `blocked` `shell` — No click-to-place object primitive (objects placed via command, not pointer)
- `blocked` `shell` — No grid-snap placement rule exposed to game code
- `blocked` `core` — No pathfinding / waypoint path following primitive
- `blocked` `core` — No tower AI primitive (auto-target nearest, strongest, first, last)
- `blocked` `shell` — No isometric camera mode
- `workaround` `shell` — Top-down orbit with `maxPolarAngle` near 0 approximates TD view, but pan is still disabled
- `workaround` `core` — Enemy movement is game-owned waypoint interpolation
- `friction` `react` — Tower shop + upgrade panel need drag-and-drop or radial menu primitives

**Workarounds:**
- Use `PlayableGame.environment` for fixed map mesh
- Use `object.place` for towers if placement can be command-driven

**Engine gaps filed:** *not yet filed*

---

## Fallout Shelter
**Family:** base builder / resource manager / life-sim
**Mechanical fingerprint:** Vault rooms as grid cells, dweller assignment, resource triad (power/water/food), rush mechanic, exploration, breeding.
**Subsystems:**
- Camera: top-down or isometric; drag-pan; zoom; no follow target
- Input: tap/click room, drag dweller to room, tap rush, tap explore
- Movement: dwellers walk between rooms; no physics; grid-based
- Core loop: real-time tick (offline progress); resource consumption/production; incident rolls
- World: interior grid (rooms as cells); no exterior
- Entities: dwellers (many, persistent), explorers, incidents (raiders, fire)
- Economy: caps, lunchboxes, crafting materials
- Progression: dweller SPECIAL stats, level, equipment, room upgrades
- UI: room info panel, dweller list, explore screen, crafting, shop
- Multiplayer: none (single-player)
- Save/load: full vault state persist

**Pain points:**
- `blocked` `shell` — `enablePan={false}`; drag-pan essential for vault navigation
- `blocked` `shell` — No isometric or top-down camera with free pan
- `blocked` `core` — No interior grid primitive (rooms, doors, corridors as first-class objects)
- `blocked` `core` — No resource production/consumption cycle primitive
- `blocked` `core` — No offline-progress / idle tick primitive
- `blocked` `shell` — No tap-to-select entity without targeting system
- `workaround` `core` — Dweller stats are `scene.entity.stats`; SPECIAL is 7 stats game-defined
- `workaround` `core` — Incidents are events + spawned enemy entities
- `friction` `react` — Room assignment UI needs drag-and-drop; no drag primitive in `@jgengine/react`

**Workarounds:**
- Use `PlayableGame.environment` for vault floor mesh
- Use `object.place` for room furniture

**Engine gaps filed:** *not yet filed*

---

## Super Mario Bros
**Family:** side-scrolling platformer
**Mechanical fingerprint:** Run, jump, stomp enemies, power-ups, flagpole finish, lives system, secret blocks.
**Subsystems:**
- Camera: 2D side-scrolling follow; slight lookahead
- Input: run (hold), jump (tap), crouch (down)
- Movement: physics with gravity, jump arc, variable jump height, friction
- Core loop: level-based; real-time tick; checkpoint respawn
- World: tilemap (blocks, pipes, platforms); scrolling chunk loading
- Entities: player, enemies (Goomba, Koopa), power-ups, projectiles (fireball)
- Economy: coins → life; power-ups (mushroom, flower, star)
- Progression: world/level select; lives; score
- UI: score, coins, lives, world indicator, timer
- Multiplayer: turn-based alternating (classic) or simultaneous co-op
- Save/load: progress through worlds

**Pain points:**
- `blocked` `shell` — No 2D side-scrolling camera; shell is 3D orbit/first-person only
- `blocked` `shell` — No tilemap world feature renderer (exists in core as `tilemap()`, no shell renderer)
- `blocked` `shell` — No 2D sprite rendering batch (entities are 3D meshes or billboards)
- `blocked` `core` — No power-up state machine primitive (game must hand-roll)
- `workaround` `core` — Tilemap can be built from `object.place` with grid positions (inefficient)
- `friction` `shell` — Jump physics must override shell's character controller

**Workarounds:**
- Use `WorldOverlay` for 2D canvas rendering of sprites
- Use `entityModels` with flat sprites if 2.5D acceptable

**Engine gaps filed:** *not yet filed*

---

## Tetris
**Family:** puzzle / falling blocks
**Mechanical fingerprint:** 10×20 grid, 7 tetrominoes, rotation, line clear, level speed ramp, ghost piece, hold piece, next queue.
**Subsystems:**
- Camera: fixed orthographic top-down; no follow, no zoom
- Input: rotate (up/click), hard drop (space), soft drop (down), hold (C), move left/right
- Movement: tetromino descent (timer-driven); no physics
- Core loop: real-time tick with level-scaled drop speed; line clear → cascade → score
- World: 10×20 grid; no exterior
- Entities: active piece, ghost piece, locked blocks, line clear particles
- Economy: none
- Progression: level speed ramp; score; marathon vs sprint modes
- UI: board, next queue, hold piece, score, level, controls help
- Multiplayer: vs battle (garbage lines), co-op
- Save/load: high score

**Pain points:**
- `blocked` `shell` — No orthographic 2D fixed camera; shell is 3D perspective only
- `blocked` `shell` — No 2D grid rendering primitive
- `blocked` `core` — No puzzle-state primitive (grid occupancy, line clear, cascade)
- `blocked` `shell` — Input is action-mapped to commands, but Tetris needs frame-perfect DAS/ARR input timing
- `workaround` `core` — Grid is pure game state; no engine help needed except rendering
- `friction` `shell` — Rendering the board requires custom `WorldOverlay` or `GameUI` canvas

**Workarounds:**
- Build entirely in `GameUI` with HTML/CSS grid (no 3D scene)
- Use `PlayableGame.environment` as blank canvas

**Engine gaps filed:** *not yet filed*

---

## Candy Crush
**Family:** match-3
**Mechanical fingerprint:** Grid of colored pieces, swap adjacent, match 3+ clears, cascade, special pieces (striped, wrapped, color bomb), level objectives.
**Subsystems:**
- Camera: fixed top-down or slight angle; no movement
- Input: click/tap to select, click/tap to swap; drag-to-swap
- Movement: piece swap animation, fall animation, cascade; tweened, not physics
- Core loop: turn-based (player move → cascade → check objective); move limit or time limit
- World: board grid; no exterior
- Entities: pieces (many, transient), blockers, special candy
- Economy: lives (energy system), boosters (pre-level power-ups)
- Progression: level map; star rating per level; new mechanics introduced
- UI: board, objective tracker, moves/timer, score, booster bar, level map
- Multiplayer: async (send lives); leaderboards
- Save/load: level progress, lives timer

**Pain points:**
- `blocked` `shell` — No 2D fixed camera
- `blocked` `core` — No match-state primitive (grid, swap validation, match detection, cascade)
- `blocked` `core` — No energy/lives timer primitive (offline regeneration)
- `blocked` `shell` — No drag-to-swap input gesture
- `workaround` `core` — Grid state is pure game code
- `friction` `react` — Drag gesture needs custom pointer handling outside shell

**Workarounds:**
- Build board entirely in `GameUI` with HTML/CSS
- Use `ctx.time.after` for lives timer

**Engine gaps filed:** *not yet filed*

---

## Angry Birds
**Family:** physics projectile / trajectory
**Mechanical fingerprint:** Drag-to-aim slingshot, physics launch, destructive blocks, pigs, star rating per level.
**Subsystems:**
- Camera: side-scrolling or fixed per level; zoom to show full structure
- Input: drag-back to aim (vector from slingshot), release to launch; tap for special ability
- Movement: physics-driven projectile; rigid body collision; structural collapse
- Core loop: turn-based per bird; destruction scoring; 3-star rating
- World: 2D physics world with blocks, platforms, ground
- Entities: birds (projectiles), pigs (targets), blocks (destructible)
- Economy: none
- Progression: level select; star collection; new bird types
- UI: trajectory preview (dotted line), score, star rating, level select
- Multiplayer: none
- Save/load: level progress, star ratings

**Pain points:**
- `blocked` `shell` — No 2D side-scrolling camera
- `blocked` `shell` — No drag-to-aim input primitive
- `blocked` `core` — No trajectory preview primitive (parabolic path visualization)
- `blocked` `core` — Physics world exists (`PhysicsWorld`) but no 2D rigid-body renderer in shell
- `blocked` `core` — No structural integrity / joint primitive for block stacking
- `workaround` `core` — `PhysicsWorld` can simulate blocks if placed as bodies
- `friction` `shell` — Shell's projectile system is 3D hitscan/ballistic; 2D physics is different

**Workarounds:**
- Use `PhysicsWorld` for block simulation; render via custom `WorldOverlay`
- Use `GameUI` canvas for trajectory preview

**Engine gaps filed:** *not yet filed*

---

## Plants vs Zombies
**Family:** lane defense / tower defense hybrid
**Mechanical fingerprint:** 5 lanes, plants placed on grid, zombies walk left, sun economy, wave-based, plant food, zen garden.
**Subsystems:**
- Camera: fixed side view; no pan/zoom
- Input: click-to-collect sun, click-to-place plant, click-to-use plant food, click shovel
- Movement: zombies walk left at fixed speed; no physics
- Core loop: real-time tick; sun drops; zombie waves; plant cooldowns
- World: 5×9 grid; lawn, pool, roof (stage variations)
- Entities: many plants (persistent until eaten), many zombies, projectiles (peas), sun
- Economy: sun (real-time drops + sunflowers); plant costs
- Progression: unlock plants; level select; survival/endless mode
- UI: seed packet bar, shovel, plant food, sun counter, wave warning
- Multiplayer: vs mode (one side plants, other sends zombies)
- Save/load: unlocked plants, level progress, zen garden

**Pain points:**
- `blocked` `shell` — No fixed 2D side camera
- `blocked` `shell` — No click-to-place on grid primitive
- `blocked` `core` — No lane-based movement primitive
- `blocked` `core` — No real-time resource drop primitive (sun falling)
- `workaround` `core` — Grid can be `object.place` with fixed positions
- `friction` `react` — Seed packet bar needs custom UI; no toolbar primitive

**Workarounds:**
- Use `entity.setPose` for zombie leftward movement (no physics)
- Use `GameUI` for 2D rendering if shell camera is bypassed

**Engine gaps filed:** *not yet filed*

---

## Cookie Clicker
**Family:** idle / clicker / incremental
**Mechanical fingerprint:** Click to produce cookies, buy buildings that auto-produce, upgrade multipliers, prestige system, achievements.
**Subsystems:**
- Camera: static or simple parallax background; no gameplay camera
- Input: click/tap only (no keyboard)
- Movement: none
- Core loop: real-time tick with offline catch-up; exponential growth curve
- World: static background; no entities
- Entities: none (or cursor as decorative)
- Economy: cookies (primary), building counts, upgrade tiers
- Progression: buildings, upgrades, achievements, prestige (soft reset for multiplier)
- UI: big cookie, counter, shop list, upgrade buttons, stats, achievements
- Multiplayer: none
- Save/load: full state persist; offline progress calculation

**Pain points:**
- `blocked` `core` — No offline-catch-up / idle-progress primitive
- `blocked` `core` — No exponential-cost-scaling primitive (game must hand-roll)
- `blocked` `core` — No prestige/soft-reset primitive
- `blocked` `core` — No achievement system primitive
- `workaround` `core` — Economy is `ctx.game.economy` but idle production needs tick loop
- `friction` `react` — Big cookie needs large click target; no specialty UI primitive

**Workarounds:**
- Build entirely in `GameUI` with no 3D scene
- Use `ctx.time.after` for production ticks

**Engine gaps filed:** *not yet filed*

---

## Stardew Valley
**Family:** farming sim / life-sim / RPG
**Mechanical fingerprint:** Grid-based farming, crop growth (time-gated), friendship system, mining (combat + resource), fishing mini-game, festivals, marriage.
**Subsystems:**
- Camera: top-down or slight angle; follow player; interior/exterior transitions
- Input: WASD + tool use (click/hold), inventory drag, dialogue select
- Movement: free 2D/2.5D; no physics; grid-snap for placement
- Core loop: real-time tick (game-day cycle); crop growth; NPC schedules; energy decay
- World: farm grid, town map, mine levels, interiors
- Entities: player, NPCs (many, scheduled), crops, animals, monsters, fish spots
- Economy: gold, resources, crafting materials
- Progression: skills, friendship hearts, community center bundles, tool upgrades
- UI: inventory grid, calendar, friendship panel, crafting, shop, dialogue
- Multiplayer: co-op (shared farm, 4 players)
- Save/load: full farm + player state

**Pain points:**
- `blocked` `shell` — No top-down follow camera (orbit is 3D perspective)
- `blocked` `shell` — No grid-snap placement for objects (farm layout)
- `blocked` `core` — No crop growth / time-gated growth primitive
- `blocked` `core` — No NPC schedule / time-of-day behavior primitive
- `blocked` `core` — No friendship / relationship track primitive
- `blocked` `core` — No fishing mini-game primitive
- `blocked` `core` — No mine level / dungeon generation primitive
- `workaround` `core` — Calendar is `ctx.time.calendar()`; schedules are game-owned
- `friction` `shell` — Inventory drag-and-drop needs custom UI

**Workarounds:**
- Use `PlayableGame.environment` for farm terrain
- Use `object.place` for crops with grid positions

**Engine gaps filed:** *not yet filed*

---

## The Sims
**Family:** life-sim / dollhouse
**Mechanical fingerprint:** Needs (hunger, fun, bladder), skills, jobs, relationships, build mode (free placement), buy mode, genetics, aging.
**Subsystems:**
- Camera: top-down or isometric; free pan; zoom; rotate; follow Sim or free
- Input: click-to-select Sim, click-to-direct, drag furniture, build walls
- Movement: pathfinding to clicked destination; social interactions
- Core loop: real-time tick (paused or 1×–3×); need decay; skill gain; job schedule
- World: lot (interior + exterior); neighborhood map; community lots
- Entities: Sims (many, persistent), pets, visitors, service NPCs
- Economy: Simoleons, bills, job income
- Progression: skills, careers, aspirations, life stages, unlockables
- UI: need bars, skill panel, relationship web, build/buy catalog, CAS
- Multiplayer: none (historically single-player)
- Save/load: full household + neighborhood state

**Pain points:**
- `blocked` `shell` — `enablePan={false}`; free pan essential
- `blocked` `shell` — No isometric camera
- `blocked` `shell` — No click-to-move pathfinding
- `blocked` `core` — No need-decay / motive primitive
- `blocked` `core` — No pathfinding primitive
- `blocked` `core` — No social interaction queue primitive
- `blocked` `core` — No build-mode / free-placement + grid-snap hybrid
- `blocked` `core` — No genetics / inheritance primitive
- `workaround` `core` — Needs are `scene.entity.stats` with decay in `onTick`
- `friction` `react` — Build/buy catalog needs extensive UI; no catalog browser primitive

**Workarounds:**
- Use `entity.setPose` for Sim movement if pathfinding is game-owned
- Use `object.place` for furniture

**Engine gaps filed:** *not yet filed*

---

## Civilization
**Family:** turn-based strategy / 4X
**Mechanical fingerprint:** Hex grid, units with movement points, cities with production queues, tech tree, diplomacy, combat, victory conditions.
**Subsystems:**
- Camera: top-down strategic; pan and zoom freely; no follow target
- Input: click-to-select unit/city, click-to-move, click-to-build, click menu items
- Movement: turn-based grid movement; movement points; terrain cost
- Core loop: turn-based (player turn → AI turn); action points or one-move-per-unit
- World: hex tilemap with terrain, resources, improvements, districts
- Entities: units (many), cities, barbarians, great people
- Economy: food, production, gold, science, culture, faith, strategic resources
- Progression: tech tree, civics tree, eras, policies, government, wonders
- UI: world map, city screen, tech tree, diplomacy screen, unit panel, minimap
- Multiplayer: simultaneous turns or sequential; async PBEM
- Save/load: full world state; many saves per game

**Pain points:**
- `blocked` `shell` — `enablePan={false}`; strategic pan essential
- `blocked` `shell` — No hex grid rendering
- `blocked` `shell` — No top-down orthographic camera
- `blocked` `core` — No turn-based action system primitive
- `blocked` `core` — No tech tree primitive
- `blocked` `core` — No diplomacy / trade agreement primitive
- `blocked` `core` — No fog-of-war primitive
- `blocked` `core` — No city production queue primitive
- `workaround` `core` — Tilemap is `tilemap()` in core but no hex variant
- `friction` `shell` — AI turn processing needs headless tick; shell assumes real-time

**Workarounds:**
- Use `tilemap()` for square tiles; hex is game-owned
- Use `GameUI` for all UI (no 3D scene needed)

**Engine gaps filed:** *not yet filed*

---

## XCOM
**Family:** tactical turn-based / squad tactics
**Mechanical fingerprint:** Squad of soldiers, grid-based movement (2 action points), cover system, line of sight, overwatch, pod activation, permadeath.
**Subsystems:**
- Camera: isometric or top-down; free rotate/pan; cinematic shots on kills
- Input: click-to-select soldier, click-to-move, click-to-aim, click ability
- Movement: grid-based with action points; cover bonuses; flanking
- Core loop: turn-based (squad turn → alien turn); concealment → pod activation
- World: tactical map with cover objects, elevation, destructible terrain
- Entities: soldiers (persistent, named), aliens, civilians, interactive objects
- Economy: materials, intel, supply, soldier equipment
- Progression: soldier classes, abilities, ranks, weapon upgrades, base facilities
- UI: action bar, ability tooltips, shot probability, inventory, base management
- Multiplayer: 1v1 squad battle
- Save/load: mission state, campaign state, ironman mode

**Pain points:**
- `blocked` `shell` — `enablePan={false}`; tactical pan essential
- `blocked` `shell` — No isometric camera
- `blocked` `core` — No turn-based action point system primitive
- `blocked` `core` — No cover / line-of-sight primitive
- `blocked` `core` — No overwatch / reaction fire primitive
- `blocked` `core` — No pod AI / concealment primitive
- `blocked` `core` — No destructible terrain primitive
- `workaround` `core` — Grid can be `object.place` with collision flags
- `friction` `shell` — Cinematic camera on kills needs cutscene support

**Workarounds:**
- Use `entity.setPose` for grid movement
- Use `object.remove` for destructible cover

**Engine gaps filed:** *not yet filed*

---

## Dark Souls
**Family:** action RPG / soulslike
**Mechanical fingerprint:** Stamina-based combat, dodge roll, parry, bonfire checkpoints, corpse run, leveling at bonfire, interconnected world, boss fights.
**Subsystems:**
- Camera: third-person orbit (close, over-shoulder); lock-on target; free look
- Input: light attack, heavy attack, block, dodge roll, parry, use item, interact
- Movement: physics-based; dodge roll iframe; fall damage; ledge hang
- Core loop: real-time tick; bonfire rest respawns enemies; death = soul loss + corpse run
- World: interconnected 3D world; shortcuts; elevators; hidden walls
- Entities: player, enemies (many types), bosses, NPCs, phantoms (multiplayer)
- Economy: souls (XP + currency), items, equipment upgrades
- Progression: stats, weapon scaling, upgrade materials, spells
- UI: health/stamina bar, estus flask, equipment load, souls counter, messages
- Multiplayer: invasions, co-op summons, bloodstains, messages
- Save/load: checkpoint at bonfire; death is a mechanic

**Pain points:**
- `workaround` `shell` — Third-person orbit exists; needs tuning for close over-shoulder
- `blocked` `shell` — No camera lock-on primitive (orbit is free, not target-locked)
- `blocked` `shell` — No dodge roll / iframe primitive
- `blocked` `shell` — No stamina system primitive
- `blocked` `core` — No bonfire checkpoint / respawn primitive
- `blocked` `core` — No corpse run / soul recovery primitive
- `blocked` `core` — No invasion / summon multiplayer primitive
- `blocked` `core` — No weapon upgrade / scaling primitive
- `workaround` `core` — Health/stamina are `scene.entity.stats`
- `friction` `shell` — Over-shoulder camera needs `targetOffset` and `minDistance` tuning

**Workarounds:**
- Use `tabTarget` for lock-on approximation; shell does not retarget camera
- Use `entity.effect` for damage/heal

**Engine gaps filed:** *not yet filed*

---

## Fortnite
**Family:** battle royale / shooter
**Mechanical fingerprint:** 100 players, parachute drop, loot scavenging, building (walls/floors/stairs), storm circle, last player/team standing.
**Subsystems:**
- Camera: third-person orbit and first-person ADS; free look
- Input: WASD, mouse look, shoot, build mode toggle, build piece select, edit, interact, inventory
- Movement: physics; sprint, crouch, jump, mantle, slide; parachute descent
- Core loop: real-time tick; storm shrink timer; elimination; respawn in team modes
- World: large procedural/composited map; loot spawns; vehicles
- Entities: 100 players, NPCs, vehicles, projectiles, build pieces
- Economy: materials (wood/stone/metal), ammo, healing items, weapons
- Progression: battle pass (cosmetic), seasonal events
- UI: health/shield, material count, minimap, storm timer, inventory, build grid
- Multiplayer: 100-player shared world; squad voice; spectator
- Save/load: none (per-match)

**Pain points:**
- `workaround` `shell` — Third-person + first-person exist; ADS is `movement.aim`
- `blocked` `shell` — No build-mode toggle (free placement of build pieces)
- `blocked` `core` — No building piece primitive (wall/floor/stair/roof with material cost)
- `blocked` `core` — No edit-mode primitive (modifying placed build piece shape)
- `blocked` `core` — No storm circle / zone shrink primitive
- `blocked` `core` — No parachute / glider descent primitive
- `blocked` `core` — No vehicle primitive
- `blocked` `core` — No 100-player scale networking primitive
- `workaround` `core` — Loot is `ctx.game.loot` with ground spawns
- `friction` `shell` — Building placement needs real-time grid-snap; shell has no build mode

**Workarounds:**
- Use `object.place` for build pieces if placement is command-driven
- Use `entityModels` for player characters

**Engine gaps filed:** *not yet filed*

---

## Minecraft
**Family:** voxel sandbox / survival
**Mechanical fingerprint:** Block world (place/destroy), crafting grid, survival needs (hunger, health), day/night cycle, mining tiers, biomes, redstone, portals.
**Subsystems:**
- Camera: first-person or third-person orbit; free look
- Input: WASD, mouse look, left-click destroy, right-click place, middle-click pick, inventory
- Movement: physics; jump, sprint, swim, fly (creative), elytra glide
- Core loop: real-time tick; block updates; mob spawning; hunger decay; day/night
- World: infinite procedural voxel world; chunks; biomes; caves; structures
- Entities: player, mobs (hostile/passive), items, projectiles, minecarts, boats
- Economy: none (barter in survival; no currency)
- Progression: crafting recipes, enchantments, potions, end-game (Nether, End)
- UI: inventory grid (crafting), furnace, chests, health/hunger/xp bar, debug screen
- Multiplayer: shared world (persistent server); PvP optional
- Save/load: full chunk persist; creative vs survival mode

**Pain points:**
- `workaround` `shell` — First/third-person exists
- `blocked` `core` — `voxel()` exists but no infinite streaming chunk system
- `blocked` `core` — No block update / neighbor-update primitive (redstone, water flow)
- `blocked` `core` — No crafting recipe / grid primitive
- `blocked` `core` — No hunger / survival need primitive
- `blocked` `core` — No enchantment / anvil primitive
- `blocked` `core` — No portal / dimension primitive
- `workaround` `core` — Day/night is `ctx.time`
- `friction` `shell` — Block placement needs raycast + block-face detection; shell has no block cursor

**Workarounds:**
- Use `voxel()` for block world; game must own chunk management
- Use `object.place` / `object.remove` for furniture blocks

**Engine gaps filed:** *not yet filed*

---

## Portal
**Family:** first-person puzzle
**Mechanical fingerprint:** Portal gun (two linked portals), physics momentum through portals, companion cube, button puzzles, turret avoidance, GLaDOS narrative.
**Subsystems:**
- Camera: first-person mouse-look; no orbit
- Input: WASD, mouse look, left-click shoot blue portal, right-click shoot orange portal, use (pick up/drop), crouch
- Movement: physics; momentum conservation through portals; fall damage
- Core loop: puzzle chamber sequence; no fail state (respawn at checkpoint)
- World: test chambers with portal-surfaces, non-portal surfaces, hazards, moving platforms
- Entities: player, cubes (physics objects), turrets, cameras, portals (render targets), energy balls
- Economy: none
- Progression: chamber sequence; narrative beats
- UI: reticle (portal gun), checkpoint indicator, dialogue subtitles
- Multiplayer: co-op chambers (2 players, 4 portals)
- Save/load: checkpoint per chamber

**Pain points:**
- `workaround` `shell` — First-person exists; reticle is built-in
- `blocked` `shell` — No portal rendering primitive (render-to-texture or stencil portal)
- `blocked` `shell` — No object carry / physics grab primitive
- `blocked` `core` — No portal teleport / momentum-conservation primitive
- `blocked` `core` — No moving platform / kinematic body primitive
- `blocked` `core` — No puzzle checkpoint / save-state primitive
- `workaround` `core` — `PhysicsWorld` can simulate cubes and energy balls
- `friction` `shell` — Portal surface detection needs raycast + surface normal; shell has no portal gun raycast

**Workarounds:**
- Use `PhysicsWorld` for cube physics
- Use `GameUI` for portal gun reticle if shell reticle is insufficient

**Engine gaps filed:** *not yet filed*

---

## Papers, Please
**Family:** narrative / document inspection
**Mechanical fingerprint:** Document comparison (passport, ID, permit), stamp approve/deny, money management, family needs, branching narrative, time pressure.
**Subsystems:**
- Camera: static desk view; no camera movement
- Input: mouse only (drag documents, click stamps, click inspect)
- Movement: none
- Core loop: day-based; timed work shift; document checks; money at end of day
- World: booth interior; no exterior
- Entities: travelers (queue), documents (per traveler)
- Economy: salary per correct stamp; fines for mistakes; family rent/food/heat bills
- Progression: story branches based on approvals/denials; endings
- UI: document desk, stamp bar, rule book, inspection mode, end-of-day report, family status
- Multiplayer: none
- Save/load: day progress, story state

**Pain points:**
- `blocked` `shell` — No static 2D desk camera
- `blocked` `shell` — No document drag-and-drop primitive
- `blocked` `core` — No document validation / rule-check primitive
- `blocked` `core` — No branching narrative state machine primitive
- `blocked` `core` — No day-timer / work-shift primitive
- `blocked` `core` — No family-needs / household economy primitive
- `workaround` `core` — Economy is `ctx.game.economy`
- `friction` `react` — Entire game can be built in `GameUI` with HTML/CSS; 3D scene is irrelevant

**Workarounds:**
- Build entirely in `GameUI`; disable 3D canvas or use blank `environment`
- Use `ctx.time.after` for day timer

**Engine gaps filed:** *not yet filed*

---

## Vampire Survivors
**Family:** bullet heaven / reverse bullet hell
**Mechanical fingerprint:** Auto-attack nearest enemy, 30-minute survival run, level-up upgrade pick (weapon/evolution), swarm enemies, chests, stage progression.
**Subsystems:**
- Camera: top-down follow; slight zoom; no rotate
- Input: WASD only (movement); attacks are auto/targeted
- Movement: free 2D/2.5D; no physics; dodge roll optional
- Core loop: real-time tick; enemy swarm spawn; XP gem collection; level-up pause-for-pick
- World: arena/field with obstacles; no exterior
- Entities: player (1), enemies (100–1000+ on screen), projectiles (many), XP gems, chests
- Economy: gold (post-run), upgrades (persistent)
- Progression: weapon unlocks, evolution combos, character stats, stage unlocks
- UI: health bar, XP bar, weapon list, level-up picker, timer, kill count, minimap
- Multiplayer: local co-op (2–4 players)
- Save/load: persistent upgrades, unlocked weapons/characters

**Pain points:**
- `blocked` `shell` — No top-down follow camera (orbit is 3D perspective)
- `blocked` `shell` — No auto-attack primitive (game must query `inRadius` every tick)
- `blocked` `core` — No swarm spawn / density curve primitive
- `blocked` `core` — No level-up pause-for-pick primitive (time freeze + modal)
- `blocked` `core` — No weapon evolution / combo primitive
- `blocked` `core` — No 1000-entity optimization primitive (instancing exists but not for entities)
- `workaround` `core` — `inRadius` + `queryArc` can find nearest enemy
- `friction` `shell` — 1000 entities may stress shell's per-entity React components

**Workarounds:**
- Use `entity.setPose` for enemy movement (no physics)
- Use `InstancedBodies` for rendering if enemies are uniform

**Engine gaps filed:** *not yet filed*

---

## Hades
**Family:** roguelike action / isometric
**Mechanical fingerprint:** Isometric combat, dodge, weapon/special/cast, boon system (god blessings), room-based dungeon, narrative between runs, mirror upgrades.
**Subsystems:**
- Camera: isometric follow; room transitions; no rotate
- Input: WASD, attack, special, cast, dash/dodge, interact, summon
- Movement: physics-lite; dash/iframe; no jump
- Core loop: real-time tick; room clear → reward → door choice → next room; boss every ~10 rooms; death = restart with persistent upgrades
- World: room-based dungeon; hand-crafted rooms; random sequence
- Entities: player, enemies (many types), bosses, traps, reward pedestals, NPCs
- Economy: darkness, gems, keys, nectar, ambrosia (persistent currencies)
- Progression: mirror upgrades (persistent), weapon aspects, keepsakes, heat system
- UI: health, cast charge, boon list, map, reward picker, narrative dialogue
- Multiplayer: none
- Save/run persist: mirror, weapon unlocks, narrative state

**Pain points:**
- `blocked` `shell` — No isometric camera
- `blocked` `shell` — No room transition / camera snap primitive
- `blocked` `core` — No dash / iframe primitive
- `blocked` `core` — No boon / blessing system primitive
- `blocked` `core` — No room-based dungeon generation primitive
- `blocked` `core` — No persistent meta-progression between runs primitive
- `blocked` `core` — No heat / difficulty modifier primitive
- `workaround` `core` — Death/restart is game-owned state reset + persistent layer
- `friction` `shell` — Isometric rendering needs custom camera angle

**Workarounds:**
- Use `PlayableGame.environment` for room meshes
- Use `object.place` for traps and pedestals

**Engine gaps filed:** *not yet filed*

---

## Factorio
**Family:** factory builder / automation
**Mechanical fingerprint:** Belt transport, inserter arms, assembler machines, research tree, pollution, enemy biter evolution, train network, circuit network.
**Subsystems:**
- Camera: top-down free pan/zoom; no follow target
- Input: click-to-place entity, drag-to-build, click-to-open GUI, deconstruction planner
- Movement: free 2D; vehicle (car, tank, train); no physics needed
- Core loop: real-time tick; belt item movement; machine crafting; power grid; pollution spread
- World: infinite 2D grid; resource patches; biome zones
- Entities: many (belts, inserters, assemblers, power poles, trains, enemies)
- Economy: raw resources, intermediates, science packs, research progress
- Progression: research tree, automation tiers, logistics network, rocket launch
- UI: inventory, crafting, research, map, train schedule, circuit network, power grid
- Multiplayer: co-op (shared factory); PvP optional
- Save/load: full factory state (massive)

**Pain points:**
- `blocked` `shell` — `enablePan={false}`; factory pan essential
- `blocked` `shell` — No top-down orthographic camera
- `blocked` `core` — No belt transport / item routing primitive
- `blocked` `core` — No inserter / arm animation primitive
- `blocked` `core` — No power grid / circuit network primitive
- `blocked` `core` — No research tree primitive
- `blocked` `core` — No pollution / evolution primitive
- `blocked` `core` — No train / rail network primitive
- `blocked` `core` — No deconstruction planner / blueprint primitive
- `workaround` `core` — `object.place` for static factory entities
- `friction` `shell` — 1000+ factory entities need instanced rendering; shell uses per-entity React

**Workarounds:**
- Use `InstancedBodies` for belt/item rendering if uniform
- Use `GameUI` for extensive factory GUIs

**Engine gaps filed:** *not yet filed*

---

## RimWorld
**Family:** colony sim / story generator
**Mechanical fingerprint:** Colonist needs/skills, work priorities, random events (raid, eclipse, psychic drone), mood system, social fights, trading, research, space ship escape.
**Subsystems:**
- Camera: top-down free pan/zoom; no follow
- Input: click-to-select colonist, right-click order, area designations, architect menu
- Movement: pathfinding; work actions; no physics
- Core loop: real-time tick (pausable); job scheduler; event queue; mood updates
- World: colony map; interior/exterior; temperature; weather; biome
- Entities: colonists (many, persistent), animals, raiders, traders, items, buildings
- Economy: silver, resources, trade goods
- Progression: research, building tiers, social relationships, space ship
- UI: colonist bar, needs/mood panel, work tab, health tab, architect, research, trade, alerts
- Multiplayer: none (single-player with AI storyteller)
- Save/load: full colony state; multiple saves

**Pain points:**
- `blocked` `shell` — `enablePan={false}`; colony pan essential
- `blocked` `shell` — No top-down camera
- `blocked` `core` — No job scheduler / work priority primitive
- `blocked` `core` — No random event / storyteller primitive
- `blocked` `core` — No mood / need system primitive
- `blocked` `core` — No social relationship / fight primitive
- `blocked` `core` — No temperature / weather system primitive
- `blocked` `core` — No area designation (storage, growing, home) primitive
- `workaround` `core` — Colonist stats are `scene.entity.stats`
- `friction` `react` — Extensive tab UI needs custom panel system

**Workarounds:**
- Use `object.place` for buildings
- Use `entity.setPose` for colonist pathfinding

**Engine gaps filed:** *not yet filed*

---

## Rocket League
**Family:** sports / vehicle physics
**Mechanical fingerprint:** Car soccer, boost meter, aerial mechanics, ball physics, team play, ranked matchmaking, cosmetics.
**Subsystems:**
- Camera: follow ball or follow car; spectate mode; free look
- Input: accelerate, brake, steer, boost, jump, double jump, flip, drift, ball cam toggle
- Movement: physics-driven vehicle; ball physics; boost acceleration; aerial control
- Core loop: real-time tick; 5-minute match; goal scoring; overtime
- World: arena (enclosed stadium); no exterior
- Entities: cars (2–8), ball (1), boost pads
- Economy: none (cosmetic only)
- Progression: ranked tiers, cosmetic unlocks
- UI: scoreboard, boost meter, timer, replay, post-match stats
- Multiplayer: 2v2, 3v3, 4v4; ranked; private matches
- Save/load: none (per-match)

**Pain points:**
- `blocked` `shell` — No vehicle physics / car movement primitive
- `blocked` `shell` — No ball physics primitive
- `blocked` `shell` — No boost meter / pickup primitive
- `blocked` `shell` — No ball-cam toggle primitive
- `blocked` `shell` — No replay system primitive
- `blocked` `core` — No vehicle controller primitive
- `blocked` `core` — No ranked matchmaking primitive
- `workaround` `shell` — Orbit camera can follow car if `followEntityId` is ball
- `friction` `shell` — Aerial double-jump/flip needs custom physics; shell has character controller only

**Workarounds:**
- Use `PhysicsWorld` for car and ball
- Use `entityModels` for car bodies

**Engine gaps filed:** *not yet filed*

---

## Club Penguin / Social MMO
**Family:** social MMO / mini-game hub
**Mechanical fingerprint:** Avatar customization, social spaces, emotes, igloo/home decorating, mini-games (sled racing, card-jitsu), party events, moderation.
**Subsystems:**
- Camera: top-down or isometric in social spaces; varies per mini-game
- Input: WASD or click-to-move; emote hotkeys; interact click
- Movement: free 2D/2.5D or click-to-move in social; physics in mini-games
- Core loop: session-based; no win/lose; social interaction + mini-game queue
- World: social rooms (persistent), igloos (instanced), mini-game arenas
- Entities: player avatars (many), NPCs, furniture, pets
- Economy: coins (from mini-games), clothing catalog, furniture catalog
- Progression: clothing collect, stamps/achievements, puffles
- UI: chat bubble, emote wheel, inventory, map, catalog, friend list
- Multiplayer: shared social spaces; instanced mini-games; friend system
- Save/load: avatar outfit, igloo layout, inventory, friend list

**Pain points:**
- `blocked` `shell` — No click-to-move in social spaces
- `blocked` `shell` — No emote system primitive
- `blocked` `shell` — No chat bubble / safe chat primitive
- `blocked` `core` — No instanced room / igloo primitive
- `blocked` `core` — No clothing catalog / avatar customization primitive
- `blocked` `core` — No mini-game queue / matchmaking primitive
- `blocked` `core` — No moderation / safe chat filter primitive
- `workaround` `core` — Social graph is `ctx.game.social`
- `friction` `react` — Catalog browsing needs extensive UI

**Workarounds:**
- Use `entityModels` for avatar bodies
- Use `object.place` for igloo furniture

**Engine gaps filed:** *not yet filed*

---

## Summary: Most common pain points across archetypes

| Pain point | Archetypes affected | Classification |
|------------|---------------------|----------------|
| ~~`enablePan={false}` / no free pan~~ resolved 0.7.0: `rig: "rts"` free pan/edge-scroll | Bloons TD, Fallout Shelter, Civilization, XCOM, Factorio, RimWorld, The Sims, Stardew Valley | `shell` |
| No side-scrolling / 2D camera | Flappy Bird, Learn to Fly, Mario, Tetris, Angry Birds, PvZ | `shell` |
| ~~No isometric camera~~ resolved 0.7.0: `rig: "topDown"` iso | Bloons TD, Fallout Shelter, Civilization, XCOM, Hades, The Sims | `shell` |
| WASD movement monopoly | Flappy Bird, Learn to Fly, Bloons TD, The Sims, PvZ | `shell` |
| ~~No click-to-move / pathfinding~~ resolved 0.7.0: `nav/navGrid` + `pointer` move commands | The Sims, Fallout Shelter, Stardew Valley, RimWorld, Club Penguin | `core` |
| ~~No grid-snap placement~~ resolved 0.7.0: `world/placementController` + ghost renderers | Bloons TD, Fallout Shelter, The Sims, Factorio, RimWorld | `core` |
| No 2D sprite rendering | Mario, Tetris, PvZ, Flappy Bird | `shell` |
| ~~No turn-based action system~~ resolved 0.7.0: `turn/*` + `tactics/*` | Civilization, XCOM | `core` |
| ~~No upgrade / tech tree primitive~~ resolved 0.7.0: `economy/techTree` | Learn to Fly, Civilization, Cookie Clicker, Factorio, Hades | `core` |
| No offline/idle progress | Cookie Clicker, Fallout Shelter | `core` |
| ~~No vehicle physics~~ resolved 0.7.0: `physics/vehicleBody` | Rocket League, Fortnite, Minecraft | `core` |
| ~~No building / construction primitive~~ resolved 0.7.0: `world/placementController` + `world/structure` suite | Fortnite, Minecraft, Factorio, RimWorld | `core` |
| ~~No drag-and-drop UI~~ resolved 0.7.0: `@jgengine/react` `dragLayer` | The Sims, Fallout Shelter, Tetris, Candy Crush | `react` |
| No chat / social bubble | Club Penguin | `react` |
| No runtime camera command (fly-to / shot queue / replay-cam) | kingdom/chronicle sim, Rocket League (replay), any cutscene | `shell` |
| No LOD banding / game-facing instancing at 1000+ entities | Factorio, kingdom/chronicle sim | `shell` |
| No unbounded classed event history (chronicle / storyteller / director beats) | kingdom/chronicle sim, RimWorld | `core` |
| No seed-in-URL share link | kingdom/chronicle sim, daily-seed roguelikes | `shell` |
| No season / year calendar layer | kingdom/chronicle sim, Stardew Valley | `core` |

**Next step:** Run Step 5 (batch dispatch) against the 20+ archetypes above to validate and extend these pain points with exact API suggestions.
