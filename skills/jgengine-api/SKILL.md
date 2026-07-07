---
name: jgengine-api
description: Use when building, extending, or debugging a game on JGengine, or when another skill needs the engine surface — defineGame, GameContext, the three buckets, catalogs, and the world/combat/loot/quest/trade primitives. Read before writing any game.config.ts or catalog.
---

# JGengine — API Reference

The engine ships **verbs and primitives**; your game ships **nouns** (catalogs) and thin handlers. Read this before writing `game/game.config.ts` or any game content. Companion skills: **`jgengine-newgame`** (master blueprint + phased build to completion), **`jgengine-ui`** (the look-and-behave quality bar), and **`jgengine-assets`** (real models/textures from day one) — read all three before building.

## Packages

All published on npm, source at [github.com/Noisemaker111/jgengine](https://github.com/Noisemaker111/jgengine) (AGPL-3.0):

| Package | Role | May import |
|---------|------|------------|
| `@jgengine/core` | Everything below: defineGame, GameContext, scene, combat, game systems, movement, input, world features, runtime/transport contracts | nothing platform-specific — no React, Convex, three.js, browser |
| `@jgengine/react` | `GameProvider`, hooks, headless UI primitives | react + core |
| `@jgengine/shell` | `GamePlayerShell` — R3F canvas, orbit camera, input tracking, HUD mounting, `GameUiPreview`, demo game; you supply a `GameRegistry` | react + three + core |
| `@jgengine/ws` | Browser-safe WebSocket `GameBackend` + protocol codec + HTTP reads | core |
| `@jgengine/node` | Standalone authoritative host: tick loop, snapshots, ws server, memory/file persistence | node + ws + core |
| `@jgengine/sql` | `HostPersistence` on Postgres (structural pool, no hard `pg` dep) | core |
| `@jgengine/convex` | The Convex **adapter** behind the `GameBackend` seam | react + convex + core |

Import by deep path: `@jgengine/core/<domain>/<file>` (e.g. `@jgengine/core/runtime/gameContext`).

## Hit a snag? File an issue

Any hiccup with JGengine — a doc that's wrong, a missing primitive, a rough edge, or a feature/improvement idea — file it fast at [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues). A 30-second issue (what you were building, the glue it forced, the API you wanted) is worth more than a silent workaround — that's the fastest way gaps and doc errors get closed. Don't reverse-engineer around a broken doc in silence; report it.

## Upgrading? Read the changelog

All eight packages version in lockstep. When you bump (e.g. `0.6` → `0.7`) to pick up new capabilities, read [`CHANGELOG.md`](https://github.com/Noisemaker111/jgengine/blob/main/CHANGELOG.md) — each release leads with a **Migrate** block listing the concrete steps to move a game onto the new APIs. It ships inside every package too (`node_modules/@jgengine/core/CHANGELOG.md`), and as typed values: `import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"` to diff your installed version against the latest programmatically.

## Concept → Type Reference

Exact import paths and export names — **do not invent paths**; every row below resolves to a real file under `packages/core/src`. Import the deep path form `@jgengine/core/<path>`.

| Concept | Import path (`@jgengine/core/…`) | Export(s) |
|---------|----------------------------------|-----------|
| Game boot | `game/defineGame` | `defineGame`, `GameDefinition`, `GameLoop`, `InventoryDeclaration`, `PhysicsConfig`, `GameServerConfig`, `TimeConfig` |
| Simulation clock | `time/simClock` | `createSimClock`, `SimClock`, `TimeConfig`, `ClockSnapshot`, `CalendarTime` |
| Runner contract | `game/playableGame` | `PlayableGame`, `GameCameraConfig`, `EntitySpriteConfig` |
| Runtime ctx | `runtime/gameContext` | `createGameContext`, `GameContext`, `GameContextContent`, `GameContextItemEntry`, `GameContextEntityEntry`, `GameContextObjectEntry`, `CatalogEntityRole` |
| Scene instance role | `scene/entityStore` | `EntityRole`, `SceneEntity`, `SpawnOptions`, `EntityPose` |
| Multiplayer adapters | `runtime/adapter` | `offline`, `ws`, `convex`, `servers`, `MultiplayerTopology`, `ServersPoolConfig` |
| Loot | `game/lootTable` | `lootTable`, `LootTableDef`, `LootEntry`, `Drop` |
| Loadout | `game/loadout` | `LoadoutDef`, `LoadoutItemEntry`, `Loadouts` |
| Quest | `game/quest` | `QuestDef`, `QuestRewards`, `QuestObjective`, `QuestJournal` |
| World features | `world/features` | `WorldFeature`, `biomes`, `voxel`, `plots`, `tilemap`, `flat`, `environment`, `terrain`, `rain`, `snow`, `grass`, `ocean`, `building` |
| Terrain field | `world/terrain` | `TerrainField`, `noiseField`, `resolveTerrainField`, `rollingField`, `fractalNoise`, `valueNoise`, `withNormal`, `arenaField`, `flatField`, `resolveGroundStep` |
| Regions | `world/regions` | `createRegionField`, `isRegionField`, `RegionDef`, `RegionField`, `RegionSample` |
| Wind field | `world/wind` | `windField`, `WindField`, `WindFieldConfig`, `WindVector` |
| Water surface | `world/water` | `waterSurface`, `waterSurfaceFromDescriptor`, `synthesizeWaves`, `WaterSurface`, `GerstnerWave` |
| Scatter | `world/scatter` | `scatter`, `scatterAabb`, `ScatterConfig`, `ScatterPoint` |
| Content scatter | `world/scatterItems` | `scatterItems`, `pickWeighted`, `ScatterLayer`, `ScatterInstance` |
| Building generator | `world/buildings` | `generateBuilding`, `generateBuildingDistrict`, `createBuildingGrid`, `GeneratedBuilding` |
| Building index | `world/buildingIndex` | `buildingIndex`, `BuildingIndex`, `BuildingHit` |
| Proximity prompt | `interaction/proximityPrompt` | `proximityPrompt`, `ProximityPrompt`, `ProximityPromptDisplay`, `keybind`, `gauge`, `label`, `command` |
| Item use | `item/use` | `createItemUse`, `ItemUseHandler`, `ItemUseInput`, `ItemUseResult`, `ItemUseRejection` |
| Inventory | `inventory/inventoryModel` | `InventoryLayout`, `InventorySet`, `ItemTraits` |
| Progression | `game/progression` | `curve`, `evalCurve`, `leveling`, `Curve`, `LevelingTrack`, `LevelProgress` |
| Inventory slots | `inventory/slotModel` | `createSlots`, `placeAt`, `removeAt`, `moveSlot`, `firstEmpty`, `compactSlots`, `Slot`, `SlotGrid` |
| World geometry | `world/geometry` | `footprintAabb`, `aabbOverlap`, `snapToGrid`, `resolveMove`, `Aabb`, `Footprint` |
| Placement | `world/placement` | `validatePlacement`, `footprintObstacle`, `PlacementRules`, `PlacementResult` |
| Interiors | `world/interiors` | `createInteriors`, `Interior`, `Exterior`, `SpaceRef` |
| Game clock | `time/gameClock` | `getScaledElapsedMs`, `computeGameDay`, `SECONDS_PER_GAME_DAY` |
| Scene behaviors | `scene/behaviors` | `wander`, `promptable`, `talkable`, `player` |
| Economy wallet | `economy/wallet` | `createEmptyWallet`, `balance`, `grant`, `charge`, `canAfford`, `chargeAll` |
| Input bindings (full) | `input/actionBindings` | `hotbarSlotBindings`, `actionLabel`, `bindingLabel`, `resolveActionCommand`, `bindingMatches`, `createActionStateTracker` |
| Physics world | `physics/physicsWorld` | `PhysicsWorld`, `PhysicsWorldConfig`, `PhysicsBounds`, `PhysicsStats`, `AddBodyOptions` |
| Animation SM | `combat/animationState` | `createAnimationState`, `AnimationState`, `AnimationClip`, `FramePhase`, `FrameRange`, `phasesAtFrame`, `activeRangeAtFrame`, `frameAtMs` |
| Accumulator meter | `stats/accumulatorMeter` | `createAccumulatorMeter`, `AccumulatorMeter`, `AccumulatorMeterConfig`, `MeterTier`, `MeterAddResult`, `tierAt` |
| Stagger / buildup | `combat/breakMeters` | `createStaggerMeter`, `createBuildupMeter`, `StaggerMeter`, `BuildupMeter`, `BuildupProc` |
| Attack tags | `combat/attackTags` | `attackMeta`, `AttackTag`, `AttackMeta`, `hasTag`, `isBlockable`, `isParryable`, `isDodgeable`, `counters` |
| Defensive window | `combat/defensiveWindow` | `createDefensiveWindow`, `resolveDefense`, `DefensiveWindowConfig`, `DefenseKind`, `DefenseOutcome`, `windowActiveAt`, `iframeActiveAt` |
| Combo string | `combat/comboString` | `createComboRunner`, `advanceCombo`, `ComboString`, `ComboStep`, `AdvanceComboResult` |
| Hit reaction | `combat/hitReaction` | `resolveHitReaction`, `HitReaction`, `HitReactionConfig`, `CameraShake`, `applyImpulse` |
| Telegraph | `combat/telegraph` | `pointInTelegraph`, `telegraphProgress`, `telegraphFired`, `TelegraphShape`, `TelegraphConfig` |
| Dash / dodge | `movement/dash` | `createDashState`, `DashState`, `DashConfig`, `DashBurst`, `iframeActive`, `dashOffset` |
| Ability kit | `combat/abilityKit` | `createAbilityKit`, `AbilityKit`, `AbilitySlotConfig`, `AbilitySlotSnapshot`, `AbilitySlotState`, `AbilityCastType`, `AbilityCastResult` |
| Event meter | `stats/eventMeter` | `createEventMeter`, `EventMeter`, `EventMeterConfig`, `EventMeterFeedResult` |
| Auto-target policy | `scene/autoTarget` | `selectAutoTarget`, `createAutoTargeter`, `AutoTargetPolicy`, `AutoTargeter`, `AutoTargetDeps` |
| Resistance matrix | `combat/resistance` | `resolveResistance`, `resistanceScale`, `ResistanceMatrix`, `ResistVerdict`, `ResistanceResult` |
| Run draft | `game/runDraft` | `createRunDraft`, `createRunModifierStack`, `RunDraft`, `RunModifierStack`, `RunModifierOffer` |

## Getting started (new project)

```sh
bun add @jgengine/core @jgengine/react @jgengine/shell react react-dom three three-stdlib @react-three/fiber @react-three/drei
bun add -d @tailwindcss/vite tailwindcss   # HUD styling (Vite + Tailwind v4)
```

Wire the shell in any React app (Vite works out of the box):

```tsx
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

const games: GameRegistry = {
  "my-game": () => import("./game").then((m) => m.myGame),
};

function App() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  useEffect(() => { void games["my-game"]().then(setPlayable); }, []);
  return playable ? <GamePlayerShell playable={playable} /> : null;
}
```

HUD styling is Tailwind v4: register the `@tailwindcss/vite` plugin in `vite.config.ts` (`plugins: [react(), tailwindcss()]`) and add `@source "../node_modules/@jgengine/shell";` (and your game source dirs) to your CSS entry, or the HUD renders unstyled. Then build the game itself under `game/` per the layout below.

## Scope

This file documents engine primitives and conventions only — never game domain. Example ids (`iron_block`, `mob_grunt`, `shop_town`) are placeholders, not content to copy.

| Engine owns | Your game owns |
|-------------|----------------|
| Weighted loot RNG, trade validation, loadout application, quest journal state, social graph, stat clamp math, effect absorption, projectile geometry, death resolution, event bus, feeds, leaderboards, input capture, pose hitboxes | Catalog entries and ids, effect id names, XP curves, shop/item/quest/loadout definitions, use-handlers, AI logic, UI content |

**Rules:**

1. **Catalog-first** — shape and behavior of every id lives in game-owned catalog files. Runtime calls pass ids, positions, instance keys.
2. **Three buckets** — inventory items, scene objects, scene entities. Never merge them.
3. **Dumb place/spawn** — no behaviors on `place()`/`spawn()`; the catalog owns them.
4. **Commands for verbs** — input maps to actions, actions to commands/handlers; no raw keys in game logic.
5. **Primitives over glue** — a loop several games need (loot roll, shop buy, kit seeding) belongs in the engine, not copy-pasted per game.
6. **No speculative config** — `defineGame` fields exist only with a live engine consumer.
7. **This file stays domain-free.**

## The three buckets

| Bucket | What | API |
|--------|------|-----|
| **Inventory** | Stackable ids in containers | `ctx.player.inventory.put / take / move / has / count` |
| **Scene object** | Static world content | `ctx.scene.object.place / remove / move / rotate / list` |
| **Scene entity** | Movers driven per tick | `ctx.scene.entity.spawn / despawn / setPose / effect / …` |

A voxel block is an object. A rack is an object with a slot inventory. A GPU is an inventory item inside it. A player, mob, or car is an entity.

## Game repo layout

Everything under `game/` (or your package's `src/`). Dense files — one `catalog.ts` per domain, never one file per entry.

```
game/
  game.config.ts       defineGame entry — thin composition over keybinds/inventories/world
  keybinds.ts          ActionCodesMap — named actions + hotbarSlotBindings(n)
  inventories.ts       inventory declarations
  world.ts             WorldFeature + PhysicsConfig
  index.ts             PlayableGame export (game, content, loop, GameUI)
  assets.ts            Render catalog
  content.ts           itemById / entityById lookups over all catalogs
  loop.ts              onInit, onNewPlayer, onTick
  loadouts.ts          Loadout ids → items/economy/unlocks per inventory
  world/               zones.ts, setup.ts (place/spawn from onInit)
  items/               <domain>/catalog.ts + use-handlers.ts
  objects/             catalog.ts (+ loot tables beside their domain)
  entities/            players/ enemies/ npcs/ — catalog.ts per role (never actors/)
  quests/catalog.ts    when using game.quest
  progression/         curves.ts — game-owned XP curve numbers fed to game/progression
  ui/GameUI.tsx        ALL layout/positioning
  ui/components/       content-only pieces GameUI places
```

## `defineGame`

Platform boot only, and a **thin composition** — bindings, inventories, and world/physics live in their own modules because a big game makes each of them expansive. Never game tuning (walk speeds, damage, prompts — those live in catalogs).

```ts
// game.config.ts — imports only, nothing inline
import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { assets } from "./assets";
import { inventories } from "./inventories";
import { keybinds } from "./keybinds";
import { physics, world } from "./world";

export const game = defineGame({
  name: "My Game",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: "persistent",            // or { mode: "ffa", scoreLimit: 30 } — rules live in game code
  save: { auto: "5m", scope: "player+chunks" },   // or "none"
  multiplayer: offline(),          // or ws({ topology }) / convex({ topology }) / servers({ …, adapter })
  ui: GameUI,
  loop,                            // GameLoop<GameContext>
});
```

```ts
// keybinds.ts — named actions + generated hotbar slots; one key, one action
import { hotbarSlotBindings, type ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"],
  jump: ["Space"], sprint: ["ShiftLeft"],
  interact: ["KeyE"],
  crouch: { hold: ["KeyC"], toggle: ["KeyZ"] },
  aim: { hold: ["mouse2"], toggle: ["KeyV"] },
  tabTarget: ["Tab"], clearTarget: ["Escape"],
  ...hotbarSlotBindings(9),        // hotbarSlot1..9 → Digit1..9 (a 10th slot gets Digit0)
};
```

```ts
// inventories.ts
import type { InventoryDeclaration } from "@jgengine/core/game/defineGame";
export const inventories: Record<string, InventoryDeclaration> = {
  hotbar: { slots: 9, hud: "hotbar" },
  backpack: { slots: 28, traits: itemTraits },
  equipment: { slots: 4, accepts: ["weapon", "armor"], applyModifiers: true },
};

// world.ts
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { biomes, type WorldFeature } from "@jgengine/core/world/features";
export const world: WorldFeature = biomes({ map: "world/biomes", zones: "world/zones" });
export const physics: PhysicsConfig = { gravity: -32 };
```

- Input bindings are string arrays (hold semantics) or `{ hold, toggle }` for the same verb.
- **Keybind → command convention.** The shell fires a command for any bound action that isn't reserved: pressing an action runs a command of the **same name** if one is defined, else a `ui.<action>` fallback (so `openBackpack` → `ui.openBackpack`). Just declare the binding and a matching command — no per-game `keydown` listener. Reserved actions the shell consumes natively and never routes to a command: `moveForward/moveBack/moveLeft/moveRight`, `turnLeft/turnRight`, `sprint`, `jump`, `tabTarget`, `clearTarget`, `useAbility`, `interact`, and any `hotbarSlotN`/`slotN`. `tabTarget`/`clearTarget` run `target.cycle`/`target.clear` (native `cycleTarget`/`setTarget` fallback).
- **`interact`** is special: pressing it resolves the active proximity prompt from `PlayableGame.prompts` and runs that prompt's `invoke` command. A prompt with `invoke: null` is display-only and does nothing on the key.
- UI keybind badges derive from `keybinds` via `actionLabel(keybinds, "openBackpack")` — `bindingLabel` maps codes to short labels (`Digit1`→`1`, `KeyB`→`B`, `mouse0`→`LMB`, `Escape`→`Esc`). Never hardcode label strings; they drift the moment a binding changes.
- `server.mode` is a string your loop/commands interpret — the engine ships no gamemode presets.
- Never in defineGame: player tuning, catalog helpers (`defineItems` etc.), game nouns, behaviors, prompts, or inline binding/inventory/world blobs.

## `PlayableGame` — how a game plugs into a runner

`@jgengine/core/game/playableGame`:

```ts
export type PlayableGame<TUi = unknown> = {
  game: GameDefinition;
  content: GameContextContent;                 // { itemById?, entityById?, objectById? }
  loop: Required<GameLoop<GameContext>>;       // onInit, onNewPlayer, onTick
  GameUI: TUi;                                 // React component in web runners
  prompts?: (ctx: GameContext) => readonly PositionedPrompt[]; // interact-key + HUD source
};
```

`prompts` is the **single source** of positioned proximity prompts: the shell reads it to fire the `interact` key, and the HUD should read the same list through `useActivePrompt(playable.prompts?.(ctx))` rather than building its own — one list, no drift. A prompt is only actionable if its `invoke` is non-null.

Optional render/world fields the shell also reads: `entitySprites` / `entityModels` (billboards / GLBs keyed by entity kind), `objectModels` (GLBs keyed by object catalog id), `WorldOverlay` (canvas-layer VFX), `environment` (canvas-layer scenery — ground/sky/structures; when set, replaces the default ground plane + debug grid + rock field), `camera`, and `worldHealthBars`. A model value is a catalog id (`string`, resolved via `game.assets`) or an inline `ModelConfig { url, scale?, y?, anchor?, dims? }`. Catalog-resolved models carry measured `dims` (`catalog.resolve(id).dims = { footprint:{w,d}, center:{x,z}, minY }`); with the default `anchor: "center"` the shell centers the footprint on the placement point and ground-snaps `minY` to it, so corner-pivot kit models place correctly with no per-game pivot math.

The runner boots `createGameContext({ definition, content, player: { userId, isNew } })`, calls `loop.onInit(ctx)` then `loop.onNewPlayer(ctx)`, and drives `loop.onTick(ctx, dt)` per frame. **Convention: `onNewPlayer` spawns the player entity with `id === ctx.player.userId`** — bounded stats, targeting, and kill attribution key off that.

## `GameContext` — the ctx surface

`createGameContext` (in `@jgengine/core/runtime/gameContext`) wires every system:

```
ctx.scene.object    place, remove, move, rotate, get, list, subscribe
ctx.scene.entity    spawn, despawn, setPose, get, list,
                    stats.{get,set,delta}, setTarget, getTarget, cycleTarget,
                    canReceive, preview, effect,
                    willHitProjectile, fireProjectile, settleProjectile,
                    distance, inRadius, hasLineOfSight, queryArc, moveToward
ctx.game            commands, events, feed, loot, trade, quest, social,
                    unlocks, economy, leaderboard
ctx.player          userId, isNew, inventory, stats (modifiers), loadout,
                    applyLoadout, movement (pose/aim)
ctx.item            use, weapon
ctx.time            advance, now, calendar, snapshot; pause, play, toggle,
                    setSpeed, cycleSpeed; after, every, at (game-time timers)
ctx.subscribe / ctx.version    change signal — UI layers bind via useSyncExternalStore
```

`content.itemById(id)` supplies `{ use?, weapon?, trade? }`; `content.entityById(id)` supplies `{ stats?, receive?, onDeath?, movement?, role? }`; `content.objectById(id)` supplies `GameContextObjectEntry` `{ proximityPrompt?, breakable?, slotInventory? }`. Build all three from your catalogs in `content.ts`. A placed object resolves its catalog entry via `ctx.scene.object.catalog(instanceId)`.

### Two tiers: `ctx` runtime vs pure factories

The `ctx` surface above is the **stateful runtime** — it's what game code uses. Every subsystem it wires is *also* exported as a **pure factory** that `createGameContext` composes internally: `createTradeSystem`, `createDeathSystem`, `createEffectSystem`, `createProjectileSystem`, `createSpatialApi`, `createEntityStatsApi`, `createEntityStore`, `createObjectStore`, `createStats`, `createLoadouts`, `createLootRegistry`, `createQuestJournal`, `createSocial`, `createSlots`, `createInteriors` (plus stateless helpers beside each — `canAffordCosts`/`resolveBuy` in `game/trade`, `getStatValue`/`applyPoolDelta` in `scene/entityStats`, and so on). **Build a game through `ctx`, not these** — reach for the factories only for unit tests of pure game math, headless servers, or a custom runtime. Import the domain deep path (`@jgengine/core/combat/death`, `@jgengine/core/game/trade`, `@jgengine/core/stats/statModifiers`, …) and read the `.d.ts`; each is a real export in the published package.

## `loop` — lifecycle

```ts
export function onInit(ctx: GameContext) {
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest.register(quests);
  ctx.game.quest.bind("entity.died");
  ctx.game.feed.bind("entity.died");
  ctx.game.events.on("entity.died", (evt) => onEntityDied(ctx, evt));
  setupWorld(ctx);
}

export function onNewPlayer(ctx: GameContext) {
  ctx.scene.entity.spawn("player_default", { id: ctx.player.userId, position: spawnPoint });
  if (ctx.player.isNew) ctx.player.applyLoadout(ctx.player.userId, "starterKit");
}

export function onTick(ctx: GameContext, dt: number) {
  // AI, regen, respawn timers — dt is GAME time (see ctx.time). Never death detection (see entity.died)
}
```

`onInit` runs once per boot; register everything there. Loot tables register through `ctx.game.loot.register` — `lootTable()` is a pure validating factory, there is no global side-effect registry.

## `ctx.time` — the simulation clock

`onTick`'s `dt` is **game time, not real time**: the shell scales each frame's real delta by `definition.time.scale` (real→game seconds at 1×) and the live speed multiplier, so writing decay/regen/AI as `rate * dt` makes it obey pause and fast-forward for free — never read wall-clock in a tick. Configure via `defineGame({ time: { scale?, speeds?, dayLength?, start?, startPaused? } })` (all optional; default is real-time 1:1 with speeds `[1,2,3,4]`).

- **Continuous** work scales through `dt`. **Scheduled** work uses game-time timers: `ctx.time.after(sec, cb)`, `ctx.time.every(sec, cb)`, `ctx.time.at(gameSec, cb)` — measured in game-seconds, so 4× fires them 4× sooner and pause freezes them. Each returns a cancel handle.
- **Controls** (drive from a HUD or a command): `pause()`, `play()`, `toggle()`, `setSpeed(mult)` (0 pauses), `cycleSpeed()`. Read state with `ctx.time.snapshot()` / `ctx.time.calendar()` (`{ day, hour, minute, second, dayFraction }`), or in React with `useGameClock()` → snapshot + `controls`. Speeding to 4× or pausing affects **everything** on the tick — no per-system wiring.

## Content catalogs

### Object catalog fields

| Field | Purpose |
|-------|---------|
| `id`, `model` | Canonical id, asset key |
| `footprint` | `{ w, h, d }` placement bounds |
| `snap` | `"grid"` \| `"free"` \| `"wall"` |
| `solid` | Blocks movement |
| `breakable` | `false` or `{ baseBreakTime, harvest, drops, dropsWhenUnmet }` |
| `proximityPrompt` | Float UI + optional command invoke |
| `slotInventory` | Attached container `{ slots, accepts }` created at place time (`object:<instanceId>`) |

Break resolution: `duration = baseBreakTime / (tool?.breakSpeed ?? 1)`; drops per `when` (`always` / `harvestMet` / `silkTouch` / `playerKill`); then `inventory.put` + `object.remove`.

### Item catalog fields

| Field | Purpose |
|-------|---------|
| `id`, `kind`, `stack`, `model` | Basics; `stack` feeds `itemTraits.stackLimit` |
| `use` | Game handler name dispatched by `item.use` (`"fireGun"`, `"castBolt"`, `"drinkPotion"`) |
| `weapon` | Stats the handler reads via `item.weapon.getStat` — `damage`, `heal`, `reach`, `manaCost`, `projectile.{mass,gravity,fuseTime,settleOn}`, `explosion.{radius}` … |
| `trade` | `{ buy?: {coins: 80}, sell?, shops?: ["shop_town"] }` |
| `requires` | Unlock ids gating purchase/use |
| `placesObject` | Object id placed from hotbar |

### Entity catalog fields

| Field | Purpose |
|-------|---------|
| `movement` | `walkSpeed` (reaches spawn automatically), `poses?: ["standing","crouch","prone","running"]`, `aim?: ["hip","ads"]` |
| `role` | `CatalogEntityRole` = `"player"` \| `"enemy"` \| `"hostile"` \| `"npc"` \| `"vehicle"` — catalog hostility class for targeting (`"enemy"`/`"hostile"` classify hostile in `cycleTarget`). Distinct from the scene *instance* `EntityRole` (`"player"` \| `"npc"` \| `"prop"`, in `scene/entityStore`) which drives input/camera binding |
| `stats` | Stat declarations — bounded values: `{ health: { max: 120, min: 0 }, level: { max: 60, min: 1, current: 1 }, … }` — `current` optional, defaults to `max` |
| `receive` | Per-effect absorption: `{ damage: { order: ["shield","health"], modifiers? }, heal: { order: ["health"] } }` — keyed by **game-defined effect ids**; presence = can receive |
| `onDeath` | `{ drops: "table_id" }` or reason-aware `{ drops: [{ table, when: { reason: "player_kill" } }], command?: { name, when? } }` |
| `wander`, `talkable` | AI descriptor; dialogue id sugar for a talk prompt |

### Dialogue catalog

`entities/npcs/dialogues.ts` — `{ id, lines: [{ speaker, text } | { choices: [{ label, invoke: { command, args } | null }] }] }`. Choices invoke `quest.accept`, `trade.open`, etc.

## `scene.entity.stats` — bounded stats

```ts
stats.get(instanceId, statId)        // → { current, max, min } | null
stats.set(instanceId, statId, { current?, max?, min? })
stats.delta(instanceId, statId, n)   // → null | { reason } — clamps into [min, max]
```

Health, mana, xp, level, energy — any stat id declared on the catalog. Spawn seeds from the catalog (`current ?? max`). Combat writes through effects; non-combat (regen ticks, XP grants) calls `delta` directly.

**XP/level use the engine progression primitive.** `@jgengine/core/game/progression` ships `curve()`/`evalCurve()` (evaluate a game-owned XP-per-level curve *definition*) and `leveling()` (a level track over the bounded `xp`/`level` stats that reports overflow). You own the curve *numbers* in a catalog; the engine owns the overflow math — on level-up bump `level.current`, reset `xp.max` from the curve, push a `stat.levelUp` feed entry. Hand-rolling `xpForLevel`/`levelFromXp`/`xpToNextLevel` is the anti-pattern — those already exist.

`ctx.player.stats` is a different thing: **modifiers** (buffs, ADS zoom, walk-speed bonuses) via `base/add/remove/get` with expiries — never bounded current/max values.

## Targeting (MMO tab-target)

Persistent per-entity session state — never a per-use input field.

```ts
ctx.scene.entity.setTarget(fromId, toId | null)
ctx.scene.entity.getTarget(fromId)                    // → instanceId | null
ctx.scene.entity.cycleTarget(fromId, { filter: "hostile" | "friendly" | "any", direction? })
```

Hostility comes from catalog `role` (`"enemy"`/`"hostile"` classify hostile). Input `tabTarget`/`clearTarget` actions route here. Handlers always read `getTarget(input.from)` — `ItemUseInput` deliberately has **no `to` field** (single source of truth, no client-supplied target to validate, three targeting models stay clean: aim for shooters, `queryArc` for melee, `getTarget` for MMO).

## `item.use` — one verb for all usable items

```ts
ctx.item.use.register(handlers)      // once in onInit; duplicate names throw
ctx.item.use.can(ctx, input)         // → { reason } | null
ctx.item.use.use(ctx, input)         // dispatches catalog `use` → your handler

type ItemUseInput = { from: string; itemId: string; inventoryId?: string; aim?: Aim };
type ItemUseHandler<GameContext> = {
  can?(ctx, input): { reason: string } | null;
  apply(ctx, input): { state: GameContext; error?: string };
};
```

**Handlers receive the full `GameContext` as state** and mutate through it. Handlers own ammo, cooldowns, range checks, and effect ids; the engine owns projectile geometry, stat clamp math, and `canReceive`.

| Handler | Engine calls |
|---------|--------------|
| gun | spend ammo → `fireProjectile` → `settleProjectile` |
| grenade | `fireProjectile` (ballistic) → settle → `effect({ at, radius })` |
| melee | `queryArc` + reach from `getStat` → `effect` per hit |
| MMO cast | `getTarget(from)` → `stats.delta(mana)` → `effect({ to })` |
| consumable | `effect({ to: from, effect: "heal", via: { amount: -n } })` |

Banned in the engine: `weapon.fire`, `consumable.use`, `game.combat.*`, per-weapon commands.

## Effects and projectiles

Effect ids are **game-defined strings**. Magnitudes **drain** stats: positive subtracts down `receive.<effect>.order` (spilling to the next stat in the order), negative restores. Heals pass a negative amount (`via: { amount: -flashHeal }`, typically read from a `weapon.heal` stat).

```ts
ctx.scene.entity.canReceive(instanceId, effect)          // null | reason — reads catalog receive
ctx.scene.entity.preview({ from, to, effect, via })      // magnitude, no state change
ctx.scene.entity.effect({ from, to, effect, via })                          // single target
ctx.scene.entity.effect({ from, effect, via, at, radius, falloff?, los? })  // AoE at a point
```

AoE: `inRadius(at, radius)` → LoS filter (default on) → `canReceive` per target → absorption; `falloff: "linear" | "none"`. `via` = `{ item }` (magnitude from weapon stats) or `{ amount }`.

**Projectiles** (aim-based — no target ids):

```ts
willHitProjectile({ from, via, aim, effect })   // prediction only, for crosshair UI
fireProjectile({ from, via, aim, effect })      // → shotId (pending)
settleProjectile(shotId)                        // authoritative → { at, hits } | rejection
```

`Aim = { origin, direction } | { yaw, pitch, spread? }`. Hitscan settles into per-hit effects; ballistic shots (`weapon.projectile` with `fuseTime`/`settleOn`) settle to a landing point — the handler then calls `effect({ at: settle.at, radius })`. Settling twice rejects. Prediction is never authority.

## Death

Resolved **once** by the engine when the last stat in the receive order hits min. No HP polling in `onTick`, ever.

- `entity.died` is emitted (before despawn — handlers can still read the victim's stats), then reason-matching `onDeath` entries run.
- `DeathReason = { kind: "player_kill", killerUserId, via? } | { kind: "environment", source } | { kind: "self", source }`. Kills by the local player attribute automatically.
- `onDeath.drops` tables are rolled and **granted to the killer** on player kills (emits `loot.granted`); `onDeath.command` runs through `ctx.game.commands`.
- Respawning under the same instance id revives it (it can die again). Same-id respawn must not happen synchronously inside the `entity.died` handler — defer a tick.
- `quest.bind("entity.died")` credits kill objectives from the same event; leaderboards and kill feeds hang off it too.

## Combat feel (melee, defense, telegraphs)

Layered on top of effects/projectiles/death — none of it replaces them, it adds **feel**. All models are renderer-free pure `@jgengine/core` factories a game composes per entity (like the `ctx`-vs-factory split above); the shell renders the telegraphs, styled damage numbers, hitstop shake.

- **Animation state machine** (`combat/animationState`) is the root the rest hangs on. A `AnimationClip` is catalog data — `{ frames, fps, ranges }` where each `FrameRange` tags a window `windup | active | recovery | cancel` (cancel may overlap recovery). `createAnimationState({ clips })` gives a per-entity SM: `play(clipId)`, `tick(dt)` → `{ entered, exited, completed }`, and queries combat/defense subscribe to — `inPhase("active")`, `isActive()`, `canCancel()`, `activeWindowMs()`. Frame ranges are the "commit frame" contract for delayed/feinted attacks.
- **Attack tags** (`combat/attackTags`) — `attackMeta(["unblockable" | "thrust" | "sweep" | "grab" | …], { effect, power })`. Defense logic reads them: `isBlockable`, `isParryable`, `isDodgeable`, `counters(meta, "mikiri")`. A grab beats all defenses; an unblockable is parry/dodge-only.
- **Defensive window** (`combat/defensiveWindow`) — a parry/block/dodge with `{ startupMs, activeMs, recoveryMs, iframes }`. `resolveDefense({ config, elapsedMs, attack })` is the pure overlap of the defender's window against the moment the attacker's `active` frames land → `parry | block | iframe | hit`. `createDefensiveWindow(config)` tracks the open time (`open(now)` / `evaluate(now, attack)` / `isInvulnerable(now)`).
- **Combo strings** (`combat/comboString`) — `ComboStep`s with `cancelInto` + `cancelPhases` + optional `stance`, over the anim SM. `advanceCombo(...)` (pure) accepts the next attack only inside the current step's cancel window and matching stance; `createComboRunner(combo, anim)` drives the SM.
- **Meters share one accumulator** (`stats/accumulatorMeter`) — `createAccumulatorMeter({ max, mode: "hold" | "reset", decayPerSecond, decayDelayMs, tiers })`: fill via `add(n)` → `MeterAddResult { fired, overflow, tier, tierChanged }`, `tick(dt)` decays after an idle grace. `combat/breakMeters` builds two on it: `createStaggerMeter` (mode `hold` — fills from hits, `broke()` stays true until `recover()` after a riposte/deathblow) and `createBuildupMeter` (mode `reset` — `add(n)` returns a `BuildupProc { status, durationMs }` at threshold for bleed/frost/rot, then decays). The same base backs G6's ult/streak meters.
- **Dash / dodge** (`movement/dash`) — `createDashState({ distance, durationMs, iframes, staminaCost, staminaMax, staminaRegenPerSecond, cooldownMs })`: `tryDash(dir, now)` → burst or `{ reason: "no-stamina" | "cooldown" | "dashing" }`, `isInvulnerable(now)` for the i-frame window, `offset(now)` for the burst displacement, `tick(dt, now)` regens stamina.
- **Hit reaction** (`combat/hitReaction`) — `resolveHitReaction(config, { attackerPos, targetPos, power })` (pure) → `{ hitstopMs, impulse, shake }`. Wired on `ctx`: `ctx.scene.entity.hitReaction({ from, to, config, power? })` knocks the target back and emits `combat.hitReaction` (the shell reads `shake` for a trauma channel — feeds a G2 camera-shake rig when present, else the shell's own kick).
- **Telegraph** (`combat/telegraph`) — a `TelegraphShape` (`circle | ring | cone | line`) + `windupMs`. `ctx.scene.entity.telegraph({ from, shape, at, dir?, windupMs, kind?, effect? })` emits `combat.telegraph` for the shell to draw a ground decal that fills over the windup, and — if `effect` is bound — applies that effect to everyone inside the shape (`pointInTelegraph`) at activation. Returns a cancel handle.
- **Damage-number typing** — `ctx.scene.entity.floatText({ …, crit?, element?, hitType?, scale? })` (and the `entity.floatText` event) carry hit metadata; the shell's `resolveFloatTextStyle` (`@jgengine/shell/world/floatTextStyle`) maps crit/element to color + scale + glow.

## Abilities, resources, auto-target, resistance, run drafts

Genre systems layered over the same effects/projectiles/targeting/loot primitives — all renderer-free pure `@jgengine/core` factories a game holds per player and ticks on **game-time** `dt` (so pause/fast-forward carry through). The ability kit is deliberately **separate from inventory items**: an item is a stackable id, an ability slot is cooldown/charge/resource state the HUD's four slot-states bind to.

- **Ability kit** (`combat/abilityKit`) — `createAbilityKit([{ id, cooldownMs, chargesMax?, resourceCost?, castType?, flashMs? }])`. `state(id, resourceAvailable?)` → `AbilitySlotSnapshot { state: "ready" | "cooldown" | "no-resource" | "just-cast", charges, chargesMax, cooldownRemainingMs, cooldownFraction, justCast, ready }`; `cast(id, resourceAvailable?)` consumes a charge, starts the recharge, and flashes just-cast; `canCast` / `tick(dt)` / `reset`. The kit is resource-**agnostic** — it reports `no-resource` by comparing `resourceCost` to a supplied `resourceAvailable` (a mana stat, or an ult meter), and never spends the resource itself; the game's handler spends it and calls `cast`. Charges recharge one at a time; the four states drive the hotbar slot art. Cooldowns tick on `dt`, so hang `kit.tick(dt)` in `onTick`.
- **Event-fed meters** (`stats/eventMeter`, built on `stats/accumulatorMeter`) — `createEventMeter({ max, mode, gains, resets?, tiers?, decayPerSecond? })`. `feed(tag, scale?)` maps a tagged combat event to a gain (or a reset when `tag ∈ resets`) → `EventMeterFeedResult { fired, ready, tier, tierChanged, reset }`. Mode `"hold"` is the **ult/adrenaline** economy — charges off `{ damageDealt, damageTaken, kill }` events, `ready()` at full, `consume()` spends it (Overwatch/Marvel Rivals). Mode `"reset"` is the **streak/combo** meter — builds on `kill`, resets on a break tag like `damageTaken`, climbs ascending `tiers` (Returnal adrenaline, DMC style rank). One primitive, two catalog configs.
- **Auto-target policy** (`scene/autoTarget`) — `selectAutoTarget(policy, fromId, deps)` / `createAutoTargeter(policy, deps)` evaluated each tick with zero input: `"nearest" | "farthest" | "random" | "strongest" | "weakest" | "first" | "last"`. `deps` supplies `candidates`/`distance` and optional `strength` (health/threat) + `progress` (path progress for first/last-on-path). Bullet-heaven auto-fire (Vampire Survivors nearest), Bloons tower priority (first/last on path). Feed the picked id to `abilityKit.cast` + `effect`.
- **Resistance matrix** (`combat/resistance`) — a damage-category × target-property table distinct from `combat/attackTags` (those are defense tags). `resolveResistance(matrix, category, targetProperties)` → `{ verdict: "immune" | "resist" | "normal" | "vulnerable", multiplier, immune }`; `resistanceScale` returns just the multiplier (default `immune:0, resist:0.5, normal:1, vulnerable:2`, overridable). Immune on any property wins; resists stack multiplicatively. Sits over the `receive` gate — the handler multiplies its effect `amount` by the scale (Bloons lead/camo immunities, elemental RPG weaknesses).
- **Run draft** (`game/runDraft`, built on `world/scatterItems` `pickWeighted` + `stats/statModifiers`) — `createRunModifierStack(offers)` accumulates stacking picks (`add`, `count`, `atMax`, `total(stat)` aggregating adds × exponentiated multiplies, `apply(stats)` onto a `createStats` source). `createRunDraft({ offers, rng? })` adds the pause-flow: `present(n)` draws N distinct weighted offers (excluding maxed-out ones), `choose(id)` applies to the stack. Pause/resume is game-side (`ctx.time.pause()` before `present`, `play()` after `choose`). Vampire Survivors level-up picks, Hades boons, Risk of Rain stacking items.

## Loot

```ts
lootTable({ id, rolls?, entries: [{ item? | currency?, count: n | [min,max], weight }] })
ctx.game.loot.register(table)        // in onInit
ctx.game.loot.has(id) / roll(id, rng?) / grantToPlayer(userId, drops, source?)
```

Tables colocate with their domain (`entities/enemies/loot-tables.ts`, `objects/loot-tables.ts`). Entities reference them via `onDeath.drops`; chests via a `loot.open` command arg. `grantToPlayer` fills declared inventories, grants currencies, and emits `loot.granted`.

## Trade

Catalog `trade` fields drive everything — no duplicate price lists.

```ts
ctx.game.trade.canBuy(itemId, shopId, count?)   // → reason | null
ctx.game.trade.canSell(itemId, count?)
ctx.game.trade.buy(itemId, count, { shop, inventoryId })   // charge → put, rolls back on failure
ctx.game.trade.sell(itemId, count, { shop, inventoryId })
ctx.game.trade.tradableAt(shopId, allItemIds)   // derive stock from catalogs
```

## Economy and unlocks

```ts
ctx.game.economy.balance(userId, currencyId) / grant(...) / charge(...)  // charge → { reason } | null
ctx.game.unlocks.has(userId, id) / grant(userId, id) / list(userId) / tree(categoryId)
```

Catalog `requires: [unlockId]` gates validate at command time.

## `applyLoadout`

```ts
ctx.player.loadout.register(loadouts)                    // onInit
ctx.player.applyLoadout(userId, loadoutId)               // → null | { reason }
```

`LoadoutDef = { inventories?: { hotbar: [{ item, count, slot? }], … }, stats?, economy?, unlocks? }`. Application is **all-or-nothing**: every inventory put dry-runs first; any rejection applies nothing. Starter kits gate on `ctx.player.isNew`; class/respawn kits run from commands. Never scatter raw `put`/`grant` calls for a kit.

## Quests

```ts
ctx.game.quest.register(catalog)                          // onInit
canAccept / accept / abandon / canTurnIn / turnIn / grant / revoke
progress(userId, questId, objectiveId, delta)
list(userId)  /  has(questId)
bind("entity.died")        // kill objectives match objective.target === catalogId
bind("inventory.added")    // collect objectives match objective.item
```

Catalog: `{ id, title, giver?, turnIn?, requires?, objectives: [{ id, kind, target?/item?, count, partyShare? }], rewards? }`. `requires` is satisfied by a completed quest of that id or an unlock. `turnIn` applies declarative `QuestRewards` — `{ xp?: { amount }, economy?: Record<string, number>, items?: { item, count, inventory }[], unlocks?: string[], quests?: string[] }` — note `xp` takes an `{ amount }` wrapper (applied via `stats.delta` + your level-up loop) and each reward `item` names the `inventory` it fills; chained `quests` are auto-offered if acceptable. Events: `quest.accepted` / `quest.updated` / `quest.completed`. `partyShare: { radius, credit: "all" | "tagger" }` extends kill credit to nearby party members.

## Social

```ts
ctx.game.social.friends.canRequest / request / accept / remove / block / list   // persisted
ctx.game.social.party.register({ maxMembers })   // then canInvite / invite / accept / kick / leave / promote / list / membersOf
ctx.game.social.presence.get(userId)             // { online, serverId?, zoneId?, instanceId? }
```

Party is ephemeral session state (invites expire; leader leaving promotes the next member). Events: `social.friend.added`, `social.party.joined`, `social.party.left`.

## Events, feed, leaderboard

```ts
ctx.game.events.on(name, handler)      // register in onInit; typed GameEventMap
ctx.game.feed.bind(action)             // pipe an engine event into a ring buffer (default 20)
ctx.game.feed.push(action, entry)      // manual channels (chat, crafting)
ctx.game.feed.recent(action, { limit? })
ctx.game.leaderboard.track({ stat, scope: "global" | "server" | "profile" })   // onInit
ctx.game.leaderboard.increment(userId, stat, { scope, by? }) / getTop / getProfile
```

Commands mutate state and return it; **event handlers use `ctx` directly** (side effects: leaderboard, economy, scheduling) and never reassign state. One feed primitive for kill feeds, loot logs, quest updates — no per-domain feed hooks.

## Movement, pose, input

```ts
ctx.player.movement.getPose(id) / setPose(id, "crouch")   // validates catalog movement.poses
ctx.player.movement.getAim(id) / setAim(id, "ads")        // ADS = aim state + zoom modifier, not a pose
```

Poses (`standing/crouch/prone/running`) change the collision capsule (`POSE_HITBOX`); aim pairs with a `player.stats` zoom modifier on `"reticle"`. Game code reads action names only (`isDown("aim")`, `wasPressed("interact")`) — hold vs toggle is resolved by the binding config, never by raw key branches.

## Interaction — `proximityPrompt`

One primitive for all float UI: `{ radius, display, invoke }` where `display` is `{ kind: "keybind", actionId }` | `{ kind: "gauge", gaugeId }` | `{ kind: "label", text }` and `invoke` is `{ command, args? }` or null (display-only). `talkable: "dialogue_id"` on an entity expands to a talk prompt. Engine picks the nearest prompt in radius (priority tie-break). Never build per-game hint resolver chains.

## World features

Descriptors from `@jgengine/core/world/features` — config data the runner/world layer interprets:

| Feature | Use |
|---------|-----|
| `biomes({ map, zones, bounds? })` | Region atmosphere/rules layering; zones reference biome ids |
| `voxel({ seed, generate?, streaming? })` | Block worlds |
| `plots(config)` | Shared city + instanced interiors |
| `tilemap({ map })` | 2D/2.5D levels |
| `flat()` | Plain arena |
| `environment({ terrain, weather, vegetation, water, structures })` | Composable outdoor scene — terrain + rain/snow + grass + ocean + buildings. Each field takes the matching descriptor: `terrain()`, `rain()`/`snow()`, `grass()`, `ocean()`, `building()` |

`parentSpace` positions are local to that space — convert at seams only.

### Query primitives (renderer-free, for gameplay)

Pure `@jgengine/core` functions so gameplay reads the same world the shell renders — no three.js needed:

| Primitive | Answers |
|-----------|---------|
| `resolveTerrainField(terrain(...))` / `noiseField(cfg)` → `TerrainField` | `sampleHeight(x,z)`, `sampleNormal(x,z)`, `waterLevel` — ground-snap, collision, camera. `resolveGroundStep` slope-limits movement |
| `windField(cfg)` → `WindField` | `at(t)`, `atPoint(x,z,t)`, `strengthAt` — one wind source for weather sway, grass, sailing, fire spread |
| `waterSurface(cfg)` / `waterSurfaceFromDescriptor(ocean(...))` → `WaterSurface` | `height(x,z,t)`, `normal`, `displace` — buoyancy, floating, shoreline (CPU Gerstner matching the ocean shader) |
| `scatter(cfg)` → `ScatterPoint[]` | Seeded, overlap-aware point distribution — vegetation, props, lots, spawn points (`minDistance`, `avoid` rects) |
| `createRegionField({ regions })` → `RegionField` | `sampleRegion(x,z)` blends content-agnostic biomes by nearest selector — height + `tint`/`water`/`fog`/`speedMultiplier` + opaque `data`. Extends `TerrainField`, so it ground-snaps too |
| `scatterItems(field, area, layersFor)` → `ScatterInstance[]` | Region-driven content scatter — density per region, grounded, above-water/slope-aware. `pickWeighted` for weighted rolls. (vs `scatter`'s pure geometric points) |
| `buildingIndex(district)` → `BuildingIndex` | `at`/`within`/`nearest`/`isInside`/`blockers` over a generated district — placement avoidance, pathfinding |

Renderers for these descriptors live in `@jgengine/shell` (`shell/terrain`, `shell/water`, `shell/weather`, `shell/structures`).

### Physics world (optional, headless)

`physics/physicsWorld` `PhysicsWorld` is a standalone fixed-capacity rigid-body sim (SoA buffers, spatial-hash broadphase, sleeping) — **not** the `defineGame` `physics: { gravity }` field, which only configures the shell's character controller. Reach for it when a game needs many colliding dynamic bodies (piles, debris, stress scenes): `new PhysicsWorld({ capacity, bounds, … })`, `addBody({ position, halfExtents, mass? })`, then `step(dt)` per tick → `PhysicsStats`. Core owns the sim; `@jgengine/shell/world/InstancedBodies` renders its bodies. Most games never need it — the character controller covers ordinary movement.

### Spawn placement

`spawn(catalogId, { id?, position | anchor, offset?, parentSpace?, group? })` — anchor `{ kind: "entity" | "zone", id }` with offset `{ radius, pattern }` or `{ xyz }`. Catalog supplies movement/model; no behaviors on spawn.

## Multiplayer and the backend seam

**Convex is an adapter, not a dependency.** The engine owns the contracts; any backend implements them:

```ts
// @jgengine/core/runtime/transport
type GameBackend = {
  transport: GameRuntimeTransport;   // joinServer, leaveServer, runCommand
  feeds?: GameRuntimeFeeds;          // subscribeServer/Player/Feed(args, onChange) => unsubscribe
  presence?: PresenceTransport;      // multiplayer/presenceContract
};
```

`GameRuntimeFeeds` is a callback contract (`subscribe*(args, onChange) => FeedUnsubscribe`) — backend-neutral, no reactive-query shapes. Swapping backends = implement `GameBackend` + host authoritative `runCommand` elsewhere; game `commands` and `loop` do not change. Adapter configs in defineGame: `offline()`, `convex({ topology })`, `ws({ topology })`, `servers({ maxServers, slotsPerServer, minPlayersToStart, adapter })`. `topology` is exactly `"shared" | "lobbies" | "private"` — no other values exist; a persistent MMO world is `server: "persistent"` + topology `"shared"`.

**Game code never calls backend functions for gameplay verbs.** The generic server surface (no game nouns): `joinServer / leaveServer / runCommand / getServer / getPlayerProfile / getFeed / listOpenServers`, leaderboard `getTop / getProfile` (writes are internal — increments stage under `LEADERBOARD_PENDING_KEY` in server session and drain through the persistence seam on flush).

Persistence tiers (`@jgengine/core/runtime/hostPersistence` — `HostPersistence` interface, `GameServerRecord` / `PlayerProfileRecord` / `WorldChunkRecord`, `planServerPersist` / `buildHydratePlayers` / `shouldAutoSave` / `trimFeedEntries`): server session, player profile (split on join — `isNew` = no profile), world chunks, leaderboards, feeds (ring of 20). Saves store ids/counts/positions; catalogs stay live so balance patches apply retroactively. Register runnable games host-side via `createGameRuntime({ gameId, commands, loop, save })` — those server hooks are `ServerLoopHooks` (snapshot-based), distinct from the client `GameLoop<GameContext>`.

Backends:
- **Convex** — `@jgengine/convex` `createConvexBackend({ client, api, gameId, presence? })`; server functions in `convex/jgengine/*` (tables `jgGameServers`, `jgPlayerProfiles`, `jgWorldChunks`, `jgLeaderboardRows`, `jgFeedBuffers`); tick cron runs loop ticks + auto-save.
- **Node host** — `@jgengine/node` `createGameHost({ runtimes, persistence, tickMs? })` runs the authoritative loop in any JS process (in-memory snapshots, save-cadence flush); `memoryPersistence()` / `filePersistence(dir)` implement `HostPersistence`; `createGameWsServer({ host, port | server, authenticate?, poseRules? })` exposes it over WebSocket (versioned JSON protocol in `@jgengine/ws/protocol`, poses clamped server-side via `decidePoseSync`).
- **WebSocket client** — `@jgengine/ws` `createWsBackend({ url, userId })` returns a `GameBackend` (plus `pushFeedEntry`, `presenceSync` with client-side `poseSyncGate`); browser-safe, imports core only. `createHttpReads({ baseUrl, gameId })` gives plain-fetch reads (`getTop / getLeaderboardProfile / getPlayerProfile / listOpenServers`) — no live-query dependency.
- **Postgres** — `@jgengine/sql` `ensureSchema(pool)` + `sqlPersistence(pool)` implement `HostPersistence` over any pg-compatible pool (structural interface, no hard `pg` dep; tables `jg_game_servers`, `jg_player_profiles`, `jg_world_chunks`, `jg_leaderboard_rows`, `jg_feed_buffers`). `HostPersistence.savePlan` applies a whole `ServerPersistPlan` in one transaction (leaderboard drain included); hosts fall back to per-tier calls when absent.
- **Clients** — `@jgengine/shell` (`GamePlayerShell`; each client supplies its own `GameRegistry`) is the shared player: it works in Vite, Next.js, or a Tauri webview; the authoritative ws host stays a standalone process.
- **Shell multiplayer** — `resolveShellMultiplayer({ game, gameId, url?, force?, feedActions? })` connects the shell to a ws host when the game's `multiplayer` adapter is `ws(...)` (or `force` — the web dev route forces via `?ws`, desktop via `VITE_JG_WS_URL`). The shell then joins a server, pose-syncs the local player, renders remote players from the presence roster, and bridges feed actions (default `entity.died`) both ways with echo suppression — game code unchanged.

## UI — `@jgengine/react`

**Game UI/UX patterns** (frameless HUD, modals, keybinds, cooldowns, world VFX): read **`jgengine-ui`** skill — not optional.

```tsx
import { GameProvider, useSceneEntities, HealthBar } from "@jgengine/react";

<GameProvider context={ctx}>…</GameProvider>
```

Import provider, hooks, and headless components from the package root `@jgengine/react` (a barrel re-export). The per-file subpaths (`@jgengine/react/provider`, `/hooks`, `/components`) resolve the same symbols if you prefer them.

All hooks bind through the ctx change signal (`ctx.subscribe`/`ctx.version`):

| Hook | Returns |
|------|---------|
| `useGame()` / `usePlayer()` | `{ commands, events }` / `{ userId, isNew }` |
| `useSceneEntities()` / `useSceneObjects()` | live snapshots for rendering |
| `useEntityStat(instanceId, statId)` | `StatValue \| null` |
| `useTarget(fromId)` | locked instanceId \| null |
| `useInventory(id)` / `useCurrency(id)` | slots / balance |
| `useFeed({ action, limit? })` | recent entries — kills, loot, any action |
| `useQuestJournal()` | active quests + objective progress |
| `useFriends()` / `useParty()` / `usePresence(userId)` | social panels |
| `useLeaderboard(stat, { scope, limit? })` | `{ userId, value }[]` |
| `useActivePrompt(prompts)` | nearest proximity prompt |
| `useGameClock()` | clock snapshot (`now`, `paused`, `speed`, `calendar`) + `controls` (pause/play/setSpeed) |
| `useLocalPlayerDead()` / `localPlayerEntity(entities, userId)` | death-screen gating; local player from a snapshot |
| `useGameStore()` | raw store handle — escape hatch under the typed hooks |

Import hooks from `@jgengine/react/hooks`, components from `@jgengine/react/components`, `GameProvider` from `@jgengine/react/provider` (the package uses deep paths like core). For binding arbitrary engine state outside the typed hooks, `@jgengine/react/engineStore` exposes `useEngineState`, `useEngineStore`, `useEngineEvent`.

Headless components (className passthrough, no baked-in styling): `SlotGrid`, `HealthBar` (+ `fillClassName`), `CurrencyPill`, `ProximityPrompt`, `Screen`, `KeybindRow`, `DialogueBox`, `ToastStack`, `DeathScreen`, `LevelUpFlash`. Not yet implemented: `useServer`, `useDialogue`.

**Layout rule:** all **screen** positioning (`absolute`, `inset-*`, grid zones, flex regions) lives on wrappers inside `ui/GameUI.tsx` only. `ui/components/` files are content + hooks only — internal `relative`/`absolute` for bar overlays or slot badges inside a component is fine; never anchor a component to the viewport from a child file. Pass `className` to primitives for **visual** styling (colors, borders, size), not screen placement.

**Tailwind sources:** add `@source` entries in your CSS for your game source dirs plus `node_modules/@jgengine/shell` and `node_modules/@jgengine/react`. Without them, classes used in dynamically imported game code are **not generated** — layout wrappers in `GameUI.tsx` silently fail and every HUD cluster stacks in one corner.

### UI quality bar (required — not optional polish)

Headless primitives mean **you** ship the visual design. Functional wiring alone is not shippable UI.

| Requirement | Minimum |
|-------------|---------|
| **Contrast** | HUD text and borders readable on the game's scene background — never bare `text-stone-400` on near-black without a panel |
| **Scale** | Primary HUD (unit frames, hotbar slots, menu buttons) ≥ 48px touch targets; body text ≥ `text-sm` (12px); key labels never below 11px |
| **Framing** | Every persistent HUD cluster gets a panel: border, fill, shadow, or backdrop — not floating unstyled text |
| **Hotbar / slots** | Icon or color-coded tile per ability; keybind badge; hover/active state; empty slots visually distinct |
| **Unit frames** | Name + level + labeled bars with numeric values; health/mana/resource colors genre-appropriate |
| **Layout** | No overlapping anchors; reserve space for frames that appear conditionally (target, quest log) |
| **Panels** | Modal/slide panels: title, close control, section headers, consistent chrome with the HUD |
| **Feedback** | Errors, cooldowns, and empty actions surface to the player (toast, dim, shake) — not `console.warn` only |

**Genre fit:** MMO/RPG → ornate dark panels, gold accents, portrait + bars, action bar with icons. Shooter → crosshair + ammo + ability cooldowns. Tycoon → resource pills + build menus. Match the game's fantasy; do not ship debug-gray placeholders.

**Shared chrome:** extract repeated panel/slot styles into `ui/<theme>.ts` or `ui/components/<Frame>.tsx` — do not copy-paste three classes per file.

**Self-check before calling UI done:**

- [ ] Screenshot at 1080p: can you read every label without squinting?
- [ ] Hotbar identifiable in 2 seconds at game zoom?
- [ ] Panels do not overlap when target + quest + menu are all visible?
- [ ] Would a player think this is intentional art direction, not an unstyled prototype?

## Genre cheat sheet

- **Voxel/crafting**: objects for blocks/machines, `voxel()`, `object.break`/`object.placeFromInventory`.
- **Tycoon/lab**: objects + `slotInventory`, `plots()`, configure via prompt → command.
- **Shooter**: `fireProjectile`/`settleProjectile`; grenades settle → `effect({ at, radius })`; `movement.poses`/`aim` + zoom modifier; `servers({ … })` + game-owned `server.mode`; loadout classes from commands.
- **MMO/RPG**: bounded stats + `leveling()` over a game XP curve; `tabTarget` → `cycleTarget`; handlers read `getTarget`; quests bound to `entity.died`/`inventory.added`; social party + `partyShare`; `server: "persistent"`.
- **All combat games**: react to `entity.died` (feed/leaderboard/score) — never poll HP.

## Anti-patterns

| Wrong | Right |
|-------|-------|
| Player tuning in `defineGame` | Entity catalog `movement` + stats |
| `behaviors: […]` on place/spawn | Catalog entry |
| Engine `weapon.fire` / `consumable.use` / `combat.*` | `item.use` + catalog `use` → game handler |
| `ItemUseInput.to` for targets | `getTarget(from)` in handlers |
| `effect({ to })` for gunshots | `fireProjectile` + `settleProjectile` |
| Polling HP in `onTick` for kills | `entity.died` event |
| `combat.lootTable` / `loot.enemy` | `onDeath` on the entity that died |
| Hand-rolled `Math.random()` loot in commands | `lootTable()` + `ctx.game.loot.roll` |
| Hand-rolled `xpForLevel`/`levelFromXp` | `game/progression` `curve()` + `leveling()` |
| Hardcoded shop arrays | `item.trade.shops` + `tradableAt` |
| Kit seeding via scattered `put`/`grant` | `applyLoadout` |
| Per-user quest state hand-rolled | `game.quest.register` + binds |
| `useKillFeed` / per-domain feed hooks | `useFeed({ action })` |
| Raw keys in game logic | `defineGame` input actions |
| Positioning inside `ui/components/` or on primitives (`CurrencyPill className="absolute …"`) | Screen wrappers in `GameUI.tsx` only |
| Game UI classes without `@source` in host CSS | `@source` entries for your game dirs + `node_modules/@jgengine/{shell,react}` |
| One file per catalog entry / per brand | Dense `<domain>/catalog.ts` |
| Convex mutations called from game code | `commands.run` through the `GameBackend` transport |
| Half a system: quest without tracker, cooldown without sweep, keybind never shown, stub "coming soon" modal | Finish the system end to end — or cut it whole (see `jgengine-newgame`) |
| Game-side workaround for a missing engine primitive | File the gap at github.com/Noisemaker111/jgengine/issues (or PR the primitive) and cut or scope the dependent system honestly |
| Game nouns in this skill | Engine primitives + placeholder ids only |

## New-game definition of done

This is a gate, not a suggestion — every box, in one pass (workflow: **`jgengine-newgame`** skill). "Compiles and the hooks are wired" is not done; a declared system with no UI, no feedback, or no way to exercise it is not done — finish the system or cut it whole.

- [ ] `game.config.ts` (defineGame) + `index.ts` (PlayableGame) + `loop.ts` + `content.ts`
- [ ] Catalogs: `entities/<role>/catalog.ts`, `items/<domain>/catalog.ts`, `objects/catalog.ts`; loot tables beside their domain
- [ ] Entity `stats` + `receive` orders aligned on the same stat ids; `role` set (drives targeting + camera)
- [ ] `items/use-handlers.ts` registered in `onInit`; handlers read `getTarget`/`aim`, never a target input
- [ ] `loadouts.ts` + `applyLoadout` in `onNewPlayer` (gated on `isNew`)
- [ ] `quests/catalog.ts` + binds; if using xp/level, a game-owned curve fed to `game/progression` (`curve`/`leveling`) — **with their HUD/tracker, or cut**
- [ ] `onInit`: register handlers/loadouts/loot/quests, event listeners, feed binds, leaderboard tracks; `setupWorld`
- [ ] Player spawns with `id === ctx.player.userId`
- [ ] `ui/GameUI.tsx` owns layout; components use `@jgengine/react` hooks
- [ ] UI passes the **quality bar** above (contrast, scale, framing, genre fit) — not just hook wiring
- [ ] Camera tuned via `PlayableGame.camera` — defaults untouched means the feel was never checked
- [ ] HUD screenshotted over a staged `GameUiPreview` scenario and **judged by looking at the image** (see `jgengine-ui`)
- [ ] Co-located bun tests for pure game math (curves, cooldowns, spawn logic)
- [ ] Multiplayer via adapter config only; no direct backend calls

## Quick reference

```
defineGame         assets, world, physics, inventories, input, server, save, multiplayer, ui, loop
PlayableGame       { game, content, loop, GameUI } — the runner contract
GameContext        ctx.scene / ctx.game / ctx.player / ctx.item + subscribe/version
scene.object       place, remove, move, rotate
scene.entity       spawn (anchor/offset), despawn, setPose; stats; targeting; effects;
                   projectiles; spatial queries
entity.stats       get / set / delta — bounded stats (health, mana, xp, level) on instances
progression        game/progression — curve() / leveling() over bounded xp/level stats
item.use           catalog `use` → GameContext handler; no input.to
effects            drain-signed magnitudes; receive.<effect>.order; AoE = effect + at/radius/los
projectiles        willHit → fire → settle; ballistic via weapon.projectile
death              onDeath (reason-aware drops/command), entity.died, auto kill attribution + drop grant
game.loot          register / has / roll / grantToPlayer   (lootTable() = pure factory)
game.trade         canBuy / canSell / buy / sell / tradableAt
game.quest         register, accept…turnIn, bind(entity.died | inventory.added), declarative rewards
game.social        friends (persisted), party (ephemeral), presence
game.events/feed/leaderboard   on / bind+push+recent / track+increment+getTop
applyLoadout       all-or-nothing kit seeding per userId
player.movement    pose (hitboxes) + aim (zoom modifier)
proximityPrompt    { radius, display: {kind}, invoke } — one float-UI primitive
world features     biomes / voxel / plots / tilemap / flat descriptors
physics/physicsWorld  optional headless rigid-body sim (PhysicsWorld) — not the defineGame physics field
GameBackend        { transport, feeds?, presence? } — Convex is one adapter (createConvexBackend)
@jgengine/react    GameProvider + hooks + headless primitives; layout only in GameUI.tsx
```

Engine ships verbs and primitives. Your game ships nouns.
