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
| Dropped-item entity | `game/worldItem` | `WORLD_ITEM_ENTITY_NAME`, `WorldItemRecord`, `WorldItemSpawnInput`, `createWorldItemStore`, `resolveDeathDrops`, `scatterOffset`, `scatterPosition`, `selectNearestWorldItem`, `resolveWorldItemPresentation`, `RarityStyle`, `WorldItemPresentation`, `DEFAULT_RARITY`, `DEFAULT_PICKUP_RADIUS`, `DEFAULT_SCATTER` |
| Loot filter | `game/lootFilter` | `lootFilter`, `evaluateLootFilter`, `LootFilterRule`, `LootFilterCondition`, `LootFilterItem`, `LootFilterOverride` |
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
| Skill-check minigame | `interaction/skillCheck` | `evaluateSkillCheck`, `skillCheckMarkerPosition`, `skillCheckZoneAt`, `SkillCheckConfig`, `SkillCheckZone`, `SkillCheckResult` |
| QTE sequencer | `interaction/qte` | `evaluateQteSequence`, `pendingQteStep`, `qteProgress`, `QteStep`, `QteInputEvent`, `QteOutcome` |
| Item use | `item/use` | `createItemUse`, `ItemUseHandler`, `ItemUseInput`, `ItemUseResult`, `ItemUseRejection` |
| Inventory | `inventory/inventoryModel` | `InventoryLayout`, `InventorySet`, `ItemTraits` |
| Progression | `game/progression` | `curve`, `evalCurve`, `leveling`, `Curve`, `LevelingTrack`, `LevelProgress` |
| Inventory slots | `inventory/slotModel` | `createSlots`, `placeAt`, `removeAt`, `moveSlot`, `firstEmpty`, `compactSlots`, `Slot`, `SlotGrid` |
| Shaped inventory | `inventory/shapedGrid` | `createShapedGrid`, `placeShaped`, `moveShaped`, `removeShaped`, `canPlace`, `rotateFootprint`, `occupiedCells`, `gridAdjacencyQuery`, `cellFromPoint`, `ShapedGrid`, `Footprint`, `Placement`, `Rotation` |
| Card piles | `cards/cardPile` | `createCardPile`, `createCardPileState`, `draw`, `moveCards`, `shuffleZone`, `pileRng`, `CardPile`, `CardPileState`, `CardPileConfig` |
| Modifier pipeline | `cards/modifierPipeline` | `createModifierPipeline`, `runPipeline`, `Modifier`, `TraceStep`, `PipelineResult` |
| Lane board | `board/laneBoard` | `createLaneBoard`, `laneAggregate`, `laneOutcome`, `boardTotals`, `lanesWon`, `LaneBoard`, `LaneRule`, `LaneBoardConfig` |
| Timeline board | `board/timelineBoard` | `createTimelineBoard`, `tickTimeline`, `TimelineBoard`, `TimelineSlot`, `TimelineFire` |
| World geometry | `world/geometry` | `footprintAabb`, `aabbOverlap`, `snapToGrid`, `resolveMove`, `Aabb`, `Footprint` |
| Placement | `world/placement` | `validatePlacement`, `footprintObstacle`, `PlacementRules`, `PlacementResult` |
| Placement ghost | `world/placementController` | `createPlacementController`, `PlacementController`, `PlacementPreview`, `PlacementCommit`, `SnapMode`, `quarterTurnsToRotationY` |
| Connector sockets | `world/connectors` | `snapToNearest`, `socketsCompatible`, `worldSockets`, `socketWorldPosition`, `ConnectorSocket`, `ConnectorPieceDef`, `PlacedPiece`, `SnapResult` |
| Structural support | `world/support` | `solveSupport`, `toDebrisBodies`, `SupportPiece`, `SupportLink`, `SupportResult` |
| Wall/roof authoring | `world/walls` | `createWallDrawTool`, `footprintFromWalls`, `autoRoof`, `wallSegments`, `createSurfacePaint`, `WallDrawTool`, `RoofPlan`, `EnclosedFootprint` |
| Placed structures | `world/placedStructureStore` | `createPlacedStructureStore`, `PlacedStructure`, `PlacedStructureStore`, `PlacedStructureSnapshot` |
| Terraform | `world/terraform` | `createEditableTerrain`, `createTerraformBrush`, `brushWeight`, `EditableTerrain`, `TerraformBrush`, `TerraformEdit`, `TerraformMode` |
| Build permissions | `world/buildPermissions` | `createPlotPermissions`, `createContributionPool`, `PlotPermissions`, `ContributionPool`, `BuildRole`, `ContributionGoal` |
| Interiors | `world/interiors` | `createInteriors`, `Interior`, `Exterior`, `SpaceRef` |
| Game clock | `time/gameClock` | `getScaledElapsedMs`, `computeGameDay`, `SECONDS_PER_GAME_DAY` |
| Scene behaviors | `scene/behaviors` | `wander`, `patrol`, `promptable`, `talkable`, `player` |
| Capture check | `scene/captureCheck` | `captureChance`, `rollCapture`, `CaptureCheckInput` |
| Owned roster | `scene/roster` | `createRoster`, `Roster`, `RosterEntry`, `RosterCaptureOptions` |
| Economy wallet | `economy/wallet` | `createEmptyWallet`, `balance`, `grant`, `charge`, `canAfford`, `chargeAll` |
| Tech tree | `economy/techTree` | `createTechTree`, `TechTree`, `TechNodeDef`, `canUnlockTech`, `availableTech`, `unlockedRecipes`, `grantTech`, `techPrerequisitesMet` |
| Recipe graph | `crafting/recipe` | `createRecipeGraph`, `RecipeGraph`, `RecipeDef`, `RecipeItem`, `canCraft`, `craft`, `missingInputs`, `stationSatisfied`, `craftSeconds` |
| Production building | `crafting/production` | `productionBuilding`, `ProductionBuildingDef`, `createProductionState`, `tickProduction`, `feedProduction`, `drainOutput`, `advanceTransport`, `resolvePowerGrid` |
| Crop tile / farming | `crafting/crop` | `createCropField`, `CropField`, `CropDef`, `CropTileState`, `tillTile`, `plantCrop`, `waterTile`, `advanceCropDay`, `harvestCrop`, `applyToolToTiles`, `squarePattern`, `diamondPattern`, `createDayTicker` |
| Skill-check roll | `stats/rollCheck` | `rollCheck`, `CheckInput`, `CheckResult`, `CheckAdvantage` |
| Input bindings (full) | `input/actionBindings` | `hotbarSlotBindings`, `actionLabel`, `bindingLabel`, `resolveActionCommand`, `bindingMatches`, `createActionStateTracker` |
| Pointer hit | `input/pointer` | `PointerHit`, `PointerButton`, `aimToPoint`, `moveTargetFromHit`, `groundOf`, `PointerVec3` |
| Navmesh + A* | `nav/navGrid` | `createNavGrid`, `findPath`, `smoothPath`, `NavGrid`, `NavGridConfig`, `NavPoint`, `FindPathOptions` |
| Path follow | `nav/pathFollow` | `createPathFollow`, `advancePathFollow`, `pathFromNav`, `PathFollowConfig`, `PathFollowState`, `Waypoint` |
| Selection set | `scene/selection` | `createSelectionSet`, `SelectionSet`, `screenRect`, `selectWithinRect`, `rectContainsPoint`, `isMarquee`, `ScreenRect` |
| Context menu | `interaction/contextMenu` | `contextVerb`, `buildContextMenu`, `contextVerbInput`, `ContextVerb`, `ContextMenu` |
| Physics world | `physics/physicsWorld` | `PhysicsWorld`, `PhysicsWorldConfig`, `PhysicsBounds`, `PhysicsStats`, `AddBodyOptions` |
| Turn loop | `turn/turnLoop` | `createTurnLoop`, `TurnLoop`, `TurnLoopConfig`, `TurnState`, `PoolConfig`, `PoolState`, `TurnLoopSnapshot` |
| Commit modes | `turn/commit` | `createCommitController`, `CommitController`, `CommitMode`, `CommitOutcome`, `SubmittedAction` |
| Tactical grid | `tactics/tacticalGrid` | `createTacticalGrid`, `TacticalGrid`, `TacticalGridConfig`, `Tile`, `ReachableTile`, `PushResult`, `PushCollision` |
| Predictive query | `tactics/predictiveQuery` | `predictAreaEffect`, `predictArcEffect`, `predictTiles`, `PredictiveDeps`, `PredictedTarget` |
| Sim snapshot | `tactics/snapshot` | `createSnapshotStore`, `SnapshotStore`, `SnapshotSlice`, `Snapshot`, `deepClone` |
| Surfaces | `tactics/surface` | `createSurfaceLayer`, `SurfaceLayer`, `SurfaceLayerConfig`, `SurfaceKindDef`, `SurfaceReaction`, `SurfaceEvent` |
| Area targeting | `combat/effects` | `resolveAreaTargets`, `AreaTarget`, `AreaTargetInput` (shared AoE targeting behind `effect` + the predictive query) |
| Environment field | `world/envField` | `createEnvironmentField`, `EnvironmentField`, `EnvironmentSample`, `EnvironmentFieldConfig`, `OccluderRect`, `HeatSource` |
| Weather + fire | `world/weather` | `resolveWeather`, `WeatherState`, `WeatherModifier`, `WeatherModifierTable`, `ResolvedWeather`, `createFireGrid`, `FireGrid`, `FireCell`, `FireGridConfig` |
| Realm composition | `world/realm` | `composeRealm`, `RealmCard`, `RealmBase`, `ComposedRealm`, `RealmEnvironmentParams`, `SpawnTableOverride` |
| Decay meters | `survival/decayMeter` | `createDecayMeterSet`, `DecayMeterSet`, `DecayMeterConfig`, `MeterThreshold`, `DecayMeterState` |
| Status moodles | `survival/moodle` | `createMoodleStack`, `stackMoodles`, `MoodleStack`, `Moodle`, `MoodleSeverity`, `TimedMoodleInput` |
| Multi-region health | `survival/regionHealth` | `createMultiRegionHealth`, `MultiRegionHealth`, `HealthRegionConfig`, `AilmentConfig`, `RegionHealthState`, `AilmentInstance` |
| Audio contract | `audio/audioFalloff` | `computeFalloffGain`, `resolveEmitterGain`, `distance3`, `AudioFalloffConfig`, `FalloffCurve`, `SoundDef`, `AudioBusDef`, `AudioBusId` |
| Beat clock | `time/beatClock` | `createBeatClock`, `createBeatInputBuffer`, `nextBeatTime`, `BeatClock`, `BeatClockConfig`, `BeatSnapshot`, `BeatInputBuffer`, `BufferedAction` |
| Spawn director | `ai/spawnDirector` | `createSpawnDirectorState`, `advanceSpawnDirector`, `advanceWave`, `raiseAlert`, `pickSpawnPoint`, `SpawnDirectorConfig`, `WaveManifest`, `SpawnEntry`, `SpawnRequest`, `DirectorContext` |
| Threat table | `ai/threat` | `createThreatTable`, `ThreatTable`, `ThreatTableConfig`, `ThreatEntry`, `HighestThreatOptions` |
| Job board | `ai/jobBoard` | `createJobBoard`, `JobBoard`, `JobDef`, `Job`, `JobPhase`, `WorkerState`, `JobReport`, `JobTickContext` |
| Crowd flow | `ai/crowd` | `computeFlowField`, `createCrowdField`, `selectPoi`, `FlowField`, `FlowFieldOptions`, `CrowdField`, `Poi`, `SelectPoiOptions` |

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

A voxel block is an object. A rack is an object with a slot inventory. A GPU is an inventory item inside it. A player, mob, or car is an entity. A dropped-item lying on the ground is also an entity — `ctx.scene.worldItem` (position + item ref + rarity, spawned under `game/worldItem`'s `WORLD_ITEM_ENTITY_NAME`) — never a fourth bucket and never merged into inventory or object.

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

### Audio — positional emitters, listener falloff, buses

Catalog-first, no per-game audio glue. `PlayableGame.audio = { sounds: Record<string, SoundDef>, buses?: Record<string, AudioBusDef> }` declares the sound catalog (`SoundDef = { id, url, bus, gain?, loop?, positional?, falloff? }`) and mix buses (`music`/`sfx`/`ambient`/…, `AudioBusDef = { id, gain? }`) — both types from `@jgengine/core/audio/audioFalloff`. `entitySounds?: Record<string, string>` maps an entity **kind name** (same convention as `entitySprites`/`entityModels`) to a sound id: while a matching entity exists, the shell keeps a looping positional emitter on it, repositioned every frame. `objectSounds?: Record<string, string>` does the same keyed by placed-object catalog id. The pure distance→gain math (`computeFalloffGain(distance, config)`, curves `"linear" | "inverse" | "none"`) lives in core so it is unit-tested without a browser; `@jgengine/shell` (`shell/audio/audioEngine`, `shell/audio/AudioComponents`) is the only package that touches Web Audio — it owns an `AudioContext`, mounts `AudioListener` on the camera every frame, and `EntityAudioEmitters`/`ObjectAudioEmitters` drive per-instance emitter gain from the core falloff function. `GamePlayerShell` wires all of this automatically from `playable.audio`/`entitySounds`/`objectSounds` — a game never touches `AudioContext` directly.

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
                    unlocks, economy, leaderboard, roster
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

### Beat clock — BPM signal + input quantization

`@jgengine/core/time/beatClock` is a separate, purpose-built signal from `simClock` — a BPM tick generator for rhythm games (Hi-Fi Rush–style quantized combat), not a day/pause clock. `createBeatClock({ bpm, beatsPerBar? }, onBeat?)` returns a `BeatClock`: call `advance(gameDt)` from `onTick` with the same **game-time** `dt` (never wall-clock) — it fires `onBeat(beatIndex)` once per newly crossed integer beat and returns a `BeatSnapshot` (`beat`, `beatIndex`, `bar`, `beatInBar`, `phase`). `createBeatInputBuffer<T>(beatDurationSec)` is the auto-correct input buffer: `buffer(action, nowSec)` quantizes an off-beat press to fire on the next beat tick (or immediately if pressed exactly on one); `advance(nowSec)` drains and returns every action whose beat has arrived. `nextBeatTime(nowSec, beatDurationSec)` is the underlying pure quantization function. Feed a music track's actual BPM in; the buffer is what makes an early/late input still land on-beat.

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
| `rarity`, `baseType` | Read by the `worldItem` rarity render binding + loot filter when this item drops to the ground (#32/#33); `baseType` defaults to the item id when absent |

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

`entities/npcs/dialogues.ts` — `{ id, lines: [{ speaker, text } | { choices: [{ label, invoke: { command, args } | null }] }] }`. Choices invoke `quest.accept`, `trade.open`, etc. Types ship from `@jgengine/react/components` (`DialogueDef`, `DialogueChoice`, `DialogueLine`) so a game imports them rather than redeclaring — the `DialogueBox` component renders the same shape it types.

A choice may gate its branch behind a roll: `{ check: { modifier, dc, advantage? }, onSuccess?, onFailure? }` (`onSuccess`/`onFailure` default to `invoke` when omitted). `DialogueBox` rolls via `@jgengine/core/stats/rollCheck`'s `rollCheck({ modifier, dc, advantage }, rng?)` (d20 by default; `advantage`/`disadvantage` roll twice and take the high/low; a natural 1 or max-die result reports `critical`) when the player clicks a checked choice, then calls `onChoice(choice, result)`; game code resolves which command to run with `resolveDialogueInvoke(choice, result)` (also exported from `@jgengine/react/components`).

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

### Skill-checks and QTE (timed/rolled minigames)

`@jgengine/core/interaction/skillCheck` models a moving-target-zone minigame (casting/reeling, active-reload): `evaluateSkillCheck({ trackWidth, zone, markerPeriod, window, zoneDriftPerSecond? }, elapsedSeconds)` bounces a marker back and forth over `markerPeriod` seconds and returns `{ success, timedOut, markerPosition, zone }` — `zone` itself can drift when `zoneDriftPerSecond` is set. It is pure: an `item.use` handler starts a session by recording `ctx.time.now()` (game-time, so pause/fast-forward apply for free) the first time it's pressed, and evaluates `evaluateSkillCheck` against the elapsed time on the next press to lock in success/fail — the session bookkeeping (a `Map<instanceId, startedAt>`) is game-owned, same pattern as an ability-cooldown map.

`@jgengine/core/interaction/qte` sequences discrete timed prompts: `evaluateQteSequence(steps: QteStep[], inputs: QteInputEvent[])` walks `{ id, action, windowStart, windowEnd }` steps against `{ action, at }` presses and returns `{ status: "success" }` or `{ status: "fail", atStep, reason }`; `pendingQteStep`/`qteProgress` read the currently-active step and fraction complete for UI.

`@jgengine/react` ships matching headless UI: `SkillCheckBar({ config, startedAt })` and `QteTrack({ steps, startedAt })` self-tick via `requestAnimationFrame` and read `ctx.time.now()` each frame — pass `className`/`trackClassName`/`zoneClassName`/`markerClassName` (or `stepClassName`/`activeClassName`/`doneClassName` for `QteTrack`) for the moving-zone/timing visuals the UI quality bar requires.

### Capture and owned roster

`@jgengine/core/scene/captureCheck` — `captureChance({ hpFraction, catchPower, difficulty? })` returns a 0..1 probability (lower `hpFraction` and higher `catchPower` raise it, higher `difficulty` lowers it); `rollCapture(input, rng?)` rolls it. `@jgengine/core/scene/roster` — `createRoster()` is a persisted, per-owner store (`capture`, `release`, `list`, `get`, `setEquipped`, `equippedList`, `snapshot`/`hydrate`) wired onto the runtime as `ctx.game.roster`, distinct from `game.social.party` (session-ephemeral) — roster entries persist and are optionally equipped (deployed) independent of party membership.

A capture item's `item.use` handler composes the primitives instead of forking them: read the wild target's hp via `ctx.scene.entity.stats.get(target, "health")`, roll `rollCapture({ hpFraction, catchPower })`, and on success call `ctx.scene.entity.despawn(target)` + `ctx.game.roster.capture(ownerId, catalogId)` — the wild scene entity is removed and re-parented into the owner's persisted roster; the react `CaptureOdds({ chance })` component shows the live odds meter the UI quality bar requires.

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
- `onDeath.drops` tables are rolled and **granted to the killer** on player kills (emits `loot.granted`) when `onDeath.dropMode` is `"grant"` (default); `onDeath.command` runs through `ctx.game.commands`.
- `onDeath.dropMode: "world"` routes item drops through a scatter impulse into ground `worldItem`s instead of straight to inventory (currency drops still grant directly) — tune the impulse with `onDeath.scatter: { radius, minRadius?, height? }` (defaults from `game/worldItem`'s `DEFAULT_SCATTER`).
- Respawning under the same instance id revives it (it can die again). Same-id respawn must not happen synchronously inside the `entity.died` handler — defer a tick.
- `quest.bind("entity.died")` credits kill objectives from the same event; leaderboards and kill feeds hang off it too.

## Loot

```ts
lootTable({ id, rolls?, entries: [{ item? | currency?, count: n | [min,max], weight }] })
ctx.game.loot.register(table)        // in onInit
ctx.game.loot.has(id) / roll(id, rng?) / grantToPlayer(userId, drops, source?)
```

Tables colocate with their domain (`entities/enemies/loot-tables.ts`, `objects/loot-tables.ts`). Entities reference them via `onDeath.drops`; chests via a `loot.open` command arg. `grantToPlayer` fills declared inventories, grants currencies, and emits `loot.granted`.

## Card, board & shaped-inventory primitives
Pure, renderer-free structures for card, board, and deckbuilder games — they sit **beside** the slot inventory, not in place of it. All are immutable-reducer + thin-controller pairs, mirroring the two-tier ctx/factory model: use the `create*` controller in game code, reach for the exported pure functions (`draw`, `moveCards`, `tickTimeline`, `laneAggregate`, `runPipeline`, `placeShaped`) for unit tests and headless servers.
```ts
// cards/cardPile — named ordered zones (deck/hand/discard/exhaust); seeded shuffle, hand limit, reshuffle-on-empty
const pile = createCardPile({ zones: ["deck","hand","discard","exhaust"], drawFrom:"deck", handZone:"hand", discardTo:"discard", handLimit:7, reshuffleFrom:"discard" }, { deck: ids });
pile.shuffle("deck", seed);            // seeded Fisher–Yates via pileRng — deterministic under the same seed
pile.draw(5);                          // deck → hand, clamped to handLimit, reshuffles discard when deck runs dry
pile.discard(ids); pile.exhaust(ids, "exhaust");   // Slay the Spire / Balatro lifecycle
// cards/modifierPipeline — ordered { source, apply(value) → value } with an inspectable per-step trace
const score = runPipeline({ chips: 10, mult: 1 }, jokers);   // score.value + score.trace[i].{before,after,changed} for Balatro-style scoring readouts
// board/laneBoard — N lanes, per-side power aggregate + optional per-lane LaneRule modifier (Marvel Snap / Inscryption)
board.aggregate(lane, "player").total; board.outcome(lane).winner; board.lanesWon();
// board/timelineBoard — N slots each on an independent cooldown, resolving in expiry order (The Bazaar auto-battlers)
board.tick(dtMs);   // → fires[] sorted by expiry time then slot index; multiple fires per slot per tick
// inventory/shapedGrid — polyomino footprints, rotate, overlap-check, adjacency (Backpack Hero / Tetris inventory)
placeShaped(grid, { id, value, footprint }, [col,row], rotation);   // rotateFootprint / canPlace guard overlap + bounds
gridAdjacencyQuery(grid).neighborsOf(id);   // feeds synergy effects
```
Reuse the engine's seeded RNG (`pileRng`) for anything random — never `Math.random()` in game logic. The React drag/rotate/drop/snap gesture layer over these lives in `@jgengine/react` (see UI section).
## Dropped items — `worldItem` and the loot filter
A `worldItem` is a scene **entity** (position + item ref + rarity), never an inventory item or object — see the three buckets. `onDeath.dropMode: "world"` (above) is the usual producer; games can also hand-place ground loot (chests, quest drops).
ctx.scene.worldItem.spawn({ itemId, position, rarity?, baseType?, count?, affixTier?, source? })
ctx.scene.worldItem.get(instanceId) / list() / nearestInRadius(from, radius, filter?)
ctx.scene.worldItem.pickup(instanceId, userId)   // grants to inventory + despawns, emits worldItem.picked_up
Click-to-grab is engine-owned: `PlayableGame.pointer.grabWorldItems: true` makes `@jgengine/shell`'s `GamePlayerShell` resolve `pointer.worldHit()` on primary click, and — when the hit entity is a `worldItem` within `PlayableGame.worldItem.pickupRadius` (default `DEFAULT_PICKUP_RADIUS`) of the local player — calls `pickup` directly, no game command needed. `@jgengine/react`'s `useWorldItems()` / `useNearestWorldItem(radius)` drive a HUD pickup prompt off the same store.
Presentation is a two-layer render binding, both engine-owned (rendered by `@jgengine/shell`'s `WorldItems`) over **game-supplied data**:
1. **Rarity baseline** — `PlayableGame.worldItem.rarityStyle: Record<rarity, { color?, beam?, label? }>`, the game's rarity palette (Borderlands/Diablo-style beam + color coding).
2. **Loot filter overlay** (#33) — `PlayableGame.worldItem.filter: LootFilterRule[]` built with `lootFilter([{ id, when: { rarity?, baseType?, minAffixTier?, maxAffixTier? }, hide?, color?, beam?, label? }])` from `game/lootFilter`. **First matching rule wins** (PoE/Last Epoch block semantics); a rule only overrides the fields it sets, everything else falls back to the rarity baseline. `resolveWorldItemPresentation(item, rarityStyle, rules)` composes both layers and is what the shell calls per item.

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

## Crafting, tech tree & production

Four **pure** primitives (no ctx, no renderer) for survival-crafting, tech-tree, factory, and farming games. All are catalog-first: recipes, tech nodes, production rates, and crop stages are game **data** you feed the primitive — the engine owns the graph math, the timers ride `ctx.time` (game-seconds), never wall-clock.

**Recipe graph** — `@jgengine/core/crafting/recipe`. A `RecipeDef` is `{ id, inputs: RecipeItem[], outputs: RecipeItem[], seconds?, station?, stationRange?, requires? }` — inputs + optional required-workstation-in-range + time → outputs. `craft(state, layout, traits, recipe, context)` consumes inputs and produces outputs on an `InventoryState` **atomically** (rejects `missing-inputs` / `no-station` / `locked` / `no-output-space` without mutating on failure); `canCraft(...)` is the dry-run. `context = { origin?, stations?, unlocked? }`: `stationSatisfied` checks a matching placed workstation (`{ catalogId, position }`) within `stationRange` of `origin`, and `requires` gates on `unlocked(id)` (wire it to `ctx.game.unlocks.has` or the tech tree). `createRecipeGraph(defs)` indexes recipes by `producing(itemId)` / `using(itemId)` / `category`. Long crafts schedule completion with `ctx.time.after(craftSeconds(recipe), …)`.

**Tech tree** — `@jgengine/core/economy/techTree`. **Generalizes flat `unlocks`, does not duplicate it**: a `TechNodeDef extends UnlockDef` adds `requires` (prerequisite node/unlock ids), an optional `recipe` payload, and `grants` (extra flat unlock ids). A node id **is** an unlock id, so flat unlocks are just tech nodes with no `requires`. `createTechTree(defs)` wraps `createUnlocks` internally and gates grants on prerequisites: `unlock(userId, id)` refuses until every `requires` is met, `available(userId)` is the reachable frontier, `recipes(userId)` lists the recipe payloads a player has unlocked (feed them to the recipe graph). `tree(categoryId)` and per-user `has`/`list`/`snapshot`/`hydrate` mirror `unlocks`.

**Production building** — `@jgengine/core/crafting/production`. `productionBuilding({ id, inputs, outputs, rate, power?, bufferMultiplier? })` — a placed building that consumes buffered inputs and emits outputs on a timer. `rate` is production **cycles per game-second**; `tickProduction(def, state, { dt, powered? })` advances continuously through `dt` (so pause/fast-forward apply for free) and completes as many cycles as the buffer allows. `feedProduction` / `drainOutput` move items in and out of the internal buffers (a puller/conveyor). `advanceTransport(path, items, dt)` slides items along a belt and splits off `delivered`. `resolvePowerGrid(supply, consumers)` powers demands greedily until supply is exhausted — gate a building's tick on `powered`.

**Farming** — `@jgengine/core/crafting/crop`. `CropTileState` is a soil state machine (`untilled` → `tilled` → planted); `tillTile` / `plantCrop` / `waterTile` are pure tile transitions and `advanceCropDay(def, tile)` runs the **day tick** — a `CropDef { stages, regrowDays?, needsDailyWater?, harvest? }` advances a growth stage per watered day and sets `harvestable`; `harvestCrop` yields and either clears the tile or resets a regrow crop. `applyToolToTiles(tiles, center, pattern, apply)` applies a tool across a tile pattern under the cursor — `singleTile()`, `squarePattern(r)`, `diamondPattern(r)`, `rectPattern(w,d)` (watering-can / hoe AoE). `createCropField(catalog)` is the stateful wrapper over a tile grid (`till`/`plant`/`water`/`harvest`/`advanceDay`); drive `advanceDay()` off the calendar day rolling over — `createDayTicker(startDay)` reports how many days `ctx.time.calendar().day` has crossed.

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

## Pointer-driven input and navigation

The **pointer is a service, not per-game glue**. Opt in with `PlayableGame.camera` plus a `pointer` config; the shell casts the cursor into the world and dispatches commands you define — verbs stay commands, catalogs stay data.

- **`pointer.worldHit()` (shell service).** The shell raycasts the cursor to `{ point, normal, entity, object }` (a renderer-free `PointerHit` from `@jgengine/core/input/pointer`) — entity/object are the topmost instance ids under the cursor, else `null`, with a ground-plane fallback for open terrain. Consume it renderer-free: `aimToPoint(origin, point)` builds an `Aim` for `item.use`/projectiles (ground-target skillshots, twin-stick), `groundOf(hit)` drops to `[x, z]` for routing.
- **`PlayableGame.pointer`** (all optional): `moveCommand` (left-click ground → `run(cmd, { point, entity, object })`, click-to-move), `select` (left-drag marquee + single-click box-select of entities), `orderCommand` (right-click ground → `run(cmd, { selection, point })`, issue a command to the selection), `contextMenu` (right-click an entity/object → its catalog `verbs` menu), `aim` (route the primary ability's aim to the cursor), `grabWorldItems` (left-click a `worldItem` within pickup radius → engine-owned `ctx.scene.worldItem.pickup`, no game command). Enabling `select`/`moveCommand` frees the left button for verbs; orbit moves to middle-drag.
- **Selection math** (`scene/selection`) is pure and testable: `createSelectionSet()`, `screenRect`/`selectWithinRect`/`isMarquee` over projected screen points.
- **Context menu** (`interaction/contextMenu`): a catalog entity/object carries `verbs: contextVerb(label, command, args?)[]`; the shell builds the menu with `buildContextMenu` and dispatches the chosen command via `contextVerbInput` (verb args + `target`/`point`, so one handler can walk-then-act).
- **Navmesh + A\*** (`nav/navGrid`): `createNavGrid({ bounds, cellSize, diagonal? })` → mark obstacles with `blockAabb`/`setWalkable`; `findPath(grid, from, to, { clearance?, smooth? })` returns a string-pulled `[x, z]` polyline (blocked start/goal snap to the nearest walkable cell) feeding **both click-to-move and AI routing**. Renderer-free — AI and gameplay consume it without the shell.
- **`pathFollow`** (`nav/pathFollow`): the lighter authored-polyline mover for tower-defense creeps that needs no navmesh — `createPathFollow({ waypoints, speed, loop? })` + pure `advancePathFollow(config, state, dt)` (crosses multiple waypoints per tick, reports `done`/`heading`/`distanceTravelled`). Feed it a navmesh route with `pathFromNav(route, y)` and the same follower drives click-to-move.

## AI — director, threat, jobs, crowds (`ai/*`)

Renderer-free AI over the same navmesh (`findPath`/`pathFollow`) gameplay already uses. Everything ticks on **game-time `dt`** (the `ctx.time` simClock delta), so it obeys pause and fast-forward for free. Manifests, patrol routes, job definitions, threat weights, and POIs are **game data** — the primitives own the loop, the catalog owns the content.

- **Spawn director** (`ai/spawnDirector`) — budgets and escalates spawns for wave shooters and difficulty directors (Brotato, Bloons TD 6, Risk of Rain 2, Helldivers 2, Deep Rock Galactic). `createSpawnDirectorState(config)` then pure `advanceSpawnDirector(config, state, dt, { alive, players? })` → `{ state, spawns: SpawnRequest[] }`. Each `WaveManifest` grants a `budget` spent on affordable weighted `SpawnEntry`s (`cost`/`weight`/`minWave`), capped by `maxAlive`; `duration` auto-advances waves (or call `advanceWave` on "wave cleared"). Budget also trickles via `budgetPerSecond`, ramps a difficulty curve with `escalationPerSecond` (grows with sim-time), scales with `playerBudgetPerSecond`, and surges on `raiseAlert(state, amount)` decaying over time (bug-breach/dropship escalation). Seeded (`seed`) so ticks are deterministic. `pickSpawnPoint(points, players, { roll, bias })` biases placement toward (or away from) players.
- **Threat table** (`ai/threat`) — MMO/extraction aggro (Escape from Tarkov, WoW-style tanking). `createThreatTable({ decayPerSecond?, max?, forgetBelow? })`: `add(source, amount)` accumulates, `decay(dt)` bleeds off per game-second and forgets emptied sources, `highest({ current?, stickiness? })` returns the top-threat source to feed `scene/targeting` — `stickiness` (e.g. 1.1) keeps the current target until another exceeds it by that factor, so aggro doesn't jitter. `ranked()` for a threat meter.
- **Patrol** (`scene/behaviors`) — `patrol({ waypoints, speed, loop? })` is a `BehaviorDescriptor` (a route is data) that layers a fixed beat on top of `wander`; drive it with `createPathFollow`/`advancePathFollow` (lane creeps, scav patrols in Deadlock/Tarkov). Route waypoints between guard posts with `findPath`.
- **Job board** (`ai/jobBoard`) — colony/companion task assignment (Palworld stations, Schedule I employees, Sons of the Forest directives). `createJobBoard()`: `post(job)` a `JobDef` (`station`, `work` seconds, `priority`, `arriveRadius`, `repeat`), `claim(worker)` auto-pulls the highest-priority queued job or `assign(worker, jobId)` for a player order (steals it from its holder), `release` requeues. Per tick `advance(worker, dt, { distanceToStation })` runs the state machine `travelling → working → done` (path to `station(worker)` via `findPath`, occupy, run the loop), returning a `JobReport` on completion; `repeat` jobs re-run as a production loop and report each cycle.
- **Crowd flow** (`ai/crowd`) — many agents routing to their own points of interest with congestion (Two Point Museum corridors, Dave the Diver seating). `computeFlowField(grid, goals, { clearance?, congestion? })` runs Dijkstra from the goals over the walkable grid → `direction(point)`/`next(point)` steer any agent toward the nearest goal (no per-agent A*). `createCrowdField(grid)` tracks per-cell occupancy (`enter`/`leave`/`count`); pass `crowd.penalty(weight)` as the field's `congestion` to reroute flow around crowded cells each tick. `selectPoi(pois, from, { roll, occupancy?, distanceBias?, distance? })` weights a POI by appeal and proximity, skips ones at `capacity`, and accepts a `distance` override (e.g. `findPath` length) to choose over the navmesh, not line-of-sight.

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

### Environment fields, weather hooks & realm composition
Renderer-free survival/environment primitives that extend the world query layer — meters, spawn gating, and damage-in-sunlight read the same world the shell renders, all ticking on game-time `dt`.
- **Environment field** (`world/envField`): `createEnvironmentField({ dayLength, baseTemperature, nightDrop, altitudeLapse, terrain, rain, occluders, heatSources, ambientFloor, temperatureAt })` → `EnvironmentField`. Sample **temperature**, **wetness**, **lightExposure** (direct sun/sky), and **ambientLight** (spawn gating) at any `(x, z, time)` — `sample(x, z, time, y?)` returns all four plus `sheltered`. Occluders (roofs/canopy) shade sun and shelter from rain; heat sources (campfires) warm nearby positions; `sunElevation(time)` drives the day cycle. Sun damages a vampire, cold forces campfires, low ambient light spawns mobs — the field answers "am I in sun vs. shade / cold vs. warm / dark vs. lit". Pure and instantaneous; stateful build-up belongs to a decay meter reading the field.
- **Weather → gameplay** (`world/weather`): `resolveWeather(state, table)` turns a `WeatherState { kind, intensity }` into concrete `ResolvedWeather` (`grip`, `visibility`, `structureDamage`, `chill`, `ignition`, `spread`) via a game-owned `WeatherModifierTable` — multipliers interpolate from neutral by intensity, rate effects scale linearly. Read `grip`/`visibility` in movement and AI, `structureDamage` on a building tick.
- **Fire spread** (`world/weather`): `createFireGrid({ cols, rows, cellSize, origin, fuelAt, spreadRate, burnRate, wind, windBias })` → `FireGrid` is a **coarse cellular** propagation (not a fluid solver): `ignite(x, z)` / `igniteCell(col, row)`, then `step(dt, { spread, wetnessAt })` transfers heat to neighbours biased by wind, consumes fuel (`unburnt → burning → burnt`), and honours firebreaks (zero-fuel cells) and rain/wetness suppression. `resolveWeather(...).spread` feeds the step; `@jgengine/shell/weather` `FireSpreadLayer` renders the burning/scorched cells.
- **Realm composition** (`world/realm`): `composeRealm(base, cards)` assembles a played instance at runtime from a deck of modifier **cards** (Nightingale realm cards) — a `major` card is the biome base, `minor` cards layer environment param overrides, a `WeatherState`, and spawn-table edits (`set`/`add`/`scale`/`remove`). The result recomposes both the environment (into a sampleable field via `composed.environmentField(extra?)`) and the `spawnTable`, and depends on the weather hooks above to turn its `weather` into gameplay modifiers.
### Survival meters, moodles & multi-region health
The `survival/` domain — decay-over-time meters and per-part health, both feeding one stacking **moodle** status display distinct from numeric bars.
- **Decay meters** (`survival/decayMeter`): `createDecayMeterSet([{ id, max, min?, start?, rate, thresholds }])` → `DecayMeterSet`. Each named meter (hunger, thirst, oxygen, sanity, warmth, stamina) drains/recovers on `tick(dt)` at `rate`, refills from consumables/actions via `refill(id, amount)`, and raises threshold moodles (`below`/`above`). `setRateModifier(id, mult)` lets the environment drive them — read an env field, then speed warmth loss when cold or oxygen loss in a toxic biome.
- **Moodles** (`survival/moodle`): the shared status stack, distinct from raw bars. `stackMoodles(...groups)` folds meter, ailment, and buff `Moodle[]` into one worst-first display (same-id stacks add, worst severity wins). `createMoodleStack()` holds timed buffs (`add({ id, label, duration })` — Valheim's concurrent food buffs) and expires them on `tick(dt)`.
- **Multi-region health** (`survival/regionHealth`): `createMultiRegionHealth({ regions, ailments })` → `MultiRegionHealth` gives per-part pools (head/thorax/arms/legs, Tarkov/DayZ style) — `damage(regionId, amount)` scales by `vulnerability` and kills when a `vital` part empties; a stacking **ailment queue** (`applyAilment`, `tick(dt)` drains like bleed) carries per-injury treatment (`treat(itemId)` clears wounds via bandage/tourniquet/splint). `ailmentMoodles()` shares the moodle display with the meters (#78 + #90).
### Interactive building & terraform (renderer-free tools)
Turn data-only placement into the build tooling of Valheim/Enshrouded/The Sims/Fortnite/Dinkum. All pure `@jgengine/core/world`; the shell renders the ghost/tint/brush (`shell/structures/PlacementGhost`, `shell/terrain/EditableGround`, `shell/terrain/TerraformBrushCursor`) driven by `pointer.worldHit()`.
| Primitive | Answers |
|-----------|---------|
| `createPlacementController({ footprint, rules, snapMode, grid })` | Owns the ghost: `hover(hit)` → `PlacementPreview` (`valid` tint wraps `validatePlacement`), `rotate()`, `setSnapMode`/`cycleSnapMode` (`"grid"`/`"free"`/`"surface"`), `commit()` → `PlacementCommit` (`rotationY` via `quarterTurnsToRotationY`). Feed it `pointer.worldHit()`. |
| `snapToNearest(registry, placed, movingDef, cursor, { snapDistance })` | Typed connector sockets — snaps a piece's socket onto the nearest **compatible** placed socket (`socketsCompatible` = both sides `accept` the other type). `worldSockets`/`socketWorldPosition` expand a piece's sockets to world space. |
| `solveSupport(pieces, links, { maxDistance })` → `SupportResult` | Walks the connector graph to any `grounded` piece: `supported` stays, `unsupported` collapses, `distance` (hops-to-ground) drives the white→red decay tint. `toDebrisBodies(pieces, unsupported)` → `AddBodyOptions[]` for the `PhysicsWorld` debris sink. |
| `createWallDrawTool({ snap, closeTolerance })` | Drag wall points → auto-encloses when the path returns to the start (`isEnclosed`), `footprint()` derives the room `EnclosedFootprint`, `roof()` auto-fits a hip/gable/flat `RoofPlan`. `createSurfacePaint()` stores per-tile floor/wall surfaces. |
| `createPlacedStructureStore()` | Save/load a built layout: `add`/`move`/`rotate`/`remove`/`select`, `snapshot()`↔`load()` round-trip (survives reload), `subscribe` for the renderer. |
| `createEditableTerrain({ bounds, base, cellSize })` → `EditableTerrain` | A `TerrainField` you can **write back to**: `apply(edit: TerraformEdit)` raises/lowers/flattens/paints under a cursor and re-samples `sampleHeight`; `surfaceAt`, `snapshot`/`restore`, `reset`. `createTerraformBrush(field)` is the cursor tool (`raise`/`lower`/`flatten`/`paint`, radius/strength). This write-back grid is the shared terrain-edit pattern. |
| `createPlotPermissions({ plotId, ownerId, guildId? })` + `createContributionPool(goal)` | Per-plot/guild edit authority (`canEdit`/`canView`, `grant`/`revoke` `BuildRole`, guild inheritance) for co-op building, plus a pooled-resource contribution model (`contribute` caps at the goal, reports overflow, `isComplete`, per-contributor totals). |

### Physics world (optional, headless)

`physics/physicsWorld` `PhysicsWorld` is a standalone fixed-capacity rigid-body sim (SoA buffers, spatial-hash broadphase, sleeping) — **not** the `defineGame` `physics: { gravity }` field, which only configures the shell's character controller. Reach for it when a game needs many colliding dynamic bodies (piles, debris, stress scenes): `new PhysicsWorld({ capacity, bounds, … })`, `addBody({ position, halfExtents, mass? })`, then `step(dt)` per tick → `PhysicsStats`. Core owns the sim; `@jgengine/shell/world/InstancedBodies` renders its bodies. Most games never need it — the character controller covers ordinary movement.

### Spawn placement

`spawn(catalogId, { id?, position | anchor, offset?, parentSpace?, group? })` — anchor `{ kind: "entity" | "zone", id }` with offset `{ radius, pattern }` or `{ xyz }`. Catalog supplies movement/model; no behaviors on spawn.

## Turn-based & tactics (renderer-free)

Pure-`core` primitives for turn-based, grid-tactics, and card games — every one is a stateful factory with matching pure math, and every stateful piece exposes `capture()`/`restore()` so it plugs straight into the snapshot store. Overlays and tile art are the shell's/game's job; these ship the logic.

- **`turn/turnLoop` — `createTurnLoop(config)`.** An initiative machine over an ordered participant list with optional `phases` and per-turn action-economy `pools`. `advanceTurn()` walks the order (round++ on wrap) and **resets the entering participant's pools**; `advancePhase()` steps phases then rolls into the next turn. Pools are catalog data (`{ id, max, start? }`) — a single Slay-the-Spire energy pool or BG3's Action/Bonus/Movement/Reaction set, spent independently via `spend/canSpend/gain/refill`. `setOrder`/`addParticipant`/`removeParticipant` re-roll initiative without losing the active pointer.
- **`turn/commit` — `createCommitController({ mode })`**, also hosted at `turnLoop.commit`. Three commit modes: `immediate` (submit resolves now), `simultaneous` (sealed hidden submissions → `reveal()` once `allReady()`, deterministic order — Marvel Snap), and `rewind` (visible `pending()` → `rewind()` to discard or `commit()` to finalize).
- **`tactics/tacticalGrid` — `createTacticalGrid({ width, height, blocked?, diagonal? })`.** Tile occupancy (one unit per tile), `reachable(from, budget)` flood-fill (respects walls + occupants), `path(from, to)` shortest route, and `push(id, dir, { distance, chain })` discrete knockback-to-tile — chained collisions transfer momentum through struck units (Into the Breach), or stop with a recorded `PushCollision` against `wall`/`edge`/another unit.
- **`tactics/predictiveQuery` — `predictAreaEffect`/`predictArcEffect`/`predictTiles`.** A "would-this-effect-hit" query for pre-commit overlays and enemy-intent telegraphs. It reuses the **exact** AoE/LoS targeting behind `ctx.scene.entity.effect` (`combat/effects` `resolveAreaTargets`) so the predicted target set matches what the effect would actually drain — without committing any state change.
- **`tactics/snapshot` — `createSnapshotStore()`.** Cheap, repeatable turn-undo: `register(id, slice)` any `capture()/restore()` slice (the grid, surfaces, and turn loop all qualify), then `capture()/restore()` a deep-cloned snapshot or use the `push()/pop()` undo stack. `deepClone` handles objects/arrays/Map/Set so a held snapshot is immune to later mutation.
- **`tactics/surface` — `createSurfaceLayer({ kinds, reactions })`.** A stateful tile surface layer with its own `tick(dt)` (timed surfaces decay + expire) and a **combination matrix** — `reactions` is data (`{ when: [a, b], result }`), so grease+fire→fire and water+lightning→electrified are catalog entries, not hard-coded. Distinct from terrain/water; drive its tick from `onTick`'s game-time `dt`.

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
- **Voice channels** — `@jgengine/ws/voiceChannel` (`createVoiceChannelRouter(channels?)`) is a thin, coarse layer on top of the same transport/presence model: it ships the channel/falloff **routing model**, not a WebRTC media stack (no mic capture, no audio transport — pair it with a real signaling/media layer for actual voice bytes). `VoiceChannelDef = { id, positional, falloff?, gain? }` — `positional: true` channels (proximity voice) attenuate by distance using the same `@jgengine/core/audio/audioFalloff` curve as positional SFX; `positional: false` channels (walkie/crew) play at flat gain regardless of distance. A member `join`s any number of channels at once (a Sea of Thieves–style crew channel *and* nearby-ship proximity, simultaneously); `updatePosition(userId, xyz)` feeds positions (typically mirrored from `WsPresenceRow`); `setMuted(userId, bool)` silences every channel from that speaker at once. `resolveRoutes(listenerUserId)` returns one `{ fromUserId, channelId, gain }` per shared channel — the mixer plays each route independently, so the same speaker can be loud on `walkie` and near-silent on `proximity` at the same time.

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
| `useWorldItems()` / `useNearestWorldItem(radius)` | ground-loot snapshots / nearest pickup for a HUD prompt |
| `useEntityStat(instanceId, statId)` | `StatValue \| null` |
| `useTarget(fromId)` | locked instanceId \| null |
| `useInventory(id)` / `useCurrency(id)` | slots / balance |
| `useFeed({ action, limit? })` | recent entries — kills, loot, any action |
| `useQuestJournal()` | active quests + objective progress |
| `useFriends()` / `useParty()` / `usePresence(userId)` | social panels |
| `useRoster(userId?)` | owned/captured roster entries for a user (defaults to the local player) |
| `useLeaderboard(stat, { scope, limit? })` | `{ userId, value }[]` |
| `useActivePrompt(prompts)` | nearest proximity prompt |
| `useGameClock()` | clock snapshot (`now`, `paused`, `speed`, `calendar`) + `controls` (pause/play/setSpeed) |
| `useLocalPlayerDead()` / `localPlayerEntity(entities, userId)` | death-screen gating; local player from a snapshot |
| `useGameStore()` | raw store handle — escape hatch under the typed hooks |

Import hooks from `@jgengine/react/hooks`, components from `@jgengine/react/components`, `GameProvider` from `@jgengine/react/provider` (the package uses deep paths like core). For binding arbitrary engine state outside the typed hooks, `@jgengine/react/engineStore` exposes `useEngineState`, `useEngineStore`, `useEngineEvent`.

Headless components (className passthrough, no baked-in styling): `SlotGrid`, `HealthBar` (+ `fillClassName`), `CurrencyPill`, `ProximityPrompt`, `Screen`, `KeybindRow`, `DialogueBox` (+ `lineClassName`/`speakerClassName`/`choicesClassName`/`choiceClassName`/`checkClassName`, `rollCheck`-gated choices), `SkillCheckBar` (+ `trackClassName`/`zoneClassName`/`markerClassName`), `QteTrack` (+ `stepClassName`/`activeClassName`/`doneClassName`), `CaptureOdds` (+ `fillClassName`), `ToastStack`, `DeathScreen`, `LevelUpFlash`. Not yet implemented: `useServer`.

**Drag/rotate/drop/snap gesture layer** (`@jgengine/react/dragLayer`) — a 2-D UI-space gesture layer over the card/shaped-grid primitives, distinct from 3-D world drag. `useDragLayer<T>({ onDrop })` owns pointer-follow drag state (begin/rotate/setTarget/end); pair it with the headless, className-passthrough `DraggableCard` (right-click rotates), `DropZone` (reports the snapped `cellFromPoint` cell + active state), and `DragGhost` (a pointer-anchored preview). Drop resolution and overlap validation stay the game's job via `canPlace`/`placeShaped` from `inventory/shapedGrid` — Balatro hand→play drags, Backpack Hero grid placement, Slay-the-Spire card-onto-enemy targeting.

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
game.roster        capture / release / list / setEquipped — persisted owned-creature roster
game.events/feed/leaderboard   on / bind+push+recent / track+increment+getTop
applyLoadout       all-or-nothing kit seeding per userId
player.movement    pose (hitboxes) + aim (zoom modifier)
proximityPrompt    { radius, display: {kind}, invoke } — one float-UI primitive
skillCheck/qte     evaluateSkillCheck (moving zone + window) / evaluateQteSequence (timed steps)
captureCheck       captureChance / rollCapture — hp% + catchPower → probability
dialogue check     DialogueChoice.check (roll vs DC + advantage/disadvantage) → onSuccess/onFailure
world features     biomes / voxel / plots / tilemap / flat descriptors
physics/physicsWorld  optional headless rigid-body sim (PhysicsWorld) — not the defineGame physics field
audio/audioFalloff computeFalloffGain / resolveEmitterGain — pure distance→gain curve; shell plays it
time/beatClock     createBeatClock (BPM ticks) + createBeatInputBuffer (buffered action → next beat)
ws/voiceChannel    createVoiceChannelRouter — positional falloff + simultaneous non-positional channels
GameBackend        { transport, feeds?, presence? } — Convex is one adapter (createConvexBackend)
@jgengine/react    GameProvider + hooks + headless primitives; layout only in GameUI.tsx
```

Engine ships verbs and primitives. Your game ships nouns.
