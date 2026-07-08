# AGENT HANDOFF — Voxel Mine → Minecraft Parity

You are building **Minecraft 1:1 mechanical parity** on top of the existing JGengine game `Games/voxel-mine`. Assets/models/textures may differ (no Mojang IP — use procedural colors, Kenney/CC0 atlases, or generated face textures). Everything else — systems, rules, numbers, loops, UI topology, world behavior — must match Java Edition survival/creative as closely as the engine allows.

This is not a polish pass. This is a full product rebuild of the game layer. Keep the game id `voxel-mine` unless the user renames it. Do not fork `@jgengine/shell`. Prefer engine primitives; when a primitive is missing, implement in game code first, then file an engine gap only if two+ systems need the same missing seam.

Read before writing code:
- `skills/jgengine-api/SKILL.md` (+ `reference/world.md`, `reference/multiplayer.md`)
- `skills/jgengine-newgame/SKILL.md`
- `skills/jgengine-verify/SKILL.md`
- Every file under `Games/voxel-mine/src/`
- `packages/core/src/world/voxelField.ts`
- `packages/core/src/movement/voxelController.ts`
- `packages/core/src/crafting/recipe.ts`
- `packages/core/src/item/durability.ts`
- `packages/core/src/runtime/snapshot.ts` + `packages/core/src/runtime/gameRuntime.ts`
- `examples/convex-host/` (authoritative server shape)

Work in a worktree off `main`. Claim no issue unless one exists. Verify with `bun run check-types`, `bun test` (world/summarizeEnvironment-style assertions on `VoxelField.summary()`), never hang on `bun run shoot`.

---

## 0. Non-negotiables

1. **Source of truth for blocks** = `createVoxelField` (chunkSize 16). Scene objects are a *render/collision projection*, not the world DB. Never place one `scene.object` per block at Minecraft scale.
2. **Cell convention** (engine law): block at integer `(x,y,z)` occupies `X∈[x-0.5,x+0.5]`, `Y∈[y,y+1]`, `Z∈[z-0.5,z+0.5]`. Top of `y=-1` is feet at `y=0`. Match `voxelController` / existing `voxelGrid.ts`.
3. **Mine/place** go through `item.use` handlers (existing pattern in `handlers.ts`), not ad-hoc click hacks.
4. **Creative vs Survival** are real game modes with different rules (consume stacks, break times, health, flying). `server: { mode }` today is decorative — replace with a real `GameMode` system.
5. **Multiplayer block edits are authoritative** via `createGameRuntime` + chunk snapshots. Declaring `convex({ topology: "shared" })` alone only syncs poses — that is not enough.
6. **No Mojang assets.** Recreate block *behavior* and *IDs* (use `minecraft:`-style logical ids mapped to your catalog ids). Textures: atlas of solid/noise faces or CC0 packs.
7. **Dense catalogs, one file per domain** (repo style). No comment noise. No half-systems in a phase marked complete.
8. **Java Edition numbers** where they exist (tick rate 20, day 24000 ticks, stack 64, reach ~4.5 survival / 5 creative, hunger, tool speeds, ore distribution bands). When exact wiki numbers conflict with engine constraints, document the delta in `Games/voxel-mine/PARITY_DELTAS.md` and pick the closest implementable rule.

---

## 1. Baseline — what exists today (do not regress)

`Games/voxel-mine` is a ~1.5k LOC probe:

| Have | Detail |
|------|--------|
| FPS camera | `perspective: "first"`, eyeHeight 1.6, reticle |
| Voxel collision | `collision: { voxel: true }` |
| Dual write grid | `voxelGrid.ts` → `VoxelField` + `scene.object.place/remove` |
| Instant mine/place | pickaxe + 6 blocks, reach 6, bedrock immune |
| Inventories | hotbar 7 (`build`) + resources 12 (`resource`) |
| Drops | `worldItem.spawn` + autoPickup 1.8 |
| World | Fixed 13×13 columns, shaft, 4 ores, 3 trees — **not** procedural |
| Quests | 2 collect quests (keep as optional tutorial layer; not Minecraft-core) |
| Multiplayer | Convex shared — **poses only**; edits local |
| Render | One colored box mesh per block — dies past a few thousand blocks |

Replace the dual-write-every-block pattern in Phase 1. Keep the handler/raycast/hotbar selection patterns.

---

## 2. Target — Minecraft system checklist

Ship in phases. A phase is **done** only when its acceptance tests pass and the previous phases still pass.

### Phase A — World substrate (blocks that scale)

**Goal:** Infinite-feeling chunked world with fast render + collision, no per-block `ObjectMarker`.

#### A1. Chunked voxel world service
- Module: `game/world/World.ts` owning `VoxelField` (chunkSize 16).
- API: `get/set/remove`, `raycast`, `getChunk(cx,cy,cz)`, `ensureChunk`, `unloadChunk`, `subscribeChunk`, `solidQuery` for controller.
- Chunk key: `` `${cx},${cy},${cz}` `` matching `field.chunkOf`.
- Vertical range: y = -64 .. 320 (Java 1.18+). Bedrock floor layers at bottom.
- Do **not** call `ctx.scene.object.place` per block.

#### A2. Chunk mesher (required for playable scale)
- Greedy mesh **or** instanced faces from `exposedFaces` / `neighbors`.
- One (or few) `THREE.BufferGeometry` / `InstancedMesh` per dirty chunk.
- Dirty tracking via `chunkVersion` + `field.subscribe`.
- Atlas: per-block-type face colors first; swap to texture atlas later without changing mesh API.
- Custom R3F layer under `Environment` / `WorldOverlay` / `renderObject` — **not** thousands of shell objects.
- Collision: feed `isSolid` from `World.has` into movement. Prefer `movement.beforeCommit` and/or a solid query the shell voxel controller can use. If shell only scans `object.list()`, either:
  - maintain a sparse set of **collision proxy** objects only for blocks near the player (bad), or
  - implement game-side kinematic step using `advanceVoxelPlayer` from `@jgengine/core/movement/voxelController` with `SolidQuery = (x,y,z) => world.has(...)`, and disable shell voxel collision in favor of that path via `beforeCommit` / documented movement override.
  - If shell hardcodes block the clean path, file `shell: voxel collision should accept SolidQuery` — but still ship a working game-side controller in the same PR.

#### A3. Streaming
- View distance N chunks (default 8; settings later).
- Load/generate chunks in a ring around player each tick; unload far chunks (keep in LRU disk/memory cache).
- `voxel({ streaming })` descriptor is **inert** in engine — implement streaming in game code.

**Acceptance A:**
- Stand in world with ≥ 8 chunk radius generated.
- `field.summary().blocks` ≫ 10_000 without FPS death.
- Mine/place updates only dirty chunk meshes.
- Walk/jump/fall on generated terrain via voxel controller.
- World test: generate seed X → assert block counts / biome samples / bedrock row present (browserless).

---

### Phase B — Terrain generation (Overworld)

**Goal:** Recognizable Minecraft overworld from a seed.

#### B1. Noise stack
- Seeded RNG (`seededRng`) + value/simplex/perlin noise (implement in `game/worldgen/noise.ts` if engine lacks 3D noise — `noiseField` is heightfield-oriented).
- Continentalness / erosion / peaks-style **or** classic stacked octaves: base height, hills, mountains, oceans.
- Surface rules: grass/dirt/stone depth by biome; sand deserts/beaches; stone mountains; gravel rivers.

#### B2. Caves & ores
- 3D carve caves (perlin worms / cheese / spaghetti approximation).
- Ore veins with Java-like distribution bands (coal, copper, iron, gold, redstone, lapis, diamond, emerald, ancient debris later).
- Dirt/gravel patches, granite/diorite/andesite blobs (or simplified stone variants).

#### B3. Biomes (minimum viable full set)
Implement at least: plains, forest, birch forest, dark forest, taiga, snowy plains, desert, badlands (simplified), savanna, jungle (simplified), swamp, ocean, deep ocean, river, beach, meadow, windswept hills. Biome source = 2D (or 3D) noise → biome id → surface + veg + spawn tables.

#### B4. Surface decoration
- Trees (oak, birch, spruce, jungle scrub) as block structures.
- Tall grass, flowers, sugar cane, cactus, kelp (ocean), lily pads.
- Lakes (water), rare lava lakes surface/underground.

#### B5. Structures (phased inside B)
Must-have for “feels like Minecraft”:
1. Villages (paths, houses, villagers later)
2. Dungeons (spawner + chests)
3. Mineshafts (simplified corridors + rails later)
4. Desert temple / jungle temple (pick one first, then both)
5. Stronghold + end portal frame room (gates Phase H)
6. Ruined portal
7. Shipwreck / ocean ruins (if ocean gen exists)

Structure placement: chunk-based salt + spacing rules. Store structure pieces as palette functions `placeStructure(world, origin, pieceId, rotation)`.

**Acceptance B:**
- Same seed → identical terrain (deterministic test).
- Biomes visibly differ within 500 blocks travel.
- Caves connect; ores appear in correct Y bands (statistical tests OK).
- At least 3 structure types generate in a large sample of chunks.

---

### Phase C — Block registry & states

**Goal:** Blocks are data, not special cases.

#### C1. Block catalog (`game/blocks/catalog.ts`)
Each block:
```ts
{
  id: string;
  displayName: string;
  solid: boolean;
  transparent?: boolean;
  replaceable?: boolean;      // air, grass, water
  hardness: number;           // Java break times base
  blastResistance: number;
  tool?: "pickaxe" | "axe" | "shovel" | "hoe" | "shears" | "hand";
  harvestLevel?: number;      // 0 wood .. 4 netherite
  drops: DropTable;           // self, silk-touch rules, fortune
  luminance?: number;         // 0-15
  gravity?: "fall" | "none";
  fluid?: "water" | "lava";
  flammable?: boolean;
  states?: StateSchema;       // facing, age, open, waterlogged, …
  model: "cube" | "cross" | "slab" | "stairs" | "fence" | "door" | "torch" | "custom";
  faces?: { all?: string; top?: string; bottom?: string; side?: string };
}
```

Minimum block set to claim parity (expand continuously):
- Terrain: air, stone, granite, diorite, andesite, deepslate (+ cobbled), dirt, grass, podzol, mycelium, sand, red sand, gravel, clay, bedrock
- Wood: log/wood/planks/leaves/sapling × oak birch spruce jungle acacia dark_oak (mangrove/cherry optional later)
- Ores + raw + deepslate variants
- Manufactured: crafting table, furnace, chest, torch, ladder, glass, glass pane, wool×16, concrete, terracotta
- Slabs/stairs/fences/walls/doors/trapdoors/buttons/pressure plates/levers for stone + oak at minimum
- Fluids: water, lava (source + flowing levels 0–7)
- Plants: tall grass, flowers, cactus, sugar cane, wheat, carrots, potatoes, beetroot, melon, pumpkin
- Nether starters: netherrack, soul sand, soul soil, glowstone, nether bricks, magma, ancient debris
- End starters: end stone, obsidian, chorus (later)

#### C2. Block updates
- Neighbor update queue (Minecraft-style): place/break schedules updates.
- Falling blocks: sand/gravel/concrete powder → entity → land.
- Fluid tick: spread, source creation (water infinite springs), lava–water → stone/obsidian/cobble rules.
- Light: separate skylight + blocklight BFS per chunk section (15 levels). Mesher reads light for vertex tint. Sky light from top-down opacity.

#### C3. Block entities
Chests, furnaces, signs, spawners, hoppers, dispensers, droppers, brewing stands, enchanting tables — stored in `Map<cellKey, BlockEntityState>` parallel to `VoxelField` (field holds block id + packed state bits; entity holds inventory/progress).

**Acceptance C:**
- Catalog covers ≥ 80 block ids with real hardness/drops.
- Water flows and forms infinite springs in 2×2.
- Sand falls when support removed.
- Torch emits block light; caves are dark without light (mesher respects light).

---

### Phase D — Items, inventory, tools, breaking

**Goal:** Survival inventory + Java break rules.

#### D1. Inventory layout (Java)
- Hotbar: 9 slots
- Main: 27 slots
- Armor: 4
- Offhand: 1
- 2×2 inventory craft + 3×3 crafting table
- Cursor stack for drag UI
- Stack limits: 64 / 16 / 1 per item def
- Use engine `inventories` declarations + traits; build full screen UI in `GameUI` (E to open).

#### D2. Item catalog
Tools (wood/stone/iron/gold/diamond/netherite): pickaxe, axe, shovel, hoe, sword. Armor sets. Food. Materials. Buckets. Bows. Shields. Boats. Minecarts. Seeds. Dye. etc.

Wire `item/durability` for tools/armor. Wire `content.itemById` → `use` handlers.

#### D3. Break / place rules
- Hold-to-break with progress bar (crosshair crack overlay). Use input `repeatMs` / per-tick progress from hardness × tool multiplier × efficiency enchant later.
- Wrong tool → slow + no drop (harvest level).
- Creative: instant break, no consume, middle-click pick block.
- Place: consume 1 unless creative; sneak to place on interactables; face placement for logs/furnaces.
- Reach: 4.5 survival, 5 creative.
- Replace `handlers.ts` instant mine; keep raycast via `VoxelField.raycast` (`hit.adjacent` for place).

#### D4. Drops & pickup
- Keep `worldItem` for entity drops; merge stacks; cooldown; magnet radius small (vanilla ~0? actually players walk over — keep autoPickup small ~1.0 or vanilla-like collide).

**Acceptance D:**
- Survival: break stone with fist is slow / no cobble; stone pick drops cobble; iron ore needs stone+ pick.
- Inventory open/close; move stacks; craft planks from log in 2×2.
- Tool durability decrements; breaks at 0.

---

### Phase E — Crafting, smelting, progression stations

Use `@jgengine/core/crafting/recipe` (`RecipeDef`, `createRecipeGraph`, `canCraft`, `craft`, `stationSatisfied`).

#### E1. Recipe book data
Port Java shaped/shapeless recipes for the unlocked item set (planks, sticks, tools, furnace, chest, torches, bread, etc.). Store in `game/crafting/recipes.ts` as dense tables.

#### E2. Stations
- Crafting table (3×3 UI)
- Furnace / blast furnace / smoker (`productionBuilding` or timed `RecipeDef.seconds` + block entity progress)
- Campfire, stonecutter, smithing table (netherite), anvil (repair/rename/combine — can simplify rename), grindstone, loom, cartography (maps later), brewing stand

#### E3. Enchanting (Phase E or G)
- Enchanting table + bookshelves power
- Enchantment catalog (sharpness, efficiency, fortune, silk touch, unbreaking, protection, power, infinity, mending, …)
- Anvil costs in levels

**Acceptance E:**
- Full wood→stone→iron→diamond tool path craftable from world resources.
- Furnace smelts iron ore → iron ingot with coal fuel.
- Recipe graph unit tests for ≥ 30 recipes.

---

### Phase F — Survival vitals & game modes

#### F1. Player stats
Health 20, hunger 20, saturation, exhaustion. Breathing bar underwater. Armor points. Experience bar + levels.

Damage sources: fall, starve, drown, lava/fire, cactus, void, mob, player, magic.

Death → drop inventory (unless keepInventory gamerule) → respawn at bed/world spawn after screen.

#### F2. Hunger
Vanilla exhaustion events (sprint, jump, attack, regenerate). Peaceful regenerates.

#### F3. Game modes
- Survival, Creative (fly, god, instant break, infinite items UI), Adventure (restricted break), Spectator (noclip, no HUD interact).
- `/gamemode` command via `ctx.game.commands`.

#### F4. Difficulty
Peaceful / Easy / Normal / Hard — scales mob damage, hunger drain, poison, etc.

**Acceptance F:**
- Starve to empty hunger → health drain on Normal+.
- Fall from 10+ blocks damages; water resets fall.
- Creative flight (double-tap jump or dedicated key) works with collision off for creative fly.

---

### Phase G — Time, weather, sleep

- 20 ticks/sec simulation clock (`ctx.time`); dayLength 24000 ticks.
- Drive sky via `sky({ timeOfDay: true })` if using environment feature, or custom sky in `Environment.tsx` from `calendar().dayFraction`.
- Rain / thunder weather cycles; lightning strikes (fire + skeleton horse rare later).
- Beds: night skip when all players sleep (singleplayer = you); set spawn; explode in Nether/End.
- Phantom spawning if not slept (Hard/Normal) — can follow mob phase.

**Acceptance G:**
- Visible day/night cycle; mobs burn in sunlight when undead rules land.
- Sleep through night in bed when safe.

---

### Phase H — Dimensions

#### H1. Nether
- Separate `World` instance / dimension id on player.
- Nether generation: biomes (wastes, forest, deltas simplified), bedrock ceiling/floor, fortresses, bastions (simplified).
- Portal: 4×5 obsidian frame min, light with flint+steel, teleport link Overworld↔Nether at 8:1 coords.

#### H2. End
- Central island + outer islands (phased).
- Exit portal + dragon fight (Phase J can stub dragon).
- End gateway after dragon.

**Acceptance H:**
- Build portal, enter Nether, return within linked distance.
- Bedrock ceiling present; no fall-into-void without care.

---

### Phase I — Mobs & combat

#### I1. Entity catalog
Passive: cow, pig, sheep, chicken, villager (brain simplified).  
Hostile: zombie, skeleton, creeper, spider, enderman, slime, drowned, witch.  
Nether: piglin, ghast, magma cube (subset OK first).  
Bosses: ender dragon, wither (later).

#### I2. Spawning
Cap per mob category; light level rules; biome filters; despawn far from player; peaceful disables hostiles.

#### I3. AI
Use `nav/navGrid` on local solid tops where useful; otherwise steering + jump. States: idle, wander, chase, attack, flee, panic, breed.

#### I4. Combat
Player melee swing cooldown, knockback, invulnerability frames, criticals (falling), bow charge, projectile entities, shield block, creeper fuse/explode (`world` blast that breaks blocks by blastResistance).

#### I5. Breeding & drops
Food breed; XP orbs; leather/pork/beef/wool/bones/gunpowder/string/ender pearls; rare drops.

**Acceptance I:**
- Night spawns zombies/skeletons; they path to player and damage.
- Kill cow → beef + XP; cook beef in furnace.
- Creeper explosion destroys nearby low-resistance blocks.

---

### Phase J — Redstone & automation (parity depth)

This is what separates “block game” from Minecraft.

Minimum viable redstone:
- Redstone dust power propagation (0–15) with weak/strong power rules simplified but consistent
- Torch, repeater, comparator (subtract mode can simplify)
- Lever, button, pressure plate, tripwire (optional)
- Piston / sticky piston (push limit 12)
- Observer
- Hopper (item transfer into block entities / chests)
- Dropper / dispenser
- Door / trapdoor / gate / note block powered behavior

**Acceptance J:**
- Clock circuit runs.
- Hopper moves items chest→chest.
- Piston pushes a line of blocks ≤12.

---

### Phase K — World interaction furniture

Chests (double chest merge), signs (edit UI), item frames, armor stands, ladders/scaffolding climb, boats on water, minecarts on rails, jukebox, beacon pyramid powers, conduit (ocean), composters, cauldrons, flower pots, bookshelves, lecterns, bells, respawn anchor (Nether).

Each is a block + optional block entity + UI. Implement in priority order tied to survival loop (chest → furnace done in E → boat → rail → beacon).

---

### Phase L — UI / UX (Java-like topology)

- Hotbar + XP + health + hunger + air
- Inventory screen (armor, craft 2×2, recipe book toggle)
- Pause (esc): back to game, options, quit to title
- Title / world select (seed, mode, difficulty) — even if single save slot first
- Chat + commands (`/tp`, `/gamemode`, `/time`, `/weather`, `/give`, `/kill`, `/setblock`, `/fill`, `/gamerule`)
- Creative inventory tab search
- Death screen
- Furnace/crafting/chest screens
- Debug overlay F3: coords, chunk, biome, light, facing, fps

Touch: keep virtual stick; hide raw slot keybinds as today.

---

### Phase M — Audio / particles / feel

- Step, break, place, splash, portal, ambient biome loops (CC0 sounds)
- Block break particles, sprint particles, rain splashes
- View bobbing, FOV on sprint/fly, hurt camera tilt
- Item use animations / arm swing (viewmodel optional)

---

### Phase N — Multiplayer (real shared world)

1. Register `createGameRuntime({ gameId: "voxel-mine", save: { auto: "5s", scope: "player+chunks" }, commands, loop })` in `examples/convex-host` (or game-specific host).
2. Commands (authoritative): `voxel.set`, `voxel.remove`, `voxel.interact`, `player.inventory.*`, `chat.send`, dimension change, etc.
3. Chunks as `RuntimeChunkRow`: serialize block palette + nibble states + block entities (not one RuntimeObject per block — store compact arrays in `flags` or a custom encoded blob if object list is too heavy; if forced to objects, palette-compress).
4. Client: predict local edit → send command → reconcile from server chunk snapshot.
5. Presence already syncs poses; add held item / sneaking / sprinting flags.
6. Inventories server-owned in multiplayer.

**Acceptance N:**
- Two clients see the same block place/break within ~100ms on local Convex.
- Relog loads chunks from `jgWorldChunks`.

---

### Phase O — Save / load / settings (singleplayer)

- Local persistence of chunks + player (IndexedDB or engine save scope when offline runtime exists).
- Seed, world name, gamerules (`doFireTick`, `keepInventory`, `mobGriefing`, `doDaylightCycle`, …).
- Options: render distance, difficulty, master volume, mouse sensitivity, invert y.

---

## 3. Engine primitives — use these

| Need | Use |
|------|-----|
| Block lattice | `createVoxelField`, `raycast`, `exposedFaces`, `chunkOf`, `chunkVersion` |
| FPS move | `collision.voxel` / `advanceVoxelPlayer` |
| Item use | `ctx.item.use.register`, hotbar primary click |
| Inventory | `inventories`, `ctx.player.inventory.*`, loadouts |
| Recipes | `createRecipeGraph`, `craft`, `canCraft` |
| Machines | `productionBuilding`, `tickProduction` |
| Durability | `item/durability` |
| Drops | `ctx.scene.worldItem.*`, `worldItem.autoPickup` |
| Time of day | `sky({ timeOfDay: true })` + `ctx.time.calendar()` |
| Commands | `ctx.game.commands.define` |
| Auth world sync | `createGameRuntime`, `RuntimeChunkRow`, convex host |
| Nav | `createNavGrid`, `findPath` |
| Farming | `createCropField`, `createDayTicker` |
| Seeded rolls | `seededRng` |

## 4. Engine gaps — expect to hit

Implement in game when possible; file issues only for true blocks:

| Gap | Severity | Mitigation |
|-----|----------|------------|
| No greedy/instanced voxel renderer wired to `VoxelField` | blocked at scale | Custom R3F mesher (Phase A) |
| Shell collision scans `object.list()` | friction | Game-side `advanceVoxelPlayer` + SolidQuery |
| `object.break` / `placeFromInventory` skill text only | friction | Keep item.use handlers |
| `breakable` catalog mostly stub | friction | Game break progress |
| `voxel.streaming` inert | friction | Game streaming |
| No block-state in `VoxelField` (string type only) | friction | Pack state into type string or parallel state map |
| No fluid/light/redstone primitives | expected | Game simulation |
| Convex shared ≠ block sync | blocked for MP | GameRuntime commands + hydrate |
| Skill mentions slotInventory attach — unused | friction | Manual block-entity inventories |

Do **not** wait on engine PRs to finish Phase A–F offline singleplayer.

---

## 5. Architecture sketch (target)

```
game/
  blocks/catalog.ts          # block defs
  items/catalog.ts           # item defs
  crafting/recipes.ts
  world/
    World.ts                 # VoxelField + states + blockEntities
    ChunkMesher.ts
    ChunkRenderer.tsx
    streaming.ts
    light.ts
    fluid.ts
    falling.ts
    redstone.ts
  worldgen/
    noise.ts
    biome.ts
    surface.ts
    caves.ts
    ores.ts
    decor.ts
    structures/*
  entities/
    mobs/catalog.ts
    ai/*
    combat.ts
  player/
    vitals.ts
    modes.ts
    inventoryUi.ts
  dimension/
    overworld.ts
    nether.ts
    end.ts
    portals.ts
  net/
    commands.ts
    hydrate.ts
  ui/                        # HUD + screens
  handlers.ts                # item.use mine/place/interact
  loop.ts                    # tick all sims
  game.config.ts
```

Tick order each frame (`onTick`):
1. streaming load/unload  
2. player input already applied by shell  
3. fluid / falling / redstone / block entity furnaces  
4. mob AI + combat  
5. vitals (hunger, drowning, regen)  
6. weather / time (if not engine-driven)  
7. chunk mesh rebuilds for dirty set  
8. multiplayer flush / command send  

---

## 6. Content priority order (survival loop first)

1. Wood tools → stone → coal torch → iron furnace → diamond  
2. Food loop (wheat/cow/pig) + beds  
3. Shelter + chest storage  
4. Cave mining + threat at night  
5. Nether access  
6. Villagers / trading (can simplify economy with `ctx.game.trade`)  
7. Enchanting + diamond armor  
8. End dragon  
9. Redstone deep + farms  
10. Creative completeness / commands  

Every PR should advance the survival loop, not only catalogs.

---

## 7. Verification gates (per phase)

- `bun run check-types` clean  
- Unit tests: worldgen determinism, recipe craft, break time math, fluid spring, light BFS on a fixture, redstone power on a fixture  
- World tests: `createVoxelField` / `World` summary assertions (jgengine-verify pattern)  
- Manual play: `bun run games:voxel-mine`  
- Screenshots: only after world tests pass; if `shoot` hangs, **do not re-run** — report once  

---

## 8. Explicit out-of-scope / allowed deltas

Document in `PARITY_DELTAS.md`:
- Exact Java worldgen algorithm (Welford/Continentalness) — approximate OK if biomes/caves/ores feel right  
- All 300+ blocks — ship curated complete survival set first, then expand  
- Real resource pack / skins / Capes  
- Realms / Microsoft auth  
- Exact redstone quasi-connectivity — prefer Bedrock-simple or documented Java subset  
- Soft blocks (stairs collision meshes) — start with full-block collision; add AABB voxel shapes later  
- Map item exploration — later  

Not allowed as permanent deltas:
- Instant mining in survival  
- No hunger  
- Finite 13×13 world  
- Unlit caves that are fully bright  
- Multiplayer that desyncs terrain  

---

## 9. Execution protocol for the coding agent

1. **Plan big, execute small.** Open a tracking checklist in the PR body mirroring phases A→O.  
2. **Fan out** mechanical legs (catalogs, recipe tables, structure palettes, tests) to workers; keep meshing/movement/net design in the main loop.  
3. **One phase per PR stack** when possible (A alone is already large). Land A before B decoration spam.  
4. **Never** reintroduce per-block `scene.object.place` for terrain after A lands.  
5. After each phase: update this file’s checklist with ✅ and note PARITY_DELTAS.  
6. Commit messages: `voxel-mine: <phase> <what>`.  
7. Push branch; open draft PR; do not bump package versions.

### First PR (start here)

**Phase A only:** chunked `World`, mesher, streaming, game-side solid collision, rewrite mine/place onto `World`, delete dependence on placing every block as `scene.object`, keep a tiny creative hotbar so the game stays playable. Port the old 13×13 generator as a *debug flat chunk* option; default to noise heightmap even if biomes are “plains only.”

---

## 10. Definition of “fully Minecraft”

You may call the project parity-complete when:

- [ ] Infinite chunked overworld + Nether + End  
- [ ] Survival vitals, day/night, weather, sleep  
- [ ] Full tool/armor progression through diamond (netherite optional but expected)  
- [ ] Crafting + smelting + chests + beds + boats  
- [ ] Hostile + passive mobs with night threat  
- [ ] Caves, ores, ≥10 biomes, ≥5 structure types  
- [ ] Water/lava with correct basic interactions  
- [ ] Lighting that makes torches matter  
- [ ] Redstone MVP (power, piston, hopper)  
- [ ] Creative mode + commands  
- [ ] Save/load + multiplayer shared terrain  
- [ ] UI: inventory, crafting, furnace, pause, death, F3  

Until then, it is still Voxel Mine with ambitions — keep shipping phases.
