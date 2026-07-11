---
name: jgengine-api
description: The engine surface. Invoke before writing or editing any game code.
---

# JGengine — API Reference

The engine ships **verbs and primitives**; your game ships **nouns** (catalogs) and thin handlers. Read this before writing `game.config.ts` or any game content. Companion skills: **`jgengine-newgame`** (master blueprint + phased build to completion) and **`jgengine-verify`** (browserless scene gate) — read them before building. The UI quality bar lives in [`reference/ui-react.md`](reference/ui-react.md); asset sourcing lives in the **Assets** section below. Don't hesitate to file issues for gaps or improvements — a missing primitive, a shell that hardcodes a choice a game should own, a doc that's wrong ([Hit a snag?](#hit-a-snag-file-an-issue) below); reporting them proactively is how the engine surface grows.

The heaviest domains live in on-demand reference modules under [`reference/`](reference/) — load one only when you're building in that domain: [`reference/combat.md`](reference/combat.md) (effects, projectiles, death, feel, abilities), [`reference/world.md`](reference/world.md) (terrain, environment, physics, vehicles, spawn), [`reference/multiplayer.md`](reference/multiplayer.md) (transport, host, persistence, presence), [`reference/ui-react.md`](reference/ui-react.md) (`@jgengine/react` hooks, headless + styled UI kits, the registry install path, and the UI quality bar), [`reference/cartridge.md`](reference/cartridge.md) (the declarative cartridge layer — a whole game as one validated config). Each domain's section below is a one-line pointer to its module.

## Packages

All published on npm, source at [github.com/Noisemaker111/jgengine](https://github.com/Noisemaker111/jgengine) (AGPL-3.0):

| Package | Role | May import |
|---------|------|------------|
| `@jgengine/core` | Everything below: defineGame, GameContext, scene, combat, game systems, movement, input, world features, runtime/transport contracts | nothing platform-specific — no React, Convex, three.js, browser |
| `@jgengine/react` | `GameProvider`, hooks, headless UI primitives | react + core |
| `@jgengine/shell` | `GamePlayerShell` — R3F canvas, camera rig library (orbit, first-person, top-down/iso, RTS, over-the-shoulder, lock-on, chase, cinematic + shake channel), input tracking, HUD mounting, `GameUiPreview`, demo game; you supply a `GameRegistry` | react + three + core |
| `@jgengine/ws` | Browser-safe `GameBackend` over a pluggable string-pipe transport (WebSocket/socket.io/WebRTC/loopback), protocol codec, HTTP reads, browser-safe authoritative host + router (`host`/`hostRouter`), and P2P (`peer`) | core |
| `@jgengine/node` | Node process bindings over `@jgengine/ws`'s host/router: `ws`-package server, socket.io server attach, file persistence (re-exports `createGameHost`/`memoryPersistence` unchanged) | node + ws + core |
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
| Runner contract | `game/playableGame` | `PlayableGame`, `GameCameraConfig`, `CameraRigKind`, `CameraProjection`, `SideScrollCameraConfig`, `TopDownCameraConfig`, `RtsCameraConfig`, `ShoulderCameraConfig`, `LockOnCameraConfig`, `ChaseCameraConfig`, `ObserverCameraConfig`, `CameraShakeConfig`, `CinematicCameraConfig`, `CameraKeyframe`, `EntitySpriteConfig` |
| Runtime ctx | `runtime/gameContext` | `createGameContext`, `GameContext`, `GameContextContent`, `GameContextItemEntry`, `GameContextEntityEntry`, `GameContextObjectEntry`, `CatalogEntityRole` |
| Behaviour lifecycle | `behaviour/behaviour` | `Behaviour` (`onAwake`→`onEnable`→`onStart`→`onUpdate(dt)`→`onDisable`→`onDestroy`), `BehaviourModule`, `createBehaviourWorld`, `BehaviourWorld`, `JGEngineRegister`, `RegisterField`, `BehaviourModules` — Unity-style lifecycle over an id-keyed node tree (`setActive` cascade, lazy update dispatch); key nodes by entity instance ids. Games augment `JGEngineRegister` via `declare module "@jgengine/core/behaviour/behaviour"` for typed `world.modules`. Three.js binding: `Object3DBehaviour`, `attachObject3D`, `useBehaviourWorld` from `@jgengine/shell/behaviour` |
| Reactive keyed store | `store/observableKeyedStore` | `createObservableKeyedStore`, `ObservableKeyedStore` — backs `ctx.game.store` |
| Scene instance role | `scene/entityStore` | `EntityRole`, `SceneEntity`, `SpawnOptions`, `EntityPose`, `EntityUpdatePatch` — `spawn(name, { meta })` attaches game-defined per-instance data that reaches `renderEntity` and every query (`entity.meta`, typed `unknown`; narrow with a cast); never encode state in id/name strings. `update` takes the friendly `SpawnPositionInput` position forms. `spawn(..., { onExisting: "replace" | "keep" })` makes remount-safe world setup idempotent instead of throwing on a reused id (same option on `object.place`) |
| Object spatial queries | `scene/objectQuery` | `raycastObjects`, `raycastObjectsAll`, `ObjectRaycastInput`, `ObjectRaycastHit` — backs `ctx.scene.object.raycast`/`raycastAll` |
| Runtime paint layer | `scene/paintLayer` | `createPaintLayer`, `PaintLayer`, `PaintStroke` — backs `ctx.scene.entity.paint` |
| Possession | `scene/possession` | `createPossession`, `Possession`, `PossessionDeps`, `PossessionSwappedEvent` |
| Form / shapeshift | `scene/form` | `createForms`, `Forms`, `FormDef`, `FormsDeps`, `FormChangedEvent` |
| Multiplayer adapters | `runtime/adapter` | `offline`, `ws`, `convex`, `socketIo`, `p2p`, `lan`, `fly`, `servers`, `MultiplayerTopology`, `ServersPoolConfig` |
| Loot | `game/lootTable` | `lootTable`, `LootTableDef`, `LootEntry`, `Drop` — `mode: "independent"` gives every entry its own `chance` per roll (classic drop lists, no filler entries); default `"weighted"` picks one entry by `weight` |
| Dropped-item entity | `game/worldItem` | `WORLD_ITEM_ENTITY_NAME`, `WorldItemRecord`, `WorldItemSpawnInput`, `createWorldItemStore`, `resolveDeathDrops`, `scatterOffset`, `scatterPosition`, `selectNearestWorldItem`, `resolveWorldItemPresentation`, `RarityStyle`, `WorldItemPresentation`, `DEFAULT_RARITY`, `DEFAULT_PICKUP_RADIUS`, `DEFAULT_SCATTER` |
| Loot filter | `game/lootFilter` | `lootFilter`, `evaluateLootFilter`, `LootFilterRule`, `LootFilterCondition`, `LootFilterItem`, `LootFilterOverride` |
| Loadout | `game/loadout` | `LoadoutDef`, `LoadoutItemEntry`, `Loadouts` |
| Cosmetic loadout | `game/cosmetics` | `createCosmetics`, `Cosmetics`, `CosmeticLoadoutDef` |
| Quest | `game/quest` | `QuestDef`, `QuestRewards`, `QuestObjective`, `QuestJournal` |
| World features | `world/features` | `WorldFeature`, `biomes`, `voxel`, `plots`, `tilemap`, `flat`, `environment`, `terrain`, `rain`, `snow`, `grass`, `ocean`, `building` |
| Voxel field | `world/voxelField` | `createVoxelField`, `VoxelField`, `VoxelCell`, `VoxelHit`, `VoxelBounds`, `VoxelFieldSummary`, `VoxelFace`, `VOXEL_FACES`, `VOXEL_FACE_NORMALS` — a chunked block lattice, distinct from the `voxel()` `WorldFeature` descriptor |
| Terrain field | `world/terrain` | `TerrainField`, `noiseField`, `resolveTerrainField`, `rollingField`, `fractalNoise`, `valueNoise`, `withNormal`, `arenaField`, `flatField`, `resolveGroundStep`, `snapToGround`, `snapEntityToGround`, `resolveTerrainPalette`, `createTerrainPaletteSampler`, `TERRAIN_MATERIAL_PALETTES` — `terrain({ heightField: (x, z) => y })` swaps in a game-authored heightfield (banded biomes, ridge walls, terraces; flatten masks still apply, render + physics both sample it); `terrain({ materialRegions: [{ center, radius, material }] })` paints per-region palettes over one field. `island({ origin, ...terrain })` + `environment({ islands })` compose disconnected landmasses at independent altitudes (`composeIslandFields`/`resolveEnvironmentField`, `ISLAND_VOID_HEIGHT` between them); `sampleSlope`/`slopeForce` derive downhill direction + steepness for gravity-roll and ski physics |
| Seeded RNG | `random/rng` | `seededRng`, `seededStreams` |
| Seed share link | `random/seedLink` | `withSeedParam`, `seedFromUrl`, `seedFromSearch`, `dailySeed`, `DEFAULT_SEED_PARAM` — encode/decode a world seed to/from a shareable URL query param; `dailySeed` is the UTC daily-run seed |
| Name generator | `random/nameGen` | `createNameGenerator`, `pickFrom`, `fillTemplate`, `NameGenerator`, `NameGeneratorOptions`, `SyllableBank` |
| Regions | `world/regions` | `createRegionField`, `isRegionField`, `RegionDef`, `RegionField`, `RegionSample` |
| Wind field | `world/wind` | `windField`, `WindField`, `WindFieldConfig`, `WindVector` |
| Wind zones | `world/windZones` | `createWindZones`, `WindZones`, `WindZoneConfig`, `WindZoneState`, `WindShiftForecast` — named discrete zones over an ambient field, each on a deterministic state schedule; `forecastShift` drives "gale in 12s" countdowns |
| Water surface | `world/water` | `waterSurface`, `waterSurfaceFromDescriptor`, `synthesizeWaves`, `WaterSurface`, `GerstnerWave` — dynamic level: `setLevel(v)` raises/drains at runtime, or `ocean({ levelAt: (t) => y })` schedules tides/floods; buoyancy and the rendered ocean track either automatically |
| Scatter | `world/scatter` | `scatter`, `scatterAabb`, `ScatterConfig`, `ScatterPoint` |
| Content scatter | `world/scatterItems` | `scatterItems`, `pickWeighted`, `ScatterLayer`, `ScatterInstance` |
| Building generator | `world/buildings` | `generateBuilding`, `generateBuildingDistrict`, `createBuildingGrid`, `GeneratedBuilding` |
| Building index | `world/buildingIndex` | `buildingIndex`, `BuildingIndex`, `BuildingHit` |
| Parametric massing | `world/massing` | `composeMassing`, `MassingSpec`, `MassingBody`, `MassingComposition`, `MassingProfile`, `MASSING_COMPOSITIONS`, `MASSING_PROFILES`, `massingBase`, `massingFloorCount`, `isVillageMassing`, `hashMassingSeed` — parametric building-massing grammar: one numeric spec (9 compositions × 6 profiles, voids/taper/articulation/branches/crown knobs) deterministically composes the box/capsule body list a city or base builder renders |
| Scene summary | `world/environmentSummary` | `summarizeEnvironment`, `resolveStructureBuildings`, `EnvironmentSummary` |
| Map markers | `world/markers` | `createMarkerSet`, `MarkerSet`, `MapMarker`, `MarkerInput`, `MarkerKindStyle`, `DEFAULT_MARKER_KINDS`, `markerKindStyle` |
| Fog of war | `world/fog` | `createFogField`, `FogField`, `FogConfig`, `FogBounds`, `FogCells` |
| Minimap math | `world/minimap` | `projectToMinimap`, `clampToMinimapEdge`, `compassBearing`, `headingToBearing`, `bearingToCardinal`, `relativeBearing`, `MinimapView` |
| Ping | `game/ping` | `createPingSystem`, `classifyPing`, `PingSystem`, `PingPayload`, `PingCategory`, `PingCategoryDef`, `DEFAULT_PING_CATEGORIES`, `PING_FEED_ACTION` |
| Proximity prompt | `interaction/proximityPrompt` | `proximityPrompt`, `ProximityPrompt`, `ProximityPromptDisplay`, `keybind`, `gauge`, `label`, `command` |
| Skill-check minigame | `interaction/skillCheck` | `evaluateSkillCheck`, `skillCheckMarkerPosition`, `skillCheckZoneAt`, `SkillCheckConfig`, `SkillCheckZone`, `SkillCheckResult` |
| QTE sequencer | `interaction/qte` | `evaluateQteSequence`, `pendingQteStep`, `qteProgress`, `QteStep`, `QteInputEvent`, `QteOutcome` |
| Item use | `item/use` | `createItemUse`, `ItemUseHandler`, `ItemUseInput`, `ItemUseResult`, `ItemUseRejection` |
| Durability | `item/durability` | `createDurability`, `wear`, `repairQuote`, `isDisabled`, `createDurabilityTracker`, `DurabilitySpec`, `DurabilityState`, `RepairSpec`, `RepairQuote` |
| Affix roller | `item/affix` | `createAffixRoller`, `seededRng`, `AffixRoller`, `RollerConfig`, `AffixPool`, `AffixDef`, `RarityTier`, `ItemBaseDef`, `RolledItem`, `RolledAffix` |
| Modular item | `item/modularItem` | `createModularItem`, `install`, `computeEffectiveStats`, `missingRequiredSlots`, `ModularItemDef`, `MountSlotDef`, `PartDef`, `InstalledPart` |
| Storage tier | `inventory/storageTier` | `partitionOnDeath`, `createDeliveryQueue`, `insureLost`, `resolveConsolation`, `tierOf`, `StorageTier`, `ContainerSnapshot`, `DeathPartition`, `DeliveryQueue`, `InsurancePolicy`, `ConsolationPolicy` |
| Contested channel | `session/contestedChannel` | `createContestedChannel`, `ContestedChannel`, `ContestedChannelConfig`, `ContestedEvent`, `ContestedPhase`, `ContestedSnapshot` |
| Round state | `session/roundState` | `createRoundState`, `lossBonusFor`, `RoundState`, `RoundConfig`, `RoundPhase`, `RoundTeam`, `RoundEvent`, `RoundEconomy`, `RoundSnapshot`, `LossBonusRule` |
| Shrinking ring | `session/ring` | `createRing`, `ringSampleAt`, `Ring`, `RingConfig`, `RingPhase`, `RingSample`, `RingHit`, `RingPoint` |
| Extraction session | `session/extraction` | `createRaidSession`, `RaidSession`, `RaidSessionConfig`, `ExtractPoint`, `ExtractionResult`, `DeathResult`, `RaidStatus` |
| Role assignment | `session/roles` | `assignRoles`, `RoleSpec` |
| Downed / revive | `combat/downed` | `createDownedState`, `DownedState`, `DownedConfig`, `DownedPhase`, `DownedEntry`, `DownedEvent` |
| Persistence scopes | `runtime/persistenceScope` | `partitionScopes`, `resetRun`, `mergeScopes`, `clearRunFields`, `applyRunReset`, `planScenarioReset`, `ScopeSchema`, `ScenarioReset`, `PersistenceScope` |
| Inventory | `inventory/inventoryModel` | `InventoryLayout`, `InventorySet`, `ItemTraits` |
| Progression | `game/progression` | `curve`, `evalCurve`, `leveling`, `Curve`, `LevelingTrack`, `LevelProgress` |
| Talent tree | `game/talents` | `createTalentTree`, `TalentTree`, `TalentTreeConfig`, `TalentNodeDef`, `TalentRequirement`, `TalentAllocateResult`, `ResolvedTalents`, `TalentSnapshot` — point spends gated by prereqs + points-in-branch, resolved once into a cached flat `StatModifierSet` + ability grants |
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
| Idle / offline catch-up | `time/idleProgress` | `idleWindow`, `linearCatchUp`, `exponentialCatchUp`, `steppedCatchUp`, `IdleWindow`, `IdleWindowConfig`, `SteppedCatchUpResult` — elapsed-real-time production/growth/decay for a game reopened after being closed |
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
| Touch controls | `input/touchScheme` | `deriveTouchScheme`, `touchCode`, `touchActionLabel`, `touchButtonKind`, `withTouchCodes`, `TouchControlsConfig`, `TouchGestureBindings`, `TouchDragBinding`, `TouchButtonSpec`, `TouchButtonKind`, `TouchScheme`, `TouchJoystick`, `TouchButton` |
| Pointer hit | `input/pointer` | `PointerHit`, `PointerButton`, `aimToPoint`, `moveTargetFromHit`, `groundOf`, `PointerVec3` |
| Navmesh + A* | `nav/navGrid` | `createNavGrid`, `findPath`, `smoothPath`, `NavGrid`, `NavGridConfig`, `NavPoint`, `FindPathOptions` |
| Path follow | `nav/pathFollow` | `createPathFollow`, `advancePathFollow`, `pathFromNav`, `PathFollowConfig`, `PathFollowState`, `Waypoint` — dt-incremental; for timetabled movers use `nav/timetable` instead |
| Route timetable | `nav/timetable` | `createRouteTimetable`, `RouteTimetable`, `RouteTimetableConfig`, `TimetableStop`, `TimetablePose` — position-at-absolute-time over an authored route with dwells; preview === live, so schedule forecasts can't drift |
| Rail/switch graph | `nav/railGraph` | `createRailGraph`, `createRailRider`, `RailGraph`, `RailRider`, `RailNode`, `RailEdge`, `RailRiderPose` — directed track segments with junction switch-throw semantics; riders take the thrown edge at every junction |
| Leader trail | `movement/leaderTrail` | `createLeaderTrail`, `LeaderTrail`, `LeaderTrailConfig`, `TrailPose` — live breadcrumb trail from a moving leader, followers placed by arc-length behind (convoys, conga lines, snake bodies) |
| Nav-grid movement constraint | `nav/navConstrain` | `constrainToNavGrid`, `NavConstrainProposed`, `NavConstrainEntity`, `NavConstrainOptions` — a standalone walkable-pass-through + wall-slide helper; adapt its `(proposed, entity)` shape to `PlayerMovementConfig.beforeCommit`'s `(frame) => [x,y,z]` with a small closure |
| Selection set | `scene/selection` | `createSelectionSet`, `SelectionSet`, `screenRect`, `selectWithinRect`, `rectContainsPoint`, `isMarquee`, `ScreenRect` |
| Context menu | `interaction/contextMenu` | `contextVerb`, `buildContextMenu`, `contextVerbInput`, `ContextVerb`, `ContextMenu` |
| Shared / group wallet | `economy/sharedWallet` | `createWalletBook`, `WalletBook`, `WalletScope`, `userScope`, `groupScope`, `balanceIn`, `grantTo`, `chargeFrom`, `contributionOf`, `contributorsOf` |
| Analog axis input | `input/axisInput` | `AxisInput`, `AxisChannel`, `AxisBindingMap`, `DRIVE_AXIS_BINDINGS`, `clampAxis`, `rampToward`, `NEUTRAL_AXIS` — an `AxisBinding.pointer` source steers the axis from `ctx.input.pointer()` via `sample(dt, isDown, pointer)` |
| Pointer-position axis | `input/pointerAxis` | `PointerAxisState`, `PointerAxisBinding`, `pointerAxisValue`, `normalizePointerToAxis` — normalized `[-1,1]` pointer position (`+y` down), published to `ctx.input.pointer()` by the shell every frame; never hand-roll a `mousemove` listener for steer-by-cursor |
| Raw control polling | `runtime/inputSnapshot` | `createInputSnapshot`, `InputSnapshot` — backs `ctx.input`, held actions + pointer position |
| Physics world | `physics/physicsWorld` | `PhysicsWorld`, `PhysicsWorldConfig`, `PhysicsBounds`, `PhysicsStats`, `AddBodyOptions` (`{ shape: "box", halfExtents }` \| `{ shape: "sphere", radius }`), `JointOptions`, `JointKind`, `CollisionEvent` |
| Ballistic collision sweep | `physics/ballisticSweep` | `createBallisticSweep`, `BallisticSweep`, `BallisticSweepHit`, `BallisticSweepOptions` |
| Tweening / easing | `anim/easing` | `Easing`, `lerp`, `clamp01`, `smoothstep`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack`, `easeOutElastic`, `tween`, `timedProgress` |
| Async data source | `data/dataSource` | `createDataSource`, `DataSource`, `DataSourceState`, `DataSourceStatus`, `DataSourceOptions`, `DataSourceClock`, `RefreshOptions` |
| JSON fetch | `data/fetchJson` | `fetchJson`, `FetchJsonOptions`, `FetchImpl`, `HttpStatusError`, `JsonParseError` |
| JSON data source | `data/jsonDataSource` | `createJsonDataSource`, `JsonDataSourceOptions` |
| Dev proxy routing | `data/devProxy` | `proxiedUrl`, `parseDevProxyTable`, `DevProxyTable`, `ProxiedUrlOptions`, `DEFAULT_DEV_PROXY_PREFIX` |
| Grid-cell world rendering | `world/gridInstances` | `resolveGridInstances`, `GridInstanceTransform` |
| Swarm LOD scheduler | `world/lod` | `createLodScheduler`, `LodScheduler`, `LodSchedulerConfig`, `LodBand` — distance→band index for render detail, `step(id, distance, dt)` throttles per-entity updates by band interval (staggered, accumulates skipped time); pairs with `@jgengine/shell/world/SpriteBatch` for 1000+ entity swarms |
| Turn loop | `turn/turnLoop` | `createTurnLoop`, `TurnLoop`, `TurnLoopConfig`, `TurnState`, `PoolConfig`, `PoolState`, `TurnLoopSnapshot` |
| Declared-action intent board | `turn/intent` | `createIntentBoard`, `IntentBoard`, `DeclaredIntent` — `declare(participantId, intent)`, `peek`, `all`, `consume`, `clear` |
| Commit modes | `turn/commit` | `createCommitController`, `CommitController`, `CommitMode`, `CommitOutcome`, `SubmittedAction` |
| Intent board | `turn/intent` | `createIntentBoard`, `IntentBoard`, `DeclaredIntent` |
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
| Beat clock | `time/beatClock` | `createBeatClock`, `createBeatInputBuffer`, `nextBeatTime`, `BeatClock`, `BeatClockConfig`, `BeatSnapshot`, `BeatInputBuffer`, `BufferedAction`, `nearestBeatDelta`, `classifyBeatAccuracy`, `inBarWindow`, `BeatAccuracyTier`, `BeatJudgement` — signed delta to the nearest beat, tiered perfect/good/miss judgement, and bar-relative open windows; never hand-roll tap classification |
| State schedule | `time/stateSchedule` | `createStateSchedule`, `StateSchedule`, `SchedulePhase`, `ScheduleSample`, `ScheduleWindow`, `nextClearWindow` — deterministic looping state timeline: `stateAt(t)` live, `nextTransitionAt` countdowns, `windowsOf`/`nextWindow` "when is it safe" forecasts |
| Spawn director | `ai/spawnDirector` | `createSpawnDirectorState`, `advanceSpawnDirector`, `advanceWave`, `raiseAlert`, `pickSpawnPoint`, `SpawnDirectorConfig`, `WaveManifest`, `SpawnEntry`, `SpawnRequest`, `DirectorContext` |
| Threat table | `ai/threat` | `createThreatTable`, `ThreatTable`, `ThreatTableConfig`, `ThreatEntry`, `HighestThreatOptions` |
| Mob combat brain | `ai/mobBrain` | `createMobBrain`, `MobBrain`, `MobBrainConfig`, `MobBrainDeps`, `MobBrainStep`, `MobBrainMode` — the wander → aggro → chase → engage → leash-evade loop over `ai/threat`; the brain returns intent (`moveTo`, `speedScale`, `inAttackRange`, `arrivedHome`), the game executes it and routes damage into `addThreat`. Never hand-roll this loop per mob |
| Boid flock | `ai/flock` | `flockSteer`, `stepFlock`, `FlockConfig`, `FlockAgent` — per-agent seek/separation/cohesion/alignment with a straggler rescue radius; the agents-to-each-other primitive beside `ai/crowd`'s agents-to-POI flow field |
| Lane selection | `ai/laneSelect` | `pickLane`, `corridorCost`, `LaneCandidate`, `PickLaneOptions` — live cost-based choice over parallel corridors with stickiness hysteresis and rng tie-breaks (racing lines, merge decisions) |
| Group-assist aggro | `ai/groupAssist` | `createAssistNetwork`, `AssistNetwork`, `AssistNetworkConfig`, `AssistMember` — propagates one member's threat gains to same-group members (optional radius + `distanceBetween` gating) so a single pull rallies the group |
| Job board | `ai/jobBoard` | `createJobBoard`, `JobBoard`, `JobDef`, `Job`, `JobPhase`, `WorkerState`, `JobReport`, `JobTickContext` |
| Crowd flow | `ai/crowd` | `computeFlowField`, `createCrowdField`, `selectPoi`, `FlowField`, `FlowFieldOptions`, `CrowdField`, `Poi`, `SelectPoiOptions` |
| Factions & reputation | `faction/factions`, `faction/reputation` | `createFactionGraph`, `createFactionRoster`, `FactionRelation`, `FactionDef`, `FactionGraph`, `FactionRoster`, `createReputationLedger`, `DEFAULT_REPUTATION_TIERS`, `tierForStanding`, `effectiveRelation`, `ReputationTier`, `ReputationLedger` |
| Physics actors | `physics/ragdoll`, `physics/carryable`, `physics/forceVolume`, `physics/spatialGrid` | `createRagdoll`, `Ragdoll`, `Carryable`, `carrySpeedMultiplier`, `ForceVolume`, `PlatformCarry`, `SpatialGrid` — for bodies outside `PhysicsWorld`, `createVolumeTrigger` gives the same enter-once membership over any `{ id, position }` list and `applyVolumeForce` the per-tick force math |
| Traversal (grapple/glide) | `physics/traversal` | `Grapple`, `GrappleConfig`, `Glide`, `GlideConfig` |
| Structural destruction | `physics/structure` | `StructureGraph`, `StructureNodeSpec`, `StructureEdgeSpec`, `StructureMaterial`, `StructureMaterialTable`, `CollapseEvent`, `DebrisConfig` |
| Destructible terrain | `world/carve` | `VoxelVolume`, `VoxelMaterial`, `VoxelMaterialTable`, `CarvableField`, `carvableTerrain`, `CarveOp`, `DepositOp`, `CraterOp`, `MoundOp`, `EMPTY_VOXEL` — `carve`/`deposit` return an edit id; `removeEdit(id)` undoes one crater/mound so capped-history destructibles evict without rebuilding |
| World cell states | `world/cellStates` | `createCellStateGrid`, `CellStateGrid`, `CellStateGridConfig`, `CellRef` — a uniform world grid whose cells escalate through an ordered state ladder on game events (pristine → cracked → burning → ruined); `escalateWhere`, `cellsIn`, `cellOf`, `version()` for dirty-checked rendering |
| Corridor collision | `nav/corridors` | `createCorridorField`, `CorridorField`, `CorridorEdge` — organic tunnel/river/road collision as a distance-to-polyline width clamp over an edge graph; `contains`/`clamp`/`distanceToBoundary` where grids and navmeshes can't express a smooth ribbon |
| Vehicle body | `physics/vehicleBody` | `createVehicleBody`, `VehicleBody`, `VehicleBodyConfig`, `WheelSpec`, `GripCurve`, `sampleGripCurve`, `DEFAULT_GRIP_CURVE` |
| Buoyant boat | `physics/buoyancy` | `createBuoyantBody`, `BuoyantBody`, `BuoyantBodyConfig` — `current: (x, z, t) => [vx, vz]` adds a water-current drift while submerged, `currentBroadside` scales it by hull orientation |
| Flow tube | `physics/flowTube` | `createFlowTube`, `combineFlowVelocity`, `FlowTube`, `FlowTubeConfig` — axial corridor of directional flow with radial core falloff and a spool scalar (fan tunnels, updraft shafts, river narrows); sample `velocityAt` and add to any integrator |
| Crash damage | `physics/damageZones` | `createDamageModel`, `DamageModel`, `DamageZoneDef`, `DamageTransition` |
| Mounts / rideables | `scene/mount` | `createMountController`, `MountController`, `MountKit`, `MountSeat`, `RideableConfig` |
| Shared-vehicle stations | `scene/stationClaim` | `createStationClaim`, `StationClaim`, `Station`, `SharedVehicleConfig`, `ClaimResult` |
| Lag compensation | `multiplayer/lagCompensation` | `createPositionHistory`, `PositionHistory`, `rewindTimestamp`, `resolveHitscan`, `raySphereDistance`, `HitscanRay`, `HitscanTarget` |
| Simultaneous commit | `multiplayer/simultaneousCommit` | `createCommitRound`, `CommitRound`, `SealedCommit`, `resolveCommits` |
| Combat-snapshot replay | `multiplayer/combatSnapshot` | `serializeBoard`, `cloneSnapshot`, `replayCombat`, `BoardSnapshot`, `SnapshotUnit`, `CombatRules`, `ReplayResult` |
| Session matchmaking | `multiplayer/matchmaking` | `browseSessions`, `findByJoinCode`, `quickMatch`, `matchesFilter`, `normalizeJoinCode`, `generateJoinCode`, `SessionListing`, `MatchFilter` |
| Auth identity | `multiplayer/identity` | `AuthSession`, `PlayerIdentity`, `sessionPlayer`, `resolveGuestSession` |
| Text chat | `game/chat`, `multiplayer/chatContract` | `createChat`, `Chat`, `ChatMessage`, `ChatChannelDef`, `whisperChannelId`, `createChatRateLimiter`, `ChatTransport`, `ChatSync`, `createLocalChatTransport` |
| Chat filter | `game/chatFilter` | `createChatFilter`, `normalizeChatText`, `ChatFilter`, `ChatFilterConfig`, `ChatFilterResult` — mask/reject blocked words (leet-normalized token match); wire via `ChatDeps.filter` (word lists are game data, the engine ships the mechanism) |
| Voice seam | `multiplayer/voiceContract` | `VoiceTransport`, `VoiceParticipant`, `VoiceRoute`, `createLocalVoiceTransport`, `createPushToTalk`, `PushToTalkMode` |
| Race state | `game/race` | `raceTrack`, `RaceTrack`, `createRaceState`, `RaceState`, `RaceEvent`, `RaceWinCondition`, `firstPastPost`, `topK`, `lastStanding`, `everyoneFinishes`, `RaceFork`, `RaceForkRoute` — `raceTrack({ forks })` splices alternate route segments (racer commits to the route whose first checkpoint it hits, rejoins the mainline; splits + `routesTaken` give route time accounting). Prefer `ctx.game.race.state(id, config)` over hand-managing a session in `ctx.game.store` — mutations and eventful updates bump `ctx.version()` |
| Personal-best records | `game/recordBook` | `createRecordBook`, `RecordBook`, `RecordBookConfig`, `RecordStorage`, `RecordDirection`, `RecordSubmission` — named numeric fields racing "lower" (times) or "higher" (scores/streaks) behind a structural key-value storage (pass `localStorage`, a test stub, or `null` for in-memory); corrupt or unavailable storage degrades to an empty book, never throws into a tick |
| Reveal query | `sensor/revealQuery` | `createRevealQuery`, `RevealQuery`, `RevealQueryOptions`, `RevealHit` |
| Vision cone | `sensor/visionCone` | `createVisionCone`, `pointInCone`, `hasWallLineOfSight`, `segmentsIntersect`, `VisionCone`, `VisionWall` — 2D angle+range guard sight with wall-segment occlusion (`world/walls` segments fit structurally); never hand-roll segment-intersection LoS |
| Hidden-state probe | `sensor/hiddenStateProbe` | `probeHiddenState`, `probeHiddenStateAll`, `HiddenStateSource`, `HiddenStateValue`, `SensorProbeOptions`, `SensorReading` |
| View-frustum sensor | `sensor/frustumSensor` | `createFrustumSensor`, `projectToView`, `framingScore`, `FrustumCamera`, `FrustumTarget`, `FrustumProjection`, `FrustumSample`, `FrustumSensor`, `FramingConfig` |
| Recording buffer | `sensor/recordingBuffer` | `createRecordingBuffer`, `RecordingBuffer`, `RecordingFrame`, `RecordingPair`, `RecordingBufferOptions` — `seekPair(t)` brackets a time with its floor and next frames for interpolated playback (ghost racers, kill-cams) |
| Replay loop | `sensor/replayLoop` | `createReplayLoop`, `interpolateRecordedPose`, `syncReplayEntity`, `ReplayLoop` — loop a finished recording as a ghost entity: modulo-time seek, frame interpolation, spawn grace, and entity reconciliation against `ctx.scene.entity` |
| Concealment scoring | `sensor/concealment` | `colorDistance`, `concealmentScore`, `createConcealmentSensor`, `ColorHex`, `ConcealmentTarget`, `ConcealmentSample`, `ConcealmentSensor` |
| Freeze violation monitor | `sensor/freezeMonitor` | `createFreezeMonitor`, `FreezeMonitor`, `FreezeSubject`, `FreezeViolation` |
| Animation SM | `combat/animationState` | `createAnimationState`, `AnimationState`, `AnimationClip`, `FramePhase`, `FrameRange`, `phasesAtFrame`, `activeRangeAtFrame`, `frameAtMs` |
| Accumulator meter | `stats/accumulatorMeter` | `createAccumulatorMeter`, `AccumulatorMeter`, `AccumulatorMeterConfig`, `MeterTier`, `MeterAddResult`, `tierAt` |
| Stagger / buildup | `combat/breakMeters` | `createStaggerMeter`, `createBuildupMeter`, `StaggerMeter`, `BuildupMeter`, `BuildupProc` |
| Attack tags | `combat/attackTags` | `attackMeta`, `AttackTag`, `AttackMeta`, `hasTag`, `isBlockable`, `isParryable`, `isDodgeable`, `counters` |
| Defensive window | `combat/defensiveWindow` | `createDefensiveWindow`, `resolveDefense`, `DefensiveWindowConfig`, `DefenseKind`, `DefenseOutcome`, `windowActiveAt`, `iframeActiveAt` |
| Combo string | `combat/comboString` | `createComboRunner`, `advanceCombo`, `ComboString`, `ComboStep`, `AdvanceComboResult` |
| Hit reaction | `combat/hitReaction` | `resolveHitReaction`, `HitReaction`, `HitReactionConfig`, `CameraShake`, `applyImpulse` |
| Telegraph | `combat/telegraph` | `pointInTelegraph`, `telegraphProgress`, `telegraphFired`, `telegraphTurnProgress`, `telegraphFiredAtTurn`, `telegraphTurnsRemaining`, `TelegraphShape`, `TelegraphConfig` |
| Dash / dodge | `movement/dash` | `createDashState`, `DashState`, `DashConfig`, `DashBurst`, `iframeActive`, `dashOffset` |
| Yaw steering | `movement/steering` | `steerYaw`, `yawForward`, `yawRight`, `YawVectorXZ` — steering right decreases yaw in the `forward = (sin yaw, cos yaw)` frame; never hand-write `heading += steer * rate * dt` |
| Ability kit | `combat/abilityKit` | `createAbilityKit`, `AbilityKit`, `AbilitySlotConfig`, `AbilitySlotSnapshot`, `AbilitySlotState`, `AbilityCastType`, `AbilityCastResult`, `AbilitySlotRetune`, `AbilityCooldownGroup`, `AbilityKitOptions` — shared cooldown groups via `createAbilityKit(slots, { groups })` + `AbilitySlotConfig.groups`; one group every slot joins is the MMO global cooldown |
| Cast bar | `combat/castRunner` | `createCastRunner`, `CastRunner`, `CastConfig`, `CastBarSnapshot`, `CastEvent` — begin/tick cast-time state with movement interruption; compose with `abilityKit` (check readiness before `begin`, `cast` on `completed`). Never hand-roll `gcdUntil`/`casting` timers |
| Resource pool | `combat/resourcePool` | `createResourcePool`, `ResourcePool`, `ResourcePoolConfig` — current/max with per-second regen/decay and spend/gain; `pool.current()` is the ability kit's `resourceAvailable` |
| Combo points | `combat/comboPoints` | `createComboPoints`, `ComboPoints`, `ComboPointsConfig` — discrete points accrued on action, expiring after a timeout from the last gain, spent in bulk |
| Event meter | `stats/eventMeter` | `createEventMeter`, `EventMeter`, `EventMeterConfig`, `EventMeterFeedResult` |
| Auto-target policy | `scene/autoTarget` | `selectAutoTarget`, `createAutoTargeter`, `AutoTargetPolicy`, `AutoTargeter`, `AutoTargetDeps` |
| Resistance matrix | `combat/resistance` | `resolveResistance`, `resistanceScale`, `ResistanceMatrix`, `ResistVerdict`, `ResistanceResult` |
| Run draft | `game/runDraft` | `createRunDraft`, `createRunModifierStack`, `RunDraft`, `RunModifierStack`, `RunModifierOffer` |
| Uniform-cell grid | `puzzle/cellGrid` | `CellGrid`, `CellRun`, `createCellGrid`, `cellAt`, `inGridBounds`, `withCell`, `withCells`, `fullRows`, `clearRows`, `collapseColumns`, `findRuns` |
| Falling piece | `puzzle/fallingPiece` | `FallingPiece`, `ShapeTable`, `LockDelayState`, `pieceCells`, `pieceCollides`, `mergePiece`, `dropDistance`, `gravityInterval`, `levelForLines`, `lineScore`, `createLockDelay`, `stepLockDelay` |
| Falling tile grid | `tactics/fallingGrid` | `createFallingGrid`, `FallingGrid`, `FallingGridConfig`, `FallingGridCell`, `FallingGridSnapshot`, `LockState`, `gravityIntervalMs`, `GravityIntervalConfig` — a generic tile-drop grid (any `TCell` payload), distinct from `puzzle/cellGrid`+`puzzle/fallingPiece`'s row-clear/shape-table pair |
| Spawn/respawn points | `game/spawnPoints` | `createSpawnPoints`, `SpawnPoints`, `SpawnPointPose`, `RespawnTarget` |
| Level sequence | `game/levelSequence` | `createLevelSequence`, `LevelSequence`, `LevelSequenceConfig`, `LevelDescriptor`, `CurrentLevel`, `LevelSequenceStatus`, `LevelSequenceProgress` |
| Devtools overlay + tunables | `devtools/devtools` | `devtools`, `createDevtools`, `tunable`, `snapshotDevtools`, `measureProfile`, `instrumentLatency`, `LONG_FRAME_MS`, `Tunable`, `TunableOptions`, `TunableAccessor`, `DevtoolsControl`, `DiscoveredEntry`, `DevtoolsOverrides`, `DevtoolsSnapshot`, `FrameStats`, `PhaseStats`, `LongFrameEvent` |
| Tunable auto-discovery | `devtools/transformTunables` | `transformTunableExports`, `tunableModuleTable`, `tunableDiscoveryPlugin`, `TunableTransformResult` |

## Getting started (new project)

Fastest path — the `jgengine` CLI scaffolds the entire canonical shape below (harness, skeleton, stub game, verify test, AGENTS.md) as a booting game:

```sh
npx jgengine create "My Game Name"   # folder → My-Game-Name; name lands in game.config / HUD / title
cd My-Game-Name && bun dev
npx jgengine doctor                  # later, if the setup drifts (version skew, unstyled HUD, shape strays)
```

Manual equivalent:

```sh
bun add @jgengine/core @jgengine/react @jgengine/shell react react-dom three three-stdlib @react-three/fiber @react-three/drei
bun add -d @tailwindcss/vite tailwindcss   # HUD styling (Vite + Tailwind v4)
```

A single game's standalone entry mounts `GameHost` (`@jgengine/shell/GameHost`) over the `game` your `game.config.ts` exports. The full standalone harness is four small files plus a script — this is exactly the shape every `Games/*` game ships, so `bun dev` plays it on its own with no host app:

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Game</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
// vite.config.ts — monorepo-aware: the alias branch only fires when this folder
// sits inside the engine repo checkout; copied anywhere else, @jgengine/* resolves
// from npm dist and the alias list is empty
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const engineSrc = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: existsSync(engineSrc("core"))
      ? [
          { find: /^@jgengine\/core\/(.*)$/, replacement: `${engineSrc("core")}/$1` },
          { find: /^@jgengine\/react\/(.*)$/, replacement: `${engineSrc("react")}/$1` },
          { find: /^@jgengine\/ws\/(.*)$/, replacement: `${engineSrc("ws")}/$1` },
          { find: /^@jgengine\/shell\/(.*)$/, replacement: `${engineSrc("shell")}/$1` },
          { find: /^@jgengine\/assets$/, replacement: `${engineSrc("assets")}/index.ts` },
          { find: /^@jgengine\/assets\/(.*)$/, replacement: `${engineSrc("assets")}/$1` },
        ]
      : [],
  },
});
```

```css
/* src/index.css */
@import "tailwindcss";
@source "../node_modules/@jgengine/react/dist";
@source "../node_modules/@jgengine/shell/dist";
```

Inside the engine repo the two `@source` lines point at `../../../packages/react/src` and `../../../packages/shell/src` instead (see any `Games/*/src/index.css`) — same file, different `@source` targets depending on where dist lives.

```tsx
// main.tsx
import "./index.css";

import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<GameHost playable={game} />);
```

Add `"dev": "vite"` to `package.json`'s `scripts` — `bun dev` then launches the game standalone.

`GameHost` resolves multiplayer itself from `game.multiplayer` (falling back to offline when the adapter can't resolve, with a console warning) — pass `multiplayer` (a prebuilt `ShellMultiplayer | null`, used as-is with no resolution attempted) or `resolveMultiplayer` (`(args) => ShellMultiplayer | null`, tried before the built-in resolver, falling back to it on `null`) only when the host app needs to supply its own session, e.g. trying several transports in sequence.

A multi-game host (a launcher, a dev registry) wires `GamePlayer` over a `GameRegistry`:

```tsx
import { GamePlayer } from "@jgengine/shell/GamePlayer";
import type { GameRegistry } from "@jgengine/shell/registry";

const games: GameRegistry = {
  "my-game": () => import("./my-game").then((m) => m.game),
};

function App() {
  return <GamePlayer gameId="my-game" registry={games} loading={<p>Loading…</p>} />;
}
```

`GamePlayer({ gameId, registry, fallbackGameId?, loading?, multiplayer? })` (`@jgengine/shell/GamePlayer`) is `GamePlayerShell` plus the lazy-load glue: it looks up `gameId` in `registry`, awaits the loader, renders `loading` (default `null`) until it resolves, then mounts `GamePlayerShell playable={...} multiplayer={...}`; switching `gameId` re-triggers the load, and an in-flight load is discarded if the id changes again first. `resolveGameLoader(registry, gameId, fallbackGameId?)` (`@jgengine/shell/registry`) is the underlying lookup — `registry[gameId] ?? registry[fallbackGameId]` — for hosts that want the fallback behavior without the component.

HUD styling is Tailwind v4 via the `index.css` above — without its `@source` lines the HUD renders unstyled. Then build the game itself under `src/` per the layout below — `src/game.config.ts` is the single entry, defined with `defineGame` from `@jgengine/shell/defineGame`.

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

Every game is one shape, enforced by `check-game-shape` (part of `check-types`): the top of `src/` holds only the skeleton, and every game-specific module, UI component, and test lives under `src/game/`. Dense files — one `catalog.ts` per domain, never one file per entry.

```
src/
  game.config.ts       single entry — export const game = defineGame({...}) from "@jgengine/shell/defineGame"
  index.tsx            barrel — export { game } from "./game.config" (+ any UI-preview scenario re-export)
  main.tsx             standalone host — mounts <GameHost playable={game}/> from "@jgengine/shell/GameHost"
  loop.ts              onInit, onNewPlayer, onTick
  world.ts             WorldFeature + PhysicsConfig (only for games that have one)
  game/
    keybinds.ts          ActionCodesMap — named actions + hotbarSlotBindings(n)
    inventories.ts       inventory declarations
    assets.ts             Render catalog
    content.ts             itemById / entityById lookups over all catalogs
    loadouts.ts             Loadout ids → items/economy/unlocks per inventory
    world/                zones.ts, setup.ts (place/spawn from onInit)
    items/                <domain>/catalog.ts + use-handlers.ts
    objects/              catalog.ts (+ loot tables beside their domain)
    entities/             players/ enemies/ npcs/ — catalog.ts per role (never actors/)
    quests/catalog.ts     when using game.quest
    progression/          curves.ts — game-owned XP curve numbers fed to game/progression
    ui/GameUI.tsx         ALL layout/positioning
    ui/components/        content-only pieces GameUI places
```

## `cartridge` — the declarative authoring entry

`@jgengine/shell/cartridge` builds a whole game from **one declarative config**: entities, spawning, weapons, progression, pickups, rules, HUD schema, and screens as data, compiled onto `defineGame` with the loop/state/UI engine-owned (`@jgengine/core/cartridge/` runtime + validator). Default to it when the game fits the cartridge archetypes — a cartridge game is ~75% smaller and nearly all data. Full surface, escape hatches, and testing pattern: **[reference/cartridge.md](reference/cartridge.md)**.

## `defineGame` — the single authoring entry

`@jgengine/shell/defineGame` is the game-authoring entry: one call in `game.config.ts` takes both engine fields (`name`, `assets`, `world`, `physics`, `inventories`, `input`, `server`, `save`, `time`, `feed`, `multiplayer`) and presentation fields (`content`, `loop`, `GameUI`, `camera`, `environment`, `WorldOverlay`, `renderEntity`, `renderObject`, `entitySprites`, `entityModels`, `objectModels`, `hotbarSelection`, `prompts`, `pointer`, `touch`, `worldHealthBars`, `audio`, `entitySounds`, `objectSounds`, `worldItem`, `shadows`, `collision`, `movement`, `devtools`) and returns a ready `PlayableGame` — no separate object to assemble. It is a thin wrapper over the core `defineGame` primitive (below) plus the `PlayableGame` runner assembly; see `packages/shell/src/defineGame.tsx` for the exact accepted fields. Never game tuning (walk speeds, damage, prompts — those live in catalogs).

**Smart defaults** — omit any of these and the call still resolves: `multiplayer` → `offline()`; `assets` → an empty asset catalog; `loop` hooks (`onInit`/`onNewPlayer`/`onTick`) → no-ops; `content` → `{}`; `GameUI` → an empty component; `camera` → third-person orbit; `feed` → 20-entry ring buffers per action; a `world` of kind `environment()` auto-renders as the backdrop with no `environment` component supplied — a non-`environment()` world (`flat()`, `voxel()`, …) still needs the game to hand it one.

```ts
// game.config.ts — imports only, nothing inline
import { defineGame } from "@jgengine/shell/defineGame";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { GameUI } from "./game/ui/GameUI";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { loop } from "./loop";
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
  multiplayer: offline(),          // or ws({ topology, url? }) / fly({ app }) / convex({ topology }) / socketIo({ topology, url? }) / p2p({ room? }) / lan({ port?, path? }) / servers({ …, adapter }) — defaults to offline()
  content,
  loop,                            // Partial<GameLoop<GameContext>> — missing hooks default to no-ops
  GameUI,
  camera: { perspective: "third" },  // optional — this is the default
});
```

```ts
// game/keybinds.ts — named actions + generated hotbar slots; one key, one action
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
// game/inventories.ts
import type { InventoryDeclaration } from "@jgengine/core/game/defineGame";
export const inventories: Record<string, InventoryDeclaration> = {
  hotbar: { slots: 9, hud: "hotbar" },
  backpack: { slots: 28, traits: itemTraits },
  equipment: { slots: 4, accepts: ["weapon", "armor"], applyModifiers: true },
};

// world.ts — top of src/, not under game/
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { biomes, type WorldFeature } from "@jgengine/core/world/features";
export const world: WorldFeature = biomes({ map: "world/biomes", zones: "world/zones" });
export const physics: PhysicsConfig = { gravity: -32 };
```

- `PhysicsConfig.gravity`/`jumpVelocity` tune the shell's built-in walk controller's fall/jump feel (defaults ~`-24`/`7.1`) — the only two levers on gravity and jump height; everything else about movement (speed, poses) stays catalog `movement` fields.
- Input bindings are string arrays (hold semantics) or `{ hold, toggle, repeatMs? }` for the same verb. `repeatMs` turns a held action into an auto-repeat fire (build-mode place-on-drag, rapid-fire without a separate `wasPressed`/interval combo in game code) — the shell refires the command every `repeatMs` while the binding stays down, on top of its normal press-edge fire.
- **Keybind → command convention.** The shell fires a command for any bound action that isn't reserved: pressing an action runs a command of the **same name** if one is defined, else a `ui.<action>` fallback (so `openBackpack` → `ui.openBackpack`). Just declare the binding and a matching command — no per-game `keydown` listener. Reserved actions the shell consumes natively and never routes to a command: `moveForward/moveBack/moveLeft/moveRight`, `turnLeft/turnRight`, `sprint`, `jump`, `tabTarget`, `clearTarget`, `useAbility`, `interact`, and any `hotbarSlotN`/`slotN`. `tabTarget`/`clearTarget` run `target.cycle`/`target.clear` (native `cycleTarget`/`setTarget` fallback).
- **`interact`** is special: pressing it resolves the active proximity prompt from the `prompts` field of `defineGame({...})` and runs that prompt's `invoke` command. A prompt with `invoke: null` is display-only and does nothing on the key.
- UI keybind badges derive from `keybinds` via `actionLabel(keybinds, "openBackpack")` — `bindingLabel` maps codes to short labels (`Digit1`→`1`, `KeyB`→`B`, `mouse0`→`LMB`, `Escape`→`Esc`). Never hardcode label strings; they drift the moment a binding changes.
- `server.mode` is a string your loop/commands interpret — the engine ships no gamemode presets.
- Never in defineGame: player tuning, catalog helpers (`defineItems` etc.), game nouns, behaviors, prompts, or inline binding/inventory/world blobs. The one exception is `physics.gravity`/`physics.jumpVelocity` — global controller tuning, not a catalog value (see "Controller kinematics" below).
- `assets` may be omitted for a game with no models (a HUD-only card/board game, say) — `defineGame` injects an empty catalog, so `GameDefinition.assets` is always present downstream with no per-caller `?.` checks.
- `devtools` defaults to `true` — every game gets the F2-toggled debug overlay (Perf/Tune/Logs/Net/Keys) for free, and every top-level `export const` scalar (literal or derived) and every exported table of numbers/booleans/colors under `src/` — nested objects and arrays included — is auto-discovered into the Tune tab with zero game code, alongside the playable's own physics/camera/movement/world config and the engine's movement defaults; set `false` to disable the toggle entirely. See "Devtools — F2 overlay and tunables" below.

### `@jgengine/core/game/defineGame` — the underlying primitive

The low-level engine boot call the shell `defineGame` composes internally: engine fields only (`name`, `assets`, `world`, `physics`, `inventories`, `input`, `server`, `save`, `time`, `feed`, `multiplayer`, `loop`) — no `content`/`GameUI`/`camera`/render fields, those are the shell layer's job.

```ts
import { defineGame as defineEngineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";

const game = defineEngineGame({
  name: "My Game",
  assets, world, physics, inventories,
  input: keybinds,
  server: "persistent",
  save: { auto: "5m", scope: "player+chunks" },
  multiplayer: offline(),
  loop,                            // GameLoop<GameContext>
});
```

Reach for this directly only outside a React host — a headless server, a non-shell runner; a browser game authors through `@jgengine/shell/defineGame` above, which calls this and returns the `PlayableGame` a runner needs.

## `PlayableGame` — how a game plugs into a runner

The type `@jgengine/shell/defineGame` returns and every runner (`GameHost`, `GamePlayerShell`) consumes. A game never builds this object by hand — `defineGame({...})` assembles it from the merged config. Source type at `@jgengine/core/game/playableGame`:

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

Optional render/world fields the shell also reads: `entitySprites` / `entityModels` (billboards / GLBs keyed by entity kind), `objectModels` (GLBs keyed by object catalog id), `renderObject` (per-object visual override — return your own mesh for a placed object and the shell still positions it; falls back to `objectModels` → colored box), `WorldOverlay` (canvas-layer VFX), `environment` (canvas-layer scenery — ground/sky/structures; when set, replaces the default ground plane + debug grid + rock field), `camera`, `shadows` (cast/receive shadows across the R3F canvas; default true), and `worldHealthBars` (`boolean | { statId?, roles? }` — `roles` restricts bars to entities whose catalog `role` is in the given `CatalogEntityRole` list, e.g. skip friendly NPCs). A model value is a catalog id (`string`, resolved via `game.assets`) or an inline `ModelConfig { url, scale?, y?, anchor?, dims?, material?, animation? }` (`material` overrides color/metalness/roughness/emissive/emissiveIntensity on the cloned mesh, leaving shared GLTF caches untouched; `animation?: { clip?, loop?, timeScale?, paused?, time? }` plays a GLTF clip — `clip` defaults to the first clip, `loop` defaults true — and `paused: true` + `time: <seconds>` holds the rig on one fixed frame, a pose library for inventory previews or held cutscene poses). Catalog-resolved models carry measured `dims` (`catalog.resolve(id).dims = { footprint:{w,d}, center:{x,z}, minY }`); with the default `anchor: "center"` the shell centers the footprint on the placement point and ground-snaps `minY` to it, so corner-pivot kit models place correctly with no per-game pivot math. Applies through both `entityModels` and `objectModels`.

`renderEntity?: (entity: SceneEntity) => ReactNode` and `renderObject?: (object: SceneObject) => ReactNode` hand you the mesh for one entity/object while the shell still positions it and keeps it tagged for picking/selection; return null/undefined to fall through to model → sprite/box. `objectStyles?: Record<catalogId, { color?, opacity?, hidden? }>` styles the default colored-box object render — `color` overrides the hash color, `opacity < 1` sets transparent, `hidden` skips the mesh but keeps the picking tag.

**Presentation mode.** `PlayableGame.presentation`: `"3d"` (default) mounts the canvas, camera rig, and pointer; `"hud"` mounts none of that — the game is `GameUI` plus the command/input loop, for board/card/menu games that need no 3D camera at all.

**Auto environment.** When `world` is an `environment()` descriptor and `PlayableGame.environment` is unset, the shell renders that descriptor as the backdrop automatically — no manual `environment` wiring needed for the common case. Set `environment` explicitly only to override that default (a custom canvas component always wins). The same auto-render convention covers grid-cell worlds (`biomes`/`voxel`/`plots`/`tilemap`) — see "World features" below.

**Lighting and backdrop.** `PlayableGame.lighting` (`LightingConfig`, `@jgengine/core/game/playableGame`) replaces the shell's hardcoded ambient/directional default when present, regardless of world kind: `ambient?: { color?, intensity? }`, `directional?: { color?, intensity?, position, castShadow? }[]`, `hemisphere?: { skyColor?, groundColor?, intensity? }`. `PlayableGame.backdrop` (`BackdropConfig`) is a generic background/sky/fog for **any** world kind, including a custom `environment` component: `background?: string` (CSS color), `sky?: SkyEnvironmentConfig` (same descriptor `environment()`'s `sky` field takes), `fog?: { color?, near?, far?, density? }` (`density` set switches to exponential `FogExp2` and `near`/`far` are ignored). Both are optional and additive to whatever the world/`environment` renderer already draws.

**Player movement tuning** — the `movement` field (`PlayerMovementConfig`) tunes the shell's local-player walk controller beyond `physics.gravity`/`jumpVelocity`: `mode` (`"free"` camera-relative default, `"axis"` locks travel to one world `axis`, `"grid"` snaps each committed step to `cellSize` centers), `collideObjects` (collide against placed scene objects as unit-box AABBs even without `collision.voxel`), and `beforeCommit(frame)` — an escape hatch called each frame with `{ entityId, current, next, dt }` that can return a replacement `[x, y, z]` to constrain or redirect the step (rails, bounds, custom collision) before it commits and before `onTick` runs.

The runner boots `createGameContext({ definition, content, player: { userId, isNew } })`, calls `loop.onInit(ctx)` then `loop.onNewPlayer(ctx)`, and drives `loop.onTick(ctx, dt)` per frame. **Convention: `onNewPlayer` spawns the player entity with `id === ctx.player.userId`** — bounded stats, targeting, and kill attribution key off that.

### Object spatial queries, entity patching, and surface sampling

```ts
ctx.scene.object.at(x, y, z)                                   // cell lookup, cell size 1, most-recent wins
ctx.scene.object.inBox(min, max)                                // inclusive AABB query
ctx.scene.object.raycast({ origin, direction, maxDistance, halfExtents?, filter? })   // → nearest hit or null
ctx.scene.object.raycastAll({ origin, direction, maxDistance, halfExtents?, filter? }) // → hits, nearest-first
ctx.scene.entity.update(id, patch)   // name/position/rotations/role/movement/behaviors/meta; false for unknown id
```

Placed objects are unit boxes (half-extents `[0.5, 0.5, 0.5]`) centered on position, matching the shell's default render, so `raycast`/`raycastAll` (`scene/objectQuery`) match what a player sees. `entity.update` notifies subscribers and bumps `ctx.version()` the same as `spawn`/`despawn`/`setPose` — it's the general-purpose patch the more specific methods (`setPose`, `form.shapeshift`, `possession.possess`) build on.

`ctx.scene.object.place(catalogId, x, y, z, { instanceId?, parentSpace?, rotation?, visual? })` takes an optional `visual: ObjectVisual` (`@jgengine/core/scene/objectStore`) — `{ scale?: number | [x,y,z], color?, opacity? }` — a per-instance render override independent of the catalog entry; `ctx.scene.object.setVisual(instanceId, visual | undefined)` changes it after placement (`undefined` clears back to the catalog default). Distinct from `objectStyles` on `PlayableGame` (styles a catalog id for every instance); `visual`/`setVisual` targets one placed instance (a damaged crate, a dyed banner, a resized prop).

`pointerService.worldHitCenter()` (shell) casts from the viewport center regardless of cursor presence (pointer-lock aim) — combine with `pointer.worldHit()` (cursor-driven) to support both mouse-look and free-cursor games from the same probe. `PointerHit` also carries an optional `uv?: { u, v }` on UV-mapped mesh hits (absent for the ground fallback), `material?: { color, metalness?, roughness? } | null` sampled off the hit mesh's `MeshStandardMaterial` (`null`/unset for non-standard materials, e.g. the ground plane) — combine `uv` + `material` for paint tools, decals, and material-aware interaction — and `instanceId?: number`, the hit index when the intersected mesh is a `THREE.InstancedMesh` (grid-world cells, `InstancedBodies` debris, any instanced render), absent otherwise.

**Runtime paint layer** (`ctx.scene.entity.paint`, backed by `scene/paintLayer`) — a `PaintLayer` keyed by instance id (entity or object): `paint(instanceId, { u, v, radius, color })`, `strokes(instanceId)`, `clear(instanceId?)`, `version(instanceId)` (bumps per paint/clear), `subscribe(listener)`. The shell auto-renders painted instances through a lazily-created 512×512 canvas texture kept in sync — no per-game render wiring. Clearing refills with the material's base color; the original texture pixels are not restored.

### Audio — positional emitters, listener falloff, buses
Catalog-first, no per-game audio glue. The `audio` field of `defineGame({...})` — `{ sounds: Record<string, SoundDef>, buses?: Record<string, AudioBusDef> }` — declares the sound catalog (`SoundDef = { id, url, bus, gain?, loop?, positional?, falloff? }`) and mix buses (`music`/`sfx`/`ambient`/…, `AudioBusDef = { id, gain? }`) — both types from `@jgengine/core/audio/audioFalloff`. `entitySounds?: Record<string, string>` maps an entity **kind name** (same convention as `entitySprites`/`entityModels`) to a sound id: while a matching entity exists, the shell keeps a looping positional emitter on it, repositioned every frame. `objectSounds?: Record<string, string>` does the same keyed by placed-object catalog id. The pure distance→gain math (`computeFalloffGain(distance, config)`, curves `"linear" | "inverse" | "none"`) lives in core so it is unit-tested without a browser; `@jgengine/shell` (`shell/audio/audioEngine`, `shell/audio/AudioComponents`) is the only package that touches Web Audio — it owns an `AudioContext`, mounts `AudioListener` on the camera every frame, and `EntityAudioEmitters`/`ObjectAudioEmitters` drive per-instance emitter gain from the core falloff function. `GamePlayerShell` wires all of this automatically from `playable.audio`/`entitySounds`/`objectSounds` — a game never touches `AudioContext` directly.
### Camera rigs (`camera` field of `defineGame({...})`)
The shell ships a **rig library**; a game picks and tunes one through `camera` config, never by writing camera positions from `onTick`. Select with `camera.rig` (or the `perspective: "third" | "first"` shorthand) — or by config block alone (#207.8): supplying `camera.<rig>` selects that rig with no redundant `rig` field, checked in the table's order; an explicit `rig` wins when several blocks are present:
| `rig` | For | Key config (`camera.<rig>`) |
|-------|-----|------------------------------|
| `orbit` (default) | Third-person chase | `initialDistance`, `targetHeight`, `min/maxPolarAngle`, drag/zoom |
| `first` | FPS mouse-look | `firstPerson: { eyeHeight, sensitivity, maxPitch, reticle, viewmodel }` |
| `topDown` | ARPG iso / top-down (Diablo IV, Hades II) | `topDown: { height, pitch, yaw, followSmoothing, zoom }` — decoupled follow; `pitch` is camera elevation (PI/2 = straight down, near 0 = grazing and boom-distance blows up past `frustum.far`) |
| `rts` | Free-pan / edge-scroll (The Sims, Manor Lords) | `rts: { panSpeed, edgeScroll, rotateSpeed, bounds, start, pan }` — `pan: false` turns it into a static backdrop camera: no WASD/arrow pan, no edge-scroll, no Q/E rotate, no wheel zoom, still re-centers on `followEntityId` if one resolves |
| `shoulder` | Over-the-shoulder (Helldivers 2, Remnant II) | `shoulder: { shoulderOffset, distance, ads, side }` — ADS + shoulder-swap (V) |
| `lockOn` | Souls-like strafe (Elden Ring) | `lockOn: { targetEntityId?, distance, framingBias, yawSmoothing }` — yaw binds to player→target; WASD becomes strafe |
| `chase` | Vehicle chase (Forza, Rocket League) | `chase: { distance, springDamping, fov: { base, max, speedForMax }, shakePerSpeed, lead: { time, max }, bank: { perYawRate, max, damping }, view: "chase"|"cockpit"|"hood"|"rear" }` — `lead` aims ahead of the target along its velocity, `bank` rolls the camera into turns, and `ctx.camera.setChaseTuning(patch)` retunes any of it at runtime |
| `sideScroll` | Fixed lateral follow — 2.5D platformer/beat-'em-up | `sideScroll: { distance, height, lookHeight, axis: "x"\|"z", followSmoothing, fov }` — reads no player input, follows like the other follow rigs (defaults to the local player) |
| `observer` | Detached spectator/photo/kill-cam (#120) | `observer: { bind: { kind: "entity", entityId } \| { kind: "point", position }, distance, height, orbitSpeed }` — reads no player input, auto-orbits the bound subject |
| `inspection` | Model-viewer / data-viz orbit (#207.7) | `inspection: { anchor: "target"\|"cursor"\|"center", target, initialDistance, initialPosition, min/maxDistance, min/maxPolarAngle, pan, rotateSpeed, zoomSpeed, dampingFactor }` — left-drag orbit, middle/right-drag pan (pan defaults on for this rig only), scroll zoom toward the anchor (`cursor` = zoom-to-cursor); orbits a fixed `target`, never reads player/entity state |
| `none` | No camera rig mounted | HUD-only presentations or a game that manages its own camera; see `presentation: "hud"` below |
**Frustum:** `camera.frustum: { fov?, near?, far? }` overrides the canvas camera; `far` defaults to 300, so any world whose content spans more than a few hundred units must raise it or distant settlements/terrain silently clip out of view. **Every rig accepts `followEntityId: null`** so avatar-less games (city-builders, card games, auto-battlers) still mount a camera. Leave `followEntityId` unset and the shell defaults it to `ctx.player.possession.active(userId)` every frame, so a possession swap (party control-swap, BG3-style) or a form's mesh/camera-relevant change re-targets the camera automatically — set it explicitly only to override that default. **Shake / trauma (#28):** every rig reads a shake channel; feed it from anywhere with `import { cameraShake } from "@jgengine/shell/camera"` — `cameraShake(amplitude, decayPerSecond?)` (amplitude 0..1) — or from React via `useCameraShake()`. Tune with `camera.shake: { maxOffset, maxRoll, decayPerSecond, exponent, frequency }`. **Cinematic (#29):** set `camera.cinematic: { keyframes: [{ position, lookAt, fov?, duration?, ease? }], loop? }` to play a scripted path over the active rig, and `camera.transitionSeconds` cross-fades the camera when the rig changes so mode swaps don't hard-cut. The pure rig math (shake decay, spring-arm, speed→FOV, offset/strafe, keyframe lerp) is exported from `@jgengine/shell/camera` for testing.

## `GameContext` — the ctx surface

`createGameContext` (in `@jgengine/core/runtime/gameContext`) wires every system:

```
ctx.scene.object    place, remove, move, rotate, get, list, subscribe,
                    at, inBox, raycast, raycastAll, catalog
ctx.scene.entity    spawn, despawn, setPose, update, get, list,
                    stats.{get,set,delta}, setTarget, getTarget, cycleTarget,
                    canReceive, preview, effect, paint,
                    willHitProjectile, fireProjectile, settleProjectile,
                    distance, inRadius, hasLineOfSight, queryArc, moveToward,
                    spawnPoseOf, resetToSpawn, resetAllToSpawn,
                    form.{register,get,active,abilities,shapeshift,revert}
ctx.game            commands, events, feed, loot, trade, quest, social, chat,
                    unlocks, economy, leaderboard, roster, store, cards, turn
ctx.game.social     friends, party, presence, emotes.play, worldInvites
ctx.game.store      set, delete, get, has, subscribe, mapSnapshot, arraySnapshot — game-defined
                    keyed reactive store slot (any value type); mutations bump ctx.version()
ctx.game.cards      pile(id, config?) — lazily creates (config required on first call) or returns
                    the existing notify-wrapped CardPile for id
ctx.game.turn       loop(id, config?) — lazily creates (config required on first call) or returns
                    the existing notify-wrapped TurnLoop for id
ctx.game.race       state(id, config?) — lazily creates (config required on first call) or returns
                    the existing reactive RaceState; mutations and eventful update() calls bump ctx.version()
ctx.player          userId, isNew, inventory, stats (modifiers), loadout,
                    applyLoadout, movement (pose/aim), motion (impulse/setVerticalVelocity/setY/takePending),
                    possession, cosmetics
ctx.player.motion   impulse(vy), setVerticalVelocity(vy), setY(y), takePending() — game-code
                    seam into the shell's vertical-motion integrator; drained once per frame
                    before gravity, so a jump pad or grapple release calls this from
                    onTick/commands instead of touching y directly
ctx.item            use, weapon
ctx.input           publish(held), isDown(action), held(), pointer() — per-frame held-action + pointer-position snapshot, polled from onTick
ctx.world           ground (TerrainField), groundHeightAt(x, z) — the canonical
                    sampler for the game's declared world; environment worlds
                    resolve their terrain field, every other world kind is 0.
                    Use it for every spawn/placement/waypoint y — never
                    hand-roll a noise sampler or hardcode y = 0 on relief
ctx.camera          follow(entityId | null), followedEntityId(), setCinematic(config), cinematic(),
                    setChaseTuning(patch | null) / chaseTuning() — runtime overlay on camera.chase
                    (distance/height/fov/lead/bank) for boss pull-backs and drift zoom-outs,
                    subscribe — runtime camera-follow/cinematic override; the shell reads
                    followedEntityId() each frame, falling back to the static
                    playable.camera.followEntityId when it returns undefined
ctx.time            advance, now, calendar, snapshot; pause, play, toggle,
                    setSpeed, cycleSpeed; after, every, at (game-time timers)
ctx.subscribe / ctx.version    change signal — UI layers bind via useSyncExternalStore
```

`content.itemById(id)` supplies `{ use?, weapon?, trade? }`; `content.entityById(id)` supplies `{ stats?, receive?, onDeath?, movement?, role? }`; `content.objectById(id)` supplies `GameContextObjectEntry` `{ proximityPrompt?, breakable?, slotInventory? }`. Build all three from your catalogs in `content.ts`. A placed object resolves its catalog entry via `ctx.scene.object.catalog(instanceId)`; `ctx.scene.object.at(x, y, z, tolerance?)` finds placed objects near a point (grid interaction, click resolution beyond the pointer service). `ctx.scene.entity.update(id, patch)` writes a shallow patch onto a spawned entity's mutable fields (e.g. `movement.walkSpeed`) without a full respawn — `scene/movementSpeed`'s `applyStatDrivenSpeed(deps, id, { baseSpeed, multiplierStat?, flatBonusStat? })` is the catalog-driven helper that recomputes and writes `movement.walkSpeed` from a stat-modifier pair each time a buff changes.

### Two tiers: `ctx` runtime vs pure factories

The `ctx` surface above is the **stateful runtime** — it's what game code uses. Every subsystem it wires is *also* exported as a **pure factory** that `createGameContext` composes internally: `createTradeSystem`, `createDeathSystem`, `createEffectSystem`, `createProjectileSystem`, `createSpatialApi`, `createEntityStatsApi`, `createEntityStore`, `createObjectStore`, `createStats`, `createLoadouts`, `createLootRegistry`, `createQuestJournal`, `createSocial`, `createSlots`, `createInteriors` (plus stateless helpers beside each — `canAffordCosts`/`resolveBuy` in `game/trade`, `getStatValue`/`applyPoolDelta` in `scene/entityStats`, and so on). **Build a game through `ctx`, not these** — reach for the factories only for unit tests of pure game math, headless servers, or a custom runtime. Import the domain deep path (`@jgengine/core/combat/death`, `@jgengine/core/game/trade`, `@jgengine/core/stats/statModifiers`, …) and read the `.d.ts`; each is a real export in the published package.

`createSpatialApi`'s optional `grid: { cellSize }` opts `inRadius`/`queryArc` into a lazily-built x/z broadphase index over `candidates()` instead of a linear scan — worth it once candidate counts run into the hundreds+. The index is reused across calls until `invalidate()` is called, so call it after any position change (move, spawn, despawn); a candidate outside the index at query time still resolves exactly (never silently skipped), only a *moved* one can be missed until invalidated.

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

`onTick`'s `dt` is **game time, not real time**: the shell scales each frame's real delta by `definition.time.scale` (real→game seconds at 1×) and the live speed multiplier, so writing decay/regen/AI as `rate * dt` makes it obey pause and fast-forward for free — never read wall-clock in a tick. Configure via `defineGame({ time: { scale?, speeds?, dayLength?, start?, startPaused?, daysPerYear?, seasons? } })` (all optional; default is real-time 1:1 with speeds `[1,2,3,4]`, 365-day years).

- **Continuous** work scales through `dt`. **Scheduled** work uses game-time timers: `ctx.time.after(sec, cb)`, `ctx.time.every(sec, cb)`, `ctx.time.at(gameSec, cb)` — measured in game-seconds, so 4× fires them 4× sooner and pause freezes them. Each returns a cancel handle.
- **Controls** (drive from a HUD or a command): `pause()`, `play()`, `toggle()`, `setSpeed(mult)` (0 pauses), `cycleSpeed()`. Read state with `ctx.time.snapshot()` / `ctx.time.calendar()` (`{ day, hour, minute, second, dayFraction, year, dayOfYear, yearFraction, season? }`), or in React with `useGameClock()` → snapshot + `controls`. Speeding to 4× or pausing affects **everything** on the tick — no per-system wiring.
- **Calendar year/season** rides the same day counter, no separate clock: `year`/`dayOfYear` fall out of `day` divided by `TimeConfig.daysPerYear` (default 365), `yearFraction` is progress through the current year (0..1). Setting `TimeConfig.seasons: string[]` (e.g. `["spring","summer","fall","winter"]`) slices the year into equal named segments and populates `calendar().season`; omit `seasons` and the field is absent — a living-world sim names its own season boundaries this way instead of a hand-rolled `dayOfYear % ...` module.

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
| `movement` | `walkSpeed` (reaches spawn automatically), `poses?: ["standing","crouch","prone","running"]`, `aim?: ["hip","ads"]`, `frozen?: boolean` — a scene-instance-level movement lock (cutscenes, stuns, mount transitions); `movedWhileFrozen(entity)` (`scene/entityStore`) flags an entity whose velocity moved anyway despite `frozen: true`, catching a system that bypassed the lock |
| `role` | `CatalogEntityRole` = `"player"` \| `"enemy"` \| `"hostile"` \| `"npc"` \| `"vehicle"` — catalog hostility class for targeting (`"enemy"`/`"hostile"` classify hostile in `cycleTarget`). Distinct from the scene *instance* `EntityRole` (`"player"` \| `"npc"` \| `"prop"`, in `scene/entityStore`) which drives input/camera binding — **possession** (`ctx.player.possession`) flips this instance role between `"player"`/`"npc"` on every control swap, so exactly one owned entity is ever the input/camera target |
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

**XP/level use the engine progression primitive.** `@jgengine/core/game/progression` ships `curve()`/`evalCurve()` (evaluate a game-owned XP-per-level curve *definition*) and `leveling()` (a level track over the bounded `xp`/`level` stats that reports overflow). You own the curve *numbers* in a catalog; the engine owns the overflow math — on level-up bump `level.current`, reset `xp.max` from the curve, push a `stat.levelUp` feed entry. Hand-rolling `xpForLevel`/`levelFromXp`/`xpToNextLevel` is the anti-pattern — those already exist. `LevelingConfig.thresholdMode` picks how the curve is read: `"perLevel"` (default) treats `xpForLevel(N)` as the incremental N-1→N cost, summed internally; `"cumulative"` treats `xpForLevel(N)` as the total lifetime XP to reach level N (0 at/below `startLevel`) and compares `xp.current` straight against those totals — pick this for a design that quotes "total XP to level N" tables.

`leveling({ …, thresholdMode: "cumulative" })` switches to lifetime-total semantics: `xp` is a running total instead of a per-level bank, and `resolve(level, xp)` walks upward from `level` to the highest level whose cumulative threshold `xp` clears — it never demotes, and clamps the returned `xp` to the max-level threshold once capped. Default is `"perLevel"` (unchanged, fully back-compat) — pick `"cumulative"` for a total-XP display (MMO-style "12,450 XP") instead of a resettable per-level bank.

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

## Combat — effects, projectiles, death, feel, abilities

Combat primitives — effects & projectiles, death handling, melee/defense/telegraph feel, and abilities/resources/auto-target/resistance/run drafts. Full surface: **[reference/combat.md](reference/combat.md)**.

## Loot

```ts
lootTable({ id, rolls?, entries: [{ item? | currency?, count: n | [min,max], weight }] })
lootTable({ id, mode: "independent", entries: [{ item, count, chance }] })  // every entry rolls its own chance — 0..N drops per roll, no filler entries
ctx.game.loot.register(table)        // in onInit
ctx.game.loot.has(id) / roll(id, rng?) / grantToPlayer(userId, drops, source?)
```

Tables colocate with their domain (`entities/enemies/loot-tables.ts`, `objects/loot-tables.ts`). Entities reference them via `onDeath.drops`; chests via a `loot.open` command arg. `grantToPlayer` fills declared inventories, grants currencies, and emits `loot.granted`.

## Card, board & shaped-inventory primitives
Pure, renderer-free structures for card, board, and deckbuilder games — they sit **beside** the slot inventory, not in place of it. All are immutable-reducer + thin-controller pairs, mirroring the two-tier ctx/factory model: use the `create*` controller in game code, reach for the exported pure functions (`draw`, `moveCards`, `tickTimeline`, `laneAggregate`, `runPipeline`, `placeShaped`) for unit tests and headless servers.
```ts
// cards/cardPile — named ordered zones (deck/hand/discard/exhaust); seeded shuffle, hand limit, reshuffle-on-empty
const pile = ctx.game.cards.pile("deck", { zones: ["deck","hand","discard","exhaust"], drawFrom:"deck", handZone:"hand", discardTo:"discard", handLimit:7, reshuffleFrom:"discard" });
pile.reset(createCardPileState(pileConfig, { deck: ids }));   // seed zone contents once, from onInit
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

`ctx.game.cards.pile(id, config?)` is the runtime-wired accessor for `createCardPile`: lazily creates the pile on first call (`config` required then) or returns the existing one for `id` on every later call, and every mutation notifies `ctx.subscribe`/bumps `ctx.version()` — so a `useEngineState`-bound hand/discard view re-renders without a game-owned store. Reach for `createCardPile` directly only for a headless test or server; game code goes through `ctx.game.cards.pile`.

## Puzzle primitives — cell grids and falling pieces

Two pure, renderer-free `@jgengine/core` primitives for cell-based puzzle games (Tetris wells, match-3 boards); tile art and the drop-cadence loop are the shell's/game's job.

- **`puzzle/cellGrid`** — a generic immutable `CellGrid<T>` for uniform typed-cell boards. Row 0 is the top; `y` grows downward. `createCellGrid`, `cellAt`, `withCell`/`withCells` (immutable single/batch writes), `fullRows`/`clearRows` (line-clear + compaction), `collapseColumns` (match-3 cascade gravity), `findRuns` (run detection with an optional custom matcher).
- **`puzzle/fallingPiece`** — the falling-piece layer over a `CellGrid`: `ShapeTable<TShape>` maps rotation states to cell offsets; `pieceCells`/`pieceCollides`/`mergePiece` place, test, and commit a piece; `dropDistance` computes the ghost-piece landing row; `gravityInterval`/`levelForLines`/`lineScore` are the classic Tetris drop-speed/level/score curves (overridable); `createLockDelay`/`stepLockDelay` is the grounded→countdown→lock stepper (`delaySeconds: 0` locks instantly on touchdown).
- **`tactics/fallingGrid`** — a generic tile-drop grid over any `TCell` payload (distinct from the `cellGrid`/`fallingPiece` row-clear pair): `createFallingGrid(config)`, `gravityIntervalMs(level, config?)` for the drop-speed curve, and a `FallingGridSnapshot`/`LockState` shape for the grounded→lock stepper.

## Dropped items — `worldItem` and the loot filter
A `worldItem` is a scene **entity** (position + item ref + rarity), never an inventory item or object — see the three buckets. `onDeath.dropMode: "world"` (above) is the usual producer; games can also hand-place ground loot (chests, quest drops).
ctx.scene.worldItem.spawn({ itemId, position, rarity?, baseType?, count?, affixTier?, source? })
ctx.scene.worldItem.get(instanceId) / list() / nearestInRadius(from, radius, filter?)
ctx.scene.worldItem.pickup(instanceId, userId)   // grants to inventory + despawns, emits worldItem.picked_up
Click-to-grab is engine-owned: setting `pointer.grabWorldItems: true` in `defineGame({...})` makes `@jgengine/shell`'s `GamePlayerShell` resolve `pointer.worldHit()` on primary click, and — when the hit entity is a `worldItem` within the `worldItem.pickupRadius` (default `DEFAULT_PICKUP_RADIUS`) configured on `defineGame({...})` of the local player — calls `pickup` directly, no game command needed. `@jgengine/react`'s `useWorldItems()` / `useNearestWorldItem(radius)` drive a HUD pickup prompt off the same store.
Presentation is a two-layer render binding, both engine-owned (rendered by `@jgengine/shell`'s `WorldItems`) over **game-supplied data**:
1. **Rarity baseline** — the `worldItem.rarityStyle: Record<rarity, { color?, beam?, label? }>` field of `defineGame({...})`, the game's rarity palette (Borderlands/Diablo-style beam + color coding).
2. **Loot filter overlay** (#33) — the `worldItem.filter: LootFilterRule[]` field of `defineGame({...})`, built with `lootFilter([{ id, when: { rarity?, baseType?, minAffixTier?, maxAffixTier? }, hide?, color?, beam?, label? }])` from `game/lootFilter`. **First matching rule wins** (PoE/Last Epoch block semantics); a rule only overrides the fields it sets, everything else falls back to the rarity baseline. `resolveWorldItemPresentation(item, rarityStyle, rules)` composes both layers and is what the shell calls per item.
## Gear systems — durability, affixes, modular items, storage tiers
Four pure primitives that hang off item **instances** (not the stackable catalog id) — all catalog-first (specs are game-supplied config) and renderer-free. Item instances that carry durability/affix/modular state key off a game-assigned instance id, the same way targeting keys off entity instance ids.
**Durability** (`item/durability`) — per-instance wear + repair. `DurabilitySpec` (`{ max, wearPerUse?, wearPerHit?, disableAtZero?, repair? }`) is catalog data; `createDurability(spec)` seeds a `DurabilityState`, `wear(spec, state, "use" | "hit", times?)` decrements (floors at 0), `isDisabled(spec, state)` gates use at zero, `durabilityFraction` feeds a HUD bar. Repair is quote-then-apply: `repairQuote(spec, state, { station?, to? })` returns the `{ item, count }[]` material cost (scaled by points restored) + the post-repair state (optional `qualityLossPerRepair` shrinks `max` each repair, Tarkov-style) — the game charges the materials through inventory, then commits the quote's `state`. `createDurabilityTracker()` keeps `DurabilityState` per instance id for the runtime.
**Affix roller** (`item/affix`) — procgen `base × rarity → { rolled affixes, computed stats, name }`. `createAffixRoller({ pools, rarities })` over rarity-weighted `AffixPool`s. `roll(base, rarityId, rng)` draws `affixCount` distinct affixes without replacement (weighted, via the engine's `pickWeighted`), computes stats (base × `rarity.statScale`, then `op: "add"` affixes, then `op: "mul"`), and composes a name from `rarity.namePart` + prefix/suffix parts. `rollRarity(rng)` picks a weighted tier; `rollRandom(base, rng)` chains both. Pass `seededRng(seed)` for deterministic drops; any `() => number` rng works (same contract as `loot.roll`). `seededRng` lives in `random/rng` (re-exported here) alongside `seededStreams(seed)`, which derives independent named streams from one seed — `streams("worldgen")` vs `streams("history")` — so simulation draws never perturb generation (intervening in a run cannot change the map).
**Modular item** (`item/modularItem`) — a whole assembled from parts in typed mount slots (guns, mechs). `ModularItemDef` has `slots: MountSlotDef[]` (`{ id, accepts, required? }`); `install(def, installed, slotId, part)` validates the slot exists, accepts the part's `category`, and is empty; `computeEffectiveStats(def, installed)` rolls part `stats` (additive) then `multipliers` over `baseStats`; `missingRequiredSlots`/`isComplete` gate a buildable whole. `createModularItem(def)` is the stateful wrapper (`install`/`uninstall`/`effectiveStats`/`partInSlot`).
**Storage tiers + insurance** (`inventory/storageTier`) — the extraction-economy inventory half. Inventory containers carry a `tier: "carried" | "banked"` (`InventoryDeclaration.tier`; a Tarkov secure container is just a `banked` container on the body). `partitionOnDeath(containers)` splits a death snapshot into `{ kept, lost }` (banked survives, carried is dropped, stacks merged). `createDeliveryQueue()` is the delayed-delivery (insurance) hook: `schedule` a `ScheduledDelivery` with a game-time `deliverAt`, then `due(now)` / `claimDue(now)` drain it on the tick clock. `insureLost(lost, policy, userId, now, rng?)` filters the lost set to insured items and stamps a delayed `deliverAt` → feed straight into the queue. `resolveConsolation(policy, partition)` returns a baseline loadout id (apply via `applyLoadout`) — the death consolation grant, optionally gated on `if-carried-empty`. *(Session/round machines — extraction hold-to-leave, raid banking — consume this tier; see the objective-machine group.)*
## Objective, round & session machines
Content-agnostic state machines for competitive/session shapes — plant/defuse, buy/live/end rounds, downed/revive, the battle-royale ring, extraction raids, run-vs-meta persistence. All pure `core`; every timer takes a **game-time** `dt`/`now` (`ctx.time`), so pause and fast-forward apply for free. Drive them from `loop.onTick` and pipe their events into `ctx.game.feed`/`events`; render their snapshots as HUD (per the UI quality bar in [`reference/ui-react.md`](reference/ui-react.md) — the downed banner, ring warning, and extraction timer are required HUD).
**Contested channel** (`session/contestedChannel`) — the interrupt-on-damage progress objective behind plant/defuse, cash-out, urn deposit, banishing, and hold-to-extract. `createContestedChannel({ duration, interruptOnDamage?, resetOnInterrupt?, favorability?, ratePerOccupant?, contested?, decayRate? })`: `start(team)` begins the channel, `tick(dt, occupants)` advances it against per-team occupancy (`Record<teamId, count>`) and emits `start`/`tick`/`contested`/`paused`/`complete` events, `damage(reason?)` interrupts (keeps or zeroes progress per `resetOnInterrupt`). `favorability[team]` scales fill rate (Deadlock deposit); `ratePerOccupant` fills faster with more owners present; `contested: "pause" | "decay"` chooses whether an opposing occupant freezes or reverses progress (The Finals contest). The owner leaving pauses it. Extraction hold-to-leave reuses this primitive verbatim.
**Round state** (`session/roundState`) — the buy→live→end match machine (Valorant/CS). `createRoundState({ phases, teams, phaseOrder?, winCondition?, maxRounds?, winReward?, lossBonus? })`: `tick(dt)` runs the phase timer and auto-advances (emitting `phase.start`/`phase.end`, rolling the last phase back into the next round's first), `concludeRound(winner)` records the win on any "conclude-eligible" phase (any phase but the first/last in the cycle), settles `round.economy` (winner gets `winReward`, losers get an escalating `lossBonus` via `lossBonusFor(rule, streak)` clamped to `max`), and moves to the next phase. `onPhaseEnd(hook)` fires commerce/spawn gates on each transition; `match.end` fires at `maxRounds`. `server.mode` stays a game string — this is the timer/economy engine under it.

Two extras beyond the default buy/live/end cycle: `phaseOrder?: string[]` overrides the phase names/cycle entirely (a wider `Record<string, number>` `phases` shape to match) — a draft→ban→play→score cycle is the same machine with different phase names. `teams: (string | { id, role? })[]` accepts a plain id or a `{ id, role }` pair; `roleOf(team)` reads the tag back (`"attacker"`/`"defender"`, Valorant side assignment) without a parallel lookup table. `winCondition?: (snapshot: RoundSnapshot) => string | null` lets `evaluate()` (call it from `onTick` alongside `tick(dt)`) auto-conclude the round the instant a score/objective condition is met, instead of the game hand-calling `concludeRound` — return a team id to end it, `null` to keep playing; `RoundSnapshot` is `{ round, phase, timeLeft, scores, lossStreaks, roles, matchOver }`.
**Role assignment** (`session/roles`) — `assignRoles(players, specs: RoleSpec[])` distributes fixed-count or proportional roles (hider/seeker, spy/operative, prop/hunter) across a player list — the allocation half of an asymmetric session mode; `RoundConfig.teams`' per-team `role` is the lighter-weight alternative when a round machine already tracks the roster.
**Downed / revive** (`combat/downed`) — the 3-state alive→downed→dead chain (Apex/Helldivers). `createDownedState({ bleedoutSeconds, reviveSeconds?, reviveHealthFraction?, banner? })`: `down(id)` starts the bleedout, `tick(dt)` counts it down (→ `died`, optionally spawning a `banner`), `revive(id, dt)` accumulates an ally's hold time (→ `revived` with the health fraction the game restores), `finish(id)` executes a downed enemy, and `respawnFromBanner(id)` brings a banner-holder back at a beacon. It sits **in front of** the engine death resolution: on lethal damage call `down` instead of dying; on `died`/`bleedout` run the real `resolveDeath`. No banner ⇒ death is terminal.
**Shrinking ring** (`session/ring`) — the battle-royale safe zone with out-of-bounds DoT. A catalog `RingConfig` is `{ center, phases: RingPhase[] }` where each phase is `{ startTime, shrinkDuration, fromRadius, toRadius, damagePerSecond, center? }` on the game clock. `ringSampleAt(config, t)` / `createRing(config).at(t)` returns the live `{ center, radius, damagePerSecond, shrinking }` (radius/center interpolate during each shrink window, hold between phases); `isOutside(t, pos)` / `distanceOutside(t, pos)` test a point, and `damageOutside(t, dt, positions)` returns per-entity `{ id, damage }` for everyone beyond the wall — feed those into `scene.entity.stats.delta`/`effect` each tick.
**Extraction session** (`session/extraction`) — the raid-scoped "reach an extract and leave to bank what you carried" wrapper (Tarkov/DMZ/Helldivers), composed from the contested channel + `inventory/storageTier`. `createRaidSession({ extracts, insurance?, consolation? })`: `beginExtract(userId, extractId, team?)` opens a hold-to-leave channel, `tickExtract`/`damage` drive it, and on completion `resolveExtraction(userId, containers)` banks everything carried. `resolveDeath(userId, containers, now, rng?)` runs `partitionOnDeath` (banked kept, carried lost), schedules insured items through the built-in delivery queue (`claimDeliveries(now)` drains it on the clock), and yields the consolation loadout id. `playerSnapshot(userId)` feeds the extraction-timer HUD.
**Persistence scopes** (`runtime/persistenceScope`) — the run-vs-meta split with explicit reset boundaries (Icarus mission wipe, Once Human season reset). `partitionScopes(state, { run })` splits a flat record into `{ meta, run }` by key; `resetRun` clears the run half while meta (talents/blueprints/account currency) survives; `clearRunFields(playerRow, runFields)` and `applyRunReset(profile, runFields, now)` do the same over `RuntimePlayerRow`/`PlayerProfileRecord`. `planScenarioReset({ gameId, serverId?, wipeChunks?, wipeServerSession?, resetPlayers?, runFields? })` normalizes a scenario/season reset that `HostPersistence.resetScenario?(reset)` applies — `@jgengine/sql` implements it (deletes the server's chunks + session, run-resets each profile in one transaction), keeping account meta intact.

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
ctx.game.social.friends.canRequest / request / accept / decline / remove / block / list / requestsFor   // persisted
ctx.game.social.party.register({ maxMembers })   // then canInvite / invite / accept / decline / kick / leave / promote / list / membersOf / invitesFor
ctx.game.social.presence.get(userId)             // { online, serverId?, zoneId?, instanceId? }
ctx.game.social.emotes.play(fromUserId, emoteId, radius?)   // → { from, emoteId, at, recipients } | { reason }
ctx.game.social.worldInvites.invite(fromUserId, toUserId, { serverId, joinCode? })   // then canInvite / accept / decline / listFor
```

Party is ephemeral session state (invites expire; leader leaving promotes the next member). Events: `social.friend.added`, `social.party.joined`, `social.party.left`.

**World invites** bridge friends and `multiplayer/matchmaking`: an invite carries the `{ serverId, joinCode? }` of the session you're in (the same fields as a `SessionListing`); `accept(userId, inviteId)` → `{ target }` is the join target you hand to your backend's `joinServer`/`joinByCode` — the invite never joins anything itself. Invites are ephemeral like party invites (TTL via `SocialDeps.worldInviteTtlMs`, default 60s; blocked users can't invite either direction). Events: `social.world.invited`, `social.world.accepted`. React: `useWorldInvites()` lists pending invites for the local player.

`emotes.play` reuses `scene.entity.inRadius` to find nearby **player**-role entities (default radius 20) and emits `emote.played` — never build a parallel proximity broadcast. Emote ids are game-defined strings (no registration, same convention as effect ids). Bind it into the existing feed primitive for a HUD feed: `ctx.game.feed.bind("emote.played")` + `useFeed({ action: "emote.played" })` — no dedicated emote hook exists or is needed.

## Chat

```ts
ctx.game.chat.send(fromUserId, channelId, body)      // → { message, recipients } | { reason }
ctx.game.chat.whisper(fromUserId, toUserId, body)    // stable per-pair channel "whisper:<a>:<b>"
ctx.game.chat.history(channelId, { limit?, viewerUserId? })   // viewer filter drops blocked senders
ctx.game.chat.register({ id, kind, radius?, historyLimit?, rateLimit? })   // custom channels
ctx.game.chat.channels() / snapshot() / hydrate(data)
```

Built-in channels: `global` (everyone), `party` (reuses `social.party.membersOf`; rejects "not in a party"), `proximity` (reuses the same spatial/entity seam as emotes, default radius 20, **player**-role entities only). `kind` picks the recipient resolution; custom channels pick one of the three kinds. Sends are trimmed, capped (500 chars), and rate-limited per user per channel (default 10/10s, sliding window — `createChatRateLimiter` is the reusable pure primitive). Mute rides social's blocked set: blocked pairs can't whisper, and blocked senders are dropped from party/proximity recipients and from `history` when `viewerUserId` is passed. Every send emits `chat.message` (recipients omitted = broadcast). History is a bounded ring per channel (default 100) with `snapshot`/`hydrate` like `Friends`.

**Remote chat seam** (`multiplayer/chatContract`): `ChatTransport` is the hook-shaped contract (`useMessages(channelId | "skip")` / `useActions()`, identity-stable like `PresenceTransport`); `ChatSync` is the callback shape for backends that can't host React hooks. Bindings: ws — `createWsBackend(...).chatSync` / `.chatSyncFor(serverId)` over `chatSend` frames + a `chat` update channel (host relays per-channel rings, validates length + rate limit); Convex — `@jgengine/convex/convexChatTransport` `createConvexChatTransport({ messages, sendMessage })` (one live query + one mutation); local/dev — `createLocalChatTransport()`. React lifts a `ChatSync` via `chatTransportFromSync`.

## Cosmetic loadout

```ts
ctx.player.cosmetics.register(defs)                       // onInit — Record<loadoutId, { slots: Record<slot, cosmeticId> }>
ctx.player.cosmetics.apply(userId, loadoutId)              // merges the preset's slots
ctx.player.cosmetics.equip(userId, slot, cosmeticId | null)  // set/clear one slot directly
ctx.player.cosmetics.get(userId)                          // Record<slot, cosmeticId>
```

A per-player appearance layer distinct from `applyLoadout` (which grants inventory/stats/economy/unlocks) — cosmetics never touch gameplay state, only equipped slot ids for your renderer to read. Emits `cosmetics.changed`.

## Possession

```ts
ctx.player.possession.own(userId, entityId) / disown / owns / listOwned(userId)
ctx.player.possession.active(userId)                      // → entityId, defaults to userId itself
ctx.player.possession.possess(userId, entityId)            // → null | { reason } — must be owned + spawned
```

A player can own N scene entities (party members, vehicles, a possessed creature) and control exactly one at a time — distinct from `game.social.party`, which is a social grouping, not a control model. `possess` flips the previous/next entity's scene `EntityRole` between `"player"`/`"npc"` and emits `possession.swapped`; `@jgengine/shell`'s `GamePlayerShell` reads `active(userId)` every frame to rebind WASD movement, tab-targeting, hotbar `from`, and the camera rig's `followEntityId` to whichever entity is currently controlled — a game never wires this rebind itself.

## Form / shapeshift

```ts
ctx.scene.entity.form.register(defs)                              // onInit — FormDef[] = { id, movement?, abilities?, model? }
ctx.scene.entity.form.shapeshift(instanceId, formId, durationSeconds?)   // → null | { reason }
ctx.scene.entity.form.active(instanceId)                          // → formId | null
ctx.scene.entity.form.abilities(instanceId)                       // → readonly string[] | null
ctx.scene.entity.form.revert(instanceId)                          // early revert
```

A `form` bundles movement params + an ability-id list + a mesh into one swappable unit (shapeshift/transformation — V Rising bear/wolf/bat, Wukong's boss transformation). `model` reuses the entity's catalog `name` (the same key `entityModels`/`entitySprites` resolve against), so the mesh swap rides the existing render lookup — no parallel mesh field. `durationSeconds` is **game time**: it schedules the automatic revert through `ctx.time.after`, so it obeys pause and fast-forward like everything else on the clock. Emits `form.changed`.

## Events, feed, leaderboard

```ts
ctx.game.events.on(name, handler)      // register in onInit; typed GameEventMap
ctx.game.feed.bind(action)             // pipe an engine event into a ring buffer (default 20)
ctx.game.feed.push(action, entry)      // manual channels (chat, crafting)
ctx.game.feed.recent(action, { limit? })
ctx.game.leaderboard.track({ stat, scope: "global" | "server" | "profile" })   // onInit
ctx.game.leaderboard.increment(userId, stat, { scope, by? }) / getTop / getProfile
```

`ctx.game.commands.define(name, { validate?(ctx, input), apply(ctx, input) })` registers a verb (`has`/`names`/`run` round it out); `run(name, input)` returns `{ status: "applied", state } | { status: "rejected", reason } | { status: "unknown-command" }`. `apply` may either **return** the next state (the classic reducer shape) or mutate `ctx` in place and return **nothing** — `run` keeps the current `ctx` as `state` when `apply` returns `void`, so a handler that only calls other `ctx` methods (spawn, effect, loot.grantToPlayer, …) doesn't need a pointless `return ctx`. **Event handlers use `ctx` directly** the same way (side effects: leaderboard, economy, scheduling) and never reassign state. One feed primitive for kill feeds, loot logs, quest updates — no per-domain feed hooks.

## `ctx.game.store` — reactive game state

```ts
ctx.game.store.set("health", 100)      // any key, any value type
ctx.game.store.get("health")           // T | undefined
ctx.game.store.has("health")
ctx.game.store.delete("health")
ctx.game.store.subscribe(listener)     // change-signal fires on set/delete
ctx.game.store.mapSnapshot() / arraySnapshot()
```

A reactive per-game keyed store (`ObservableKeyedStore<unknown>`) attached to `GameContext` — reach for it instead of a module-level singleton store for ad-hoc reactive game state (turn trackers, deck UIs, anything that doesn't already have a `ctx` surface). `set`/`delete` bump `ctx.version()` and notify `ctx.subscribe` listeners; `get`/`has` are plain reads. Unlike a per-slot handle, there is no `define`/seed step — a key simply doesn't exist until the first `set`.

## `ctx.game.cards` / `ctx.game.turn` — lazily-created piles and turn loops

`ctx.game.cards.pile(id, config?)` and `ctx.game.turn.loop(id, config?)` lazily create (config required on first call) or return the existing notify-wrapped `CardPile`/`TurnLoop` for `id` — call with just the id after the first `onInit` seed to fetch the same instance; every mutating method is wrapped so it bumps `ctx.version()`/notifies `ctx.subscribe` automatically, same as every other `ctx` surface. This replaces manually constructing `createCardPile`/`createTurnLoop` and wiring notification yourself.

## Movement, pose, input

```ts
ctx.player.movement.getPose(id) / setPose(id, "crouch")   // validates catalog movement.poses
ctx.player.movement.getAim(id) / setAim(id, "ads")        // ADS = aim state + zoom modifier, not a pose
```

Poses (`standing/crouch/prone/running`) change the collision capsule (`POSE_HITBOX`); aim pairs with a `player.stats` zoom modifier on `"reticle"`. Game code reads action names only (`isDown("aim")`, `wasPressed("interact")`) — hold vs toggle is resolved by the binding config, never by raw key branches.

### `ctx.input` — polling the raw controls

`ctx.input` (`@jgengine/core/runtime/inputSnapshot`) is a per-frame held-action snapshot for `onTick` to poll, distinct from the command-dispatch path (bound actions still run commands the normal way): `publish(held: readonly string[])` (the shell calls this once per frame before `onTick`), `isDown(action)`, `held()` for the full list. Publishing never bumps `ctx.version()` — it's a poll surface, not reactive state.

**Pointer position as an axis** — `ctx.input.pointer()` (`input/pointerAxis`) is the cursor over the play surface, normalized to `[-1, 1]` per axis (center origin, `+y` down — negate for aim-up), `active: false` once the pointer leaves, `null` before the first move. The shell publishes it every frame alongside the held set; a steer-by-cursor game polls it from `onTick` (`const p = ctx.input.pointer() ?? { x: 0, y: 0 }`) instead of hand-rolling a `mousemove` listener. To bind it through the analog seam, give an `AxisBinding` a `pointer: { source: "x" | "y", invert?, deadzone?, curve? }` and pass the state to `AxisChannel.sample(dt, isDown, ctx.input.pointer())` — the pointer takes over from the key lists while active; `pointerAxisValue` is the standalone helper for custom axis sets.

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

**`collision: { voxel: true }` — object lattice as solids.** When set, the shell's local player uses a voxel body whose `isSolid(x,y,z)` is rebuilt from `ctx.scene.object.list()` as exact `` `${x},${y},${z}` `` keys (integer cell queries). Integer-placed objects are walkable/blocking; fractional-coord objects decorate without colliding. Removing an object opens a real trapdoor under gravity — do not fake the fall with `setPose`. `visual.scale` does not shrink the collider (always a unit cell). The voxel body is created once; prefer `motion.setY` / `impulse` for vertical relocation — full XY teleport of the local voxel body is not supported. Solid cache rebuilds when object **count** changes. Recipe: `jgengine-newgame` → voxel trapdoor board.

**Respawn** — `ctx.scene.entity.spawnPoseOf(id)` reads the spawn pose, `resetToSpawn(id)` teleports back to it with zero velocity, `resetAllToSpawn(filter?)` does it for every entity matching an optional filter and returns the count (round resets, out-of-bounds recovery).

## Touch & mobile

Every game is touch-playable with zero per-game input code. On a coarse-pointer device the shell derives a `TouchScheme` from the game's `input` bindings (`deriveTouchScheme`, `@jgengine/core/input/touchScheme`): a virtual joystick binds whichever movement axes are bound — the synonym lists cover walking, turning, **and** driving/flight vocab (`accelerate`/`brake`, `steerLeft`/`steerRight`, `pitchUp`/`pitchDown`, `yawLeft`/`yawRight`, `throttleUp`/`bankLeft`, …), so racers and flyers get a proper virtual stick with zero config. On-screen buttons cover the remaining actions, and drag-to-look mounts automatically for `first`-person camera rigs. Each button is classified `kind: "primary" | "utility"` (`touchButtonKind`): meta actions (start, restart, pause, `toggle*`/`cycle*`/`switch*`/…) render as small chips at the bottom-center of the dock, and primary gameplay verbs as large thumb-arc buttons around the bottom-right corner — so the frequent verbs sit under the thumb and the menu actions stay out of the way. Touch controls feed synthetic `touch:<action>` codes into the same `ActionStateTracker` the keyboard uses — game code reads `isDown`/`wasPressed` and never branches on input source.

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
- **`buttons`** — curate the on-screen cluster (order preserved; bare string or `{ action, label?, icon?, kind? }`); omit to auto-derive one button per remaining bound action. Buttons render a glyph, not text: `iconForAction` (`@jgengine/react/gameIcons`) resolves the action name to a `GameIconName` (`jump`, `sprint`, `rotateCw`, `hardDrop`, `swap`, `hand`, `restart`, arrows, …), the `label` becomes the `aria-label`; set `icon: "<GameIconName>"` to pick one explicitly or `icon: false` to force the text label. `kind` overrides the derived `primary`/`utility` classification (thumb button vs meta chip) when the name-based guess is wrong.
- **`hidden`** — actions to drop from the derived buttons without gesture-binding them.
- **`movement: false`** — suppress the virtual joystick even when movement actions are bound.
- **`look` / `lookSensitivity`** — drag-to-look on the play surface; defaults to `true` for `first`-person camera rigs, `0.005` radians/px.
- **`touch: false`** — opt out entirely when the game's own DOM UI is already touch-native.

**`orientation: "landscape" | "portrait"`** (top-level `defineGame({...})` field, not under `touch`) is an advisory rotate hint: on a coarse-pointer device held the wrong way the shell shows a dismissible prompt to rotate. It never blocks play — a racer/flyer sets `orientation: "landscape"`, a vertical faller sets `"portrait"`.

`useDisplayProfile()` (`@jgengine/react/display`) reports `{ coarsePointer, compact, portrait }` — live media-query state, SSR-safe — for adaptive HUD layout; `compact` trips on narrow width **or** the short height of a landscape phone. The `HudCanvas`/`HudPanel` system already consumes it to scale and re-flow the HUD (see the mobile/touch rules in [`reference/ui-react.md`](reference/ui-react.md)); read it directly only for content-level tuning inside a component.

## Interaction — `proximityPrompt`

One primitive for all float UI: `{ radius, display, invoke }` where `display` is `{ kind: "keybind", actionId }` | `{ kind: "gauge", gaugeId }` | `{ kind: "label", text }` and `invoke` is `{ command, args? }` or null (display-only). `talkable: "dialogue_id"` on an entity expands to a talk prompt. Engine picks the nearest prompt in radius (priority tie-break). Never build per-game hint resolver chains.

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
- **Minimap math** (`world/minimap`): pure projection + bearings — `projectToMinimap(worldPoint, { center, worldRadius, size, rotate? })` → pixel `{ x, y, inside, distance }` (north = −Z maps up; `rotate` is the compass bearing that points up — pass `headingToBearing(yaw)` for a rotating map), `clampToMinimapEdge` for off-map markers, `compassBearing(from, to)`/`headingToBearing(yaw)`/`bearingToCardinal`/`relativeBearing` for the compass strip. The react `Minimap`/`Compass`/`WorldMap` components take `facingYaw` (the raw `rotationY`) and convert internally — never pre-convert to a bearing for them.
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

Renderer-free world surface — query primitives, environment fields + weather + realm composition, survival meters/moodles, interactive building & terraform, the optional headless physics world, vehicles/mounts/racing, and spawn placement. Full surface: **[reference/world.md](reference/world.md)**.

## Turn-based & tactics (renderer-free)

Pure-`core` primitives for turn-based, grid-tactics, and card games — every one is a stateful factory with matching pure math, and every stateful piece exposes `capture()`/`restore()` so it plugs straight into the snapshot store. Overlays and tile art are the shell's/game's job; these ship the logic.

- **`turn/turnLoop` — `createTurnLoop(config)`.** An initiative machine over an ordered participant list with optional `phases` and per-turn action-economy `pools`. `advanceTurn()` walks the order (round++ on wrap) and **resets the entering participant's pools**; `advancePhase()` steps phases then rolls into the next turn. Pools are catalog data (`{ id, max, start? }`) — a single Slay-the-Spire energy pool or BG3's Action/Bonus/Movement/Reaction set, spent independently via `spend/canSpend/gain/refill`. `setOrder`/`addParticipant`/`removeParticipant` re-roll initiative without losing the active pointer. `config.onTurnStart?(participantId)`/`onTurnEnd?(participantId)` fire on every `advanceTurn()` transition (start also fires once for the initial participant at construction) — hang status-effect ticks, "your turn" banners, or AI-turn kickoff here instead of diffing `state()` between ticks yourself. `ctx.game.turn.loop(id, config?)` is the runtime-wired accessor: lazily creates (config required the first call) or returns the existing notify-wrapped loop for `id`, so a HUD bound to `ctx.subscribe` re-renders on every turn/phase/pool change with no separate store to wire.
- **`turn/commit` — `createCommitController({ mode })`**, also hosted at `turnLoop.commit`. Three commit modes: `immediate` (submit resolves now), `simultaneous` (sealed hidden submissions → `reveal()` once `allReady()`, deterministic order — Marvel Snap), and `rewind` (visible `pending()` → `rewind()` to discard or `commit()` to finalize).
- **`turn/intent` — `createIntentBoard()`.** A minimal per-participant "what will you do" board, lighter than a full commit round: `declare(participantId, { kind, magnitude?, targetId?, note? })` records one intent per participant (overwriting any prior undeclared one), `peek(participantId)` reads without clearing, `all()` lists every declared `[participantId, intent]` pair (for an enemy-intent HUD row, Slay-the-Spire style), `consume(participantId)` reads and clears in one call, `clear(participantId?)` clears one or everyone. Reach for this when you need visible declared-but-not-yet-resolved intents (telegraphed enemy actions) without the full simultaneous-reveal machinery of `turn/commit`.
- **`tactics/tacticalGrid` — `createTacticalGrid({ width, height, blocked?, diagonal?, world? })`.** Tile occupancy (one unit per tile), `reachable(from, budget)` flood-fill (respects walls + occupants), `path(from, to)` shortest route, and `push(id, dir, { distance, chain })` discrete knockback-to-tile — chained collisions transfer momentum through struck units (Into the Breach), or stop with a recorded `PushCollision` against `wall`/`edge`/another unit. `world: { origin: [x, z], tileSize }` (mirroring `navGrid`'s bounds+cellSize convention) turns on `worldToTile(x, z)` (world point → `Tile | null`, null outside the grid) and `tileToWorld(tile)` (a tile's world-space center) — the render/pointer-hit round trip between the tactics grid and the 3D scene; omit `world` for a grid used purely as abstract logic (both throw if called without it).
- **`tactics/predictiveQuery` — `predictAreaEffect`/`predictArcEffect`/`predictTiles`.** A "would-this-effect-hit" query for pre-commit overlays and enemy-intent telegraphs. It reuses the **exact** AoE/LoS targeting behind `ctx.scene.entity.effect` (`combat/effects` `resolveAreaTargets`) so the predicted target set matches what the effect would actually drain — without committing any state change.
- **`tactics/snapshot` — `createSnapshotStore()`.** Cheap, repeatable turn-undo: `register(id, slice)` any `capture()/restore()` slice (the grid, surfaces, and turn loop all qualify), then `capture()/restore()` a deep-cloned snapshot or use the `push()/pop()` undo stack. `deepClone` handles objects/arrays/Map/Set so a held snapshot is immune to later mutation.
- **`tactics/surface` — `createSurfaceLayer({ kinds, reactions })`.** A stateful tile surface layer with its own `tick(dt)` (timed surfaces decay + expire) and a **combination matrix** — `reactions` is data (`{ when: [a, b], result }`), so grease+fire→fire and water+lightning→electrified are catalog entries, not hard-coded. Distinct from terrain/water; drive its tick from `onTick`'s game-time `dt`.

## External data — `data/dataSource` and the dev proxy

Renderer-free async-state primitives (`@jgengine/core/data`) for a game that reads a live external source (a leaderboard API, a session browser, remote config) — distinct from `ctx.game.store`/multiplayer, which are for the game's own authoritative state.

- **`createDataSource(load, options?)`** (`data/dataSource`) → `DataSource<T>` wraps one `load(signal)` async call as `{ status: "idle"|"loading"|"ready"|"error", data, error }`. `getState()` reads the current snapshot, `subscribe(listener)` fires on every change, `refresh({ force? })` re-runs `load` (de-duplicates a call already in flight unless `force`; aborts the prior call first when forced), `startPolling(intervalMs?)`/`stopPolling()` run `refresh` on an interval (`intervalMs` falls back to the one passed at construction; throws if neither is given), `dispose()` tears down polling and in-flight requests for good. Pass `options.clock` (`{ setInterval, clearInterval }`) to swap the timer source in tests.
- **`fetchJson<T>(url, options?)`** (`data/fetchJson`) — `fetch` + JSON-parse in one call; throws `HttpStatusError` (`status`, `statusText`, `url`) on a non-OK response and `JsonParseError` (`url`, `cause`) on unparsable JSON, so a `DataSource`'s `error` is always one of these two typed shapes, never a bare `Error`. `options.fetchImpl` swaps the fetch implementation for tests/SSR.
- **`createJsonDataSource<T>(url, options?)`** (`data/jsonDataSource`) — sugar combining the two above: a `DataSource<T>` whose `load` calls `fetchJson(url, options)`.
- **Dev proxy (`data/devProxy`)** — same-origin routing for external APIs during `bun dev` so browser CORS never blocks a game's `fetchJson` call against a third-party host. `parseDevProxyTable(raw)` parses a `VITE_JGENGINE_DEV_PROXY` env value (a JSON object of `{ routeName: "https://api.example.com" }`) into a `DevProxyTable`; `proxiedUrl(target, { dev?, table?, prefix? })` rewrites a `target` URL whose prefix matches a table entry into `/proxy/<routeName>/<rest>` (default prefix `/proxy`) when `dev` is true (defaults to `import.meta.env.DEV`) — else returns `target` unchanged, so the same call hits the real host in production. `apps/dev`'s `vite.config.ts` reads the same env var and wires a matching Vite server `proxy` entry per route (`changeOrigin: true`, strips the `/proxy/<routeName>` prefix) — set `VITE_JGENGINE_DEV_PROXY` once and both sides (the URL rewrite and the actual proxy route) agree.

## Multiplayer and the backend seam

The transport/host/persistence seam — `createWsBackend`, protocol codec, browser-safe authoritative host + router, WebRTC P2P, the Node/Convex/SQL adapters, presence, and save cadence. Full surface: **[reference/multiplayer.md](reference/multiplayer.md)**.

## UI — `@jgengine/react`

The React layer — `GameProvider`, the hooks table, headless className-passthrough primitives (incl. map components), the identity/chat/voice/social/drag-layer kits, the shadcn registry install path for visual HUD components (`npx shadcn@latest add https://jgengine.com/r/<name>.json`), the screen-layout rule, and the **UI quality bar** (required, not optional polish). Full surface: **[reference/ui-react.md](reference/ui-react.md)**.

## Devtools — F2 overlay and tunables

`@jgengine/shell`'s `GamePlayerShell` mounts an F2-toggled debug overlay (`shell/src/devtools/DevtoolsOverlay.tsx`) over every game automatically — `defineGame({ devtools: false })` is the only way to turn the toggle off (default `true`). Five tabs:

| Tab | Shows |
|-----|-------|
| Perf | fps, frame/sim/outside ms, frame-budget split (sim vs render/browser), **named sim phases** (avg/max/%), **long-frame log with culprit + reason**, draw calls, triangles, entity/object counts, state notifies/s, probes, and a live "Why slow" diagnosis |
| Tune | every discovered tunable — filterable checklist grouped by source file or table export name; check one to control it live |
| Logs | captured `console.log`/`info`/`warn`/`error` |
| Net | observed backend round-trip latency (fed by `instrumentLatency`) |
| Keys | the game's `ActionCodesMap` bindings |

**Perf attribution.** The shell times each sim-driver phase (`time+input`, `pose`, `pickup`, `onTick`, `actions`, `presence`) via `devtools.profile`. Every frame over `LONG_FRAME_MS` (33.4) is stored with ranked phase ms, `outsideMs` (frame − sim = render/React/GPU/GC/missed vsync), a `culprit` id, a human `reason`, plus probes + the latest render sample — so a hitch answers *why*, not just *that* it happened. Games add their own spans inside `onTick`:

```ts
import { measureProfile } from "@jgengine/core/devtools/devtools";
// or: devtools.profile.measure("physics", () => world.step(dt));

export function onTick(ctx: GameContext, dt: number) {
  measureProfile("physics", () => world.step(dt));
  measureProfile("ai", () => director.tick(dt));
}
```

`devtools.profile.begin("name")` returns an end handle for larger blocks; `add(name, ms)` records a pre-measured duration. Phase averages land on `frame.stats().phases`; long frames on `frame.longFrames()` / `snapshot().longFrames`.

**Tunables are zero-annotation.** Write plain code under `Games/<id>/src/**` — no import, no wrapper — and it's discoverable:

```ts
// loop.ts — top-level export const, nothing else
export const GRAVITY = -22;
export const SKY_COLOR = "#87ceeb";
export const GOD_MODE = false;

// game/content.ts — an exported table of numbers/booleans/colors, nesting and arrays included
export const TUNING = { reach: 6, spawnRate: 0.4, fogColor: "#334455" };
export const WAVES = [{ count: 4, speed: 2.2 }, { count: 8, speed: 3.1 }];
```

The dev runner's Vite plugin, `tunableDiscoveryPlugin` (`@jgengine/core/devtools/transformTunables`, wired in `apps/dev/vite.config.ts`), rewrites each single-line top-level `export const NAME = <expression>;` to `export let` — literals, annotated consts, and derived expressions like `Math.sqrt(2 * Math.abs(GRAVITY) * JUMP_HEIGHT)` alike (string literals other than `"#hex"` colors are left alone to preserve literal types; non-scalar results are filtered out at runtime) — and binds it into the devtools registry as the module loads (`transformTunableExports` is the pure string transform underneath; `tunableModuleTable(id)` derives the table id from the file path, skipping `main.tsx` and `*.test.*`). Table exports need no transform at all — after each game module loads, the dev app calls `devtools.discover.scanModule(moduleExports)`, which walks every export for numbers/booleans/`"#rrggbb"` strings, recursing into nested plain objects and arrays (up to 5 levels deep, 512 entries per export, skipping any level with more than 64 scalars) into dotted paths like `camera.chase.distance` or `waves.0.speed`. A value reachable through two exports is bound once, under whichever scan saw it first.

The overlay also self-scans on mount: the whole `PlayableGame` object under the `game` table (so `defineGame` physics, camera rigs, movement/collision/lighting config, and world feature dimensions are discoverable even when nothing exports them) and the engine's default `MOVEMENT_TUNING` under `engine` (live walk speed/jump/gravity defaults for every game, no config needed).

F2 → Tune tab lists every discovered entry as a checklist with a filter box, grouped by source file (top-level constants) or by table export name (object tables). Checking an entry hands it a live slider/toggle/color picker; unchecking resets it to its initial value. Kind is inferred from the value: `number` → slider, `boolean` → toggle, a `"#rgb"`/`"#rrggbb"`/`"#rrggbbaa"` string → color.

**Liveness.** An edit applies live wherever the code reads the constant/table entry at use time. A value captured once at init — passed into a function call, baked into worldgen — only picks up the new value on reload. Overrides persist in `localStorage` per game (key `jg-devtools:<game name>`) and are re-applied *before* `loop.onInit` runs, so even an init-baked constant respects its override after a refresh — *if* the read happens at or after `onInit`. A read that happens earlier than that (see below) never sees the override, reload or not.

**Default assumption: almost every gameplay number, boolean, and color is a tunable, not a hardcoded fact.** Walk speed, jump height, gravity, damage, cooldowns, spawn rates, drop chances, radii, durations, thresholds, multipliers, colors — if it's a scalar a designer would plausibly want to nudge while playing, it belongs in a place discovery can see (a top-level `export const`, or a scalar field — nested objects and arrays are scanned too — on an exported catalog/config object like `PlayerDef`/`EnemyDef`) — never a bare literal inline in logic with no named export, and never computed once and thrown away. Treat "should this be tunable" as opt-out, not opt-in.

**Catalog-derived content must read fields live, not bake them at import time.** A common trap: a `content.ts` (or any module implementing `GameContextContent`) that loops over a catalog array *once at module scope* and copies scalar fields into a separately cached `Map`:

```ts
// WRONG — copies walkSpeed by value at import time, before devtools can even scan exports
const entityEntries = new Map<string, GameContextEntityEntry>();
for (const p of players) {
  entityEntries.set(p.id, { stats: p.stats, movement: { poses: p.poses, walkSpeed: p.walkSpeed } });
}
export const content: GameContextContent = {
  entityById: (id) => entityEntries.get(id) ?? null,
};
```

This runs during module import — earlier than `discoverGameTunables`/override-application in `apps/dev/src/main.tsx`, and earlier than any `loop.onInit`. The catalog object (`p`) still gets live-mutated by devtools, but nothing ever re-reads it, so the baked `walkSpeed` is permanently stale: no F2 edit and no persisted override ever reaches gameplay, reload or not.

```ts
// RIGHT — map ids to the catalog def itself; build the entry fresh on every lookup
const playersById = new Map(players.map((p) => [p.id, p]));
function entityById(id: string): GameContextEntityEntry | null {
  const p = playersById.get(id);
  return p === undefined ? null : { stats: p.stats, movement: { poses: p.poses, walkSpeed: p.walkSpeed } };
}
export const content: GameContextContent = { entityById };
```

Same shape, same call site — the only change is *when* `p.walkSpeed` is read: at lookup time (each spawn) instead of once at import. Objects (`stats`, `receive`) are already reference-safe to pass through either way; this only matters for scalars (numbers/booleans/strings) copied out of a catalog def.

**`tunable()` still exists — an optional low-level primitive, not the recommended path.** Reach for it only when you need explicit bounds, an `options` select, or a change subscription that discovery can't infer:

```ts
import { tunable } from "@jgengine/core/devtools/devtools";

const gravity = tunable("physics/gravity", -22, { min: -60, max: 0 });
```

Read `gravity.value` at use time (or `gravity.subscribe(listener)`) — never destructure once at module load. A `"group/label"` name (e.g. `"physics/gravity"`) groups the control under `group` in the Tune tab; `devtools.controls.register` is the same call underneath. Real example: `Games/voxel-mine/src/loop.ts` — `tunable("mining/reach", REACH, { min: 2, max: 16, step: 1 })`, read via a getter passed to `createEditorHandlers`.

**Agent loop.** The overlay's "Copy report" button and `window.__JG_DEVTOOLS.snapshot()` share a **lean** JSON: `why` (diagnosis string), compact frame stats + top phases, `longFrameSummary` (culprit counts + max draws/geos), last 6 long frames (culprit/reason/phases/render/probes), render sample, probes, warn/error logs only, and only **changed** controls / **enabled** discovered tunables — not the full tunable catalog or 40-hit sparkline history. Need the kitchen sink? `window.__JG_DEVTOOLS.snapshotFull()` (or `snapshotDevtools()` from game code) returns the raw `DevtoolsSnapshot`. `window.__JG_DEVTOOLS.discover` is exposed directly too (`list`/`enable`/`disable`/`bind`/`scanTable`/`scanModule`/`clear`) so an agent can flip a discovered tunable on and read/write it from the console without touching the UI.

`devtools.probes.register("name", () => value)` (`@jgengine/core/devtools/devtools`) surfaces a game-specific gauge (entity count, queue depth, whatever) in both the Perf tab and the snapshot; call the returned unregister function to remove it.

## Assets — real art from day one

Squares as enemies, colored boxes as buildings, and a flat grid floor read as *broken*, not unfinished. The blueprint's **Asset plan** names the packs before the first edit; a pass does not end while any default-material primitive, unstyled ground plane, or debug grid is visible in the staged screenshot — and that includes 2D HUD art: a first-letter tile, emoji, or one generic shape reused per slot is a placeholder exactly like a graybox enemy. Primitive stand-ins are allowed only *mid-pass* as scaffolding.

**One command — `assets add <query>`.** Don't memorize which of four systems owns a thing. Ask for it by name and paste the wiring it prints; it fuzzy-searches *every* catalog at once — 3D models, whole packs, the HUD component registry, and `game-icon` glyphs — and for a model or pack it also pulls + reindexes so the id is live:

| You want… | Run | Reference it as |
|-----------|-----|-----------------|
| A 3D model (tree, astronaut) | `assets add astronaut --dir ../../apps/dev/public` | `catalog.resolve("kenney-space/astronautA")!.url` in an `entityModels`/`objectModels` seam |
| A whole style pack | `assets add nature --dir ../../apps/dev/public` | any pulled id (browse with `assets list --source kenney-nature`) |
| A HUD component (health/mana bar, boss bar, inventory, dialogue…) | `assets add "mana bar"` → prints the `npx shadcn add …` line | `<VitalBar … />` from `@/components/ui/vital-bar` |
| An item / ability icon | `assets add sword` | `<GameIcon name="sword" />` (or `iconForItemId`) |

`--kind model|pack|component|icon` disambiguates a broad query, `--json` emits the ranked matches, and `findAssets(query)` from `@jgengine/assets` is the same search in code. The HUD component + icon catalogs are the shadcn registry at `jgengine.com/r` — 70+ presentational and engine-bound widgets (`vital-bar`, `boss-bar`, `resource-orb`, `ability-action-bar`, `inventory-slot-grid`, `dialogue-panel`, …). Search before you build: the "mana pool component" almost certainly already exists.

**Sources** (CC0 — public domain, commercial use, no attribution — unless noted):

| Source | What you get |
|--------|--------------|
| [Kenney.nl](https://kenney.nl) | 40,000+ CC0 assets: characters, buildings, nature, vehicles, weapons, UI, audio — the broadest single library |
| [Quaternius](https://quaternius.com) / [KayKit](https://kaylousberg.itch.io) | CC0 low-poly packs incl. **rigged + animated characters**: medieval, sci-fi, dungeons, animals, adventurers |
| [Poly Haven](https://polyhaven.com) / [ambientCG](https://ambientcg.com) | CC0 PBR textures, HDRIs, materials — the floor comes from here, never a flat color |
| [Poly Pizza](https://poly.pizza) | Search engine over thousands of CC0 low-poly models for one specific thing |
| [Game-Icons.net](https://game-icons.net) (CC BY 3.0 — credit it) / Kenney UI packs (CC0) | 4,000+ item/ability **icon silhouettes** — the registry `game-icon` item covers common HUD glyphs first |
| [jgengine HUD registry](https://jgengine.com/r) — this repo, `assets add <name>` | 70+ React **HUD components** (vital/boss/xp bars, resource orbs, unit frames, inventories, action bars, panels, menus) — the widget you're about to hand-roll already exists |
| [itch.io CC0 3D tag](https://itch.io/game-assets/assets-cc0/tag-3d) / [OpenGameArt](https://opengameart.org) | Long tail — **check the license per asset**, CC0 filter first |
| [Mixamo](https://www.mixamo.com) | Free humanoid animations (Adobe license — fine for shipped games, not CC0) |
| Kenney audio / [freesound CC0 filter](https://freesound.org) | Hit sounds, UI clicks, ambience |

**Rules:**

1. **One style family per game.** Kenney + Quaternius + KayKit low-poly mix fine; low-poly models on photoreal PBR ground reads broken. Name the family in the blueprint.
2. **License discipline.** CC0 needs nothing; anything else gets a line in `src/game/assets-credits.md` (source, author, license). Never ship an asset you can't name the license of.
3. **Wire through the engine seams.** GLB models live in the game's `src/game/assets.ts` render catalog keyed by catalog id; billboards via `entitySprites`, real meshes via `entityModels`/`objectModels` in `defineGame({...})`; ground/skies belong to the world layer. Catalog `model` fields reference asset keys — never file paths in game logic. The fast path is **`assets add <query>`** (see "One command" above): it pulls + reindexes the pack and prints this exact wiring. Under the hood it's **`@jgengine/assets`** — `buildCatalog({ basePath })` → resolve ids/aliases → urls, with `pull` landing packs in your app's `public/models/` (extracting Kenney's shared `Textures/` alongside the GLBs so models render textured). Network-restricted: `pull`/`add` fall back through `--mirror <baseUrl>` / `JGENGINE_ASSETS_MIRROR`, and `--offline` fails fast — see the package README for the fallback order. A 403/CONNECT failure on a provider host (kenney.nl, quaternius.com, poly.pizza) in a sandboxed session means the environment's network policy blocks that host — it is not transient, so don't retry: use a mirror, or build with procedural three.js geometry and note the gap.
4. **Coverage follows the content budget.** Every entity family, placed object, and held item maps to a real asset *before* the catalog entry ships. If the pack lacks a model, restyle the noun to one it has — rename the fantasy, don't ship a cube.
5. **Scale/pivot sanity.** `@jgengine/assets` measures each model's footprint/center/`minY` at reindex and ships them on the catalog entry (`catalog.resolve(id).dims`); with `objectModels` anchor `"center"` (the default) the shell centers the footprint on the placement point and ground-snaps the lowest vertex — so `object.place(id, cellX, y, cellZ, { rotation })` renders centered + grounded with no pivot math and no `dimensions.ts`. Anchor `"origin"` opts back into the raw GLB origin. Check the first placement of each model against its catalog `footprint`; one wrong pivot repeated 100 times is a rebuild.
6. **Item and ability icons are assets too.** Every hotbar/inventory/ability slot renders a real, distinct icon — the registry `game-icon` catalog (`iconForItemId`/`iconForAction`) or a Game-Icons/Kenney silhouette — per the UI quality bar's real-icons rule. `assets add <name>` finds the glyph (or a whole HUD component) and prints the usage.

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

- [ ] `game.config.ts` (`defineGame` from `@jgengine/shell/defineGame`) + `index.tsx` (barrel) + `main.tsx` (standalone host) + `loop.ts` + `game/content.ts`
- [ ] Catalogs: `game/entities/<role>/catalog.ts`, `game/items/<domain>/catalog.ts`, `game/objects/catalog.ts`; loot tables beside their domain
- [ ] Entity `stats` + `receive` orders aligned on the same stat ids; `role` set (drives targeting + camera)
- [ ] `game/items/use-handlers.ts` registered in `onInit`; handlers read `getTarget`/`aim`, never a target input
- [ ] `game/loadouts.ts` + `applyLoadout` in `onNewPlayer` (gated on `isNew`)
- [ ] `game/quests/catalog.ts` + binds; if using xp/level, a game-owned curve fed to `game/progression` (`curve`/`leveling`) — **with their HUD/tracker, or cut**
- [ ] `onInit`: register handlers/loadouts/loot/quests, event listeners, feed binds, leaderboard tracks; `setupWorld`
- [ ] Player spawns with `id === ctx.player.userId`
- [ ] `game/ui/GameUI.tsx` owns layout; components use `@jgengine/react` hooks
- [ ] UI passes the **quality bar** above (contrast, scale, framing, genre fit) — not just hook wiring
- [ ] Camera tuned via `camera` in `defineGame({...})` — defaults untouched means the feel was never checked
- [ ] For an `environment()` world: a `<game>.world.test.ts` asserts `summarizeEnvironment(world)` (`@jgengine/core/world/environmentSummary`) is non-empty with the expected counts — the browserless scene-correctness gate
- [ ] HUD screenshotted over a staged `GameUiPreview` scenario and **judged by looking at the image** against the UI quality bar in [`reference/ui-react.md`](reference/ui-react.md) — the final human glance, not the verification loop
- [ ] Co-located bun tests for pure game math (curves, cooldowns, spawn logic)
- [ ] Multiplayer via adapter config only; no direct backend calls

## Quick reference

```
defineGame (shell) engine fields (assets, world, physics, inventories, input, server, save, time, feed, multiplayer)
                   + presentation fields (content, loop, GameUI, camera, environment, shadows, movement, devtools, …) in one call — smart defaults fill the rest
defineGame (core)  the underlying engine-only primitive: assets, world, physics, inventories, input, server, save, time, feed, multiplayer, loop
PlayableGame       { game, content, loop, GameUI, camera, … } — the runner contract `defineGame` (shell) returns
GameContext        ctx.scene / ctx.game / ctx.player / ctx.item / ctx.camera / ctx.input + subscribe/version
scene.object       place, remove, move, rotate, at, setVisual (per-instance ObjectVisual: scale/color/opacity override)
scene.entity       spawn (anchor/offset), despawn, setPose, update; stats; targeting; effects;
                   projectiles (object-aware raycasts); spatial queries (opt-in grid broadphase)
entity.stats       get / set / delta — bounded stats (health, mana, xp, level) on instances
progression        game/progression — curve() / leveling() over bounded xp/level stats
item.use           catalog `use` → GameContext handler; no input.to
effects            drain-signed magnitudes; receive.<effect>.order; AoE = effect + at/radius/los
projectiles        willHit → fire → settle; ballistic via weapon.projectile
death              onDeath (reason-aware drops/command), entity.died, auto kill attribution + drop grant
game.loot          register / has / roll / grantToPlayer   (lootTable() = pure factory)
game.trade         canBuy / canSell / buy / sell / tradableAt
game.quest         register, accept…turnIn, bind(entity.died | inventory.added), declarative rewards
game.social        friends (persisted, requests listable), party (ephemeral, invites listable), presence, emotes (nearby broadcast), worldInvites (accept → join target)
game.chat          send / whisper / history / register — global/party/proximity channels, rate-limited, mute via blocked set
game.roster        capture / release / list / setEquipped — persisted owned-creature roster
game.store/cards/turn   store: keyed reactive slot; cards.pile(id): lazy CardPile; turn.loop(id): lazy TurnLoop
game.events/feed/leaderboard   on / bind+push+recent / track+increment+getTop
devtools           F2 overlay (Perf/Tune/Logs/Net/Keys); Perf = fps + phase breakdown + long-frame culprit/reason log + sim-vs-outside budget; profile.measure/begin/add names spans inside onTick; Copy report / __JG_DEVTOOLS.snapshot() = lean why+phases+longFrameSummary (snapshotFull for raw); zero-annotation tunables into Tune
applyLoadout       all-or-nothing kit seeding per userId
player.movement    pose (hitboxes) + aim (zoom modifier)
player.motion      impulse / setVerticalVelocity / setY — vertical-motion seam into the shell's frame driver
player.possession  own/disown/owns/listOwned + active + possess — control-swap, rebinds shell camera
player.cosmetics   register + apply/equip + get — per-player appearance slots, no gameplay effect
scene.entity.form  register + shapeshift/revert + active/abilities — movement+ability+mesh bundle, game-time duration
proximityPrompt    { radius, display: {kind}, invoke } — one float-UI primitive
skillCheck/qte     evaluateSkillCheck (moving zone + window) / evaluateQteSequence (timed steps)
captureCheck       captureChance / rollCapture — hp% + catchPower → probability
dialogue check     DialogueChoice.check (roll vs DC + advantage/disadvantage) → onSuccess/onFailure
world features     biomes / voxel / plots / tilemap / flat descriptors
physics/physicsWorld  optional headless rigid-body sim (PhysicsWorld) — not the defineGame physics field (gravity/jumpVelocity, honored by the kinematics controller); bodies are box (halfExtents) or sphere (radius)
physics/ballisticSweep  createBallisticSweep(world) → arc-vs-body hit test; wire into ProjectileSystemDeps.sweepBallistic
anim/easing        lerp/clamp01/smoothstep/tween/timedProgress + easeIn/Out/InOut Quad/Cubic + easeOutBack/Elastic — pure 0..1 tweening math
data/dataSource    createDataSource/createJsonDataSource — idle/loading/ready/error async state + polling; data/fetchJson + data/devProxy for CORS-safe dev fetches
audio/audioFalloff computeFalloffGain / resolveEmitterGain — pure distance→gain curve; shell plays it
time/beatClock     createBeatClock (BPM ticks) + createBeatInputBuffer (buffered action → next beat)
ws/voiceChannel    createVoiceChannelRouter — positional falloff + simultaneous non-positional channels
multiplayer/identity   AuthSession + sessionPlayer + resolveGuestSession — Clerk/better-auth via react structural adapters
multiplayer/chatContract  ChatTransport (hooks) / ChatSync (callbacks) — ws + convex bindings, local for dev
multiplayer/voiceContract VoiceTransport (join/leave/publish/subscribers) + createPushToTalk — media plane host-supplied
GameBackend        { transport, feeds?, presence? } — Convex is one adapter (createConvexBackend)
adapter kinds      offline / ws / convex / socketIo / p2p / lan (+ fly({app}) ws sugar) — runtime/adapter
ws/pipe            TransportPipe/TransportPipeFactory — any bidirectional string channel (webSocketPipe default)
ws/host, ws/hostRouter  browser-safe createGameHost + createHostRouter/loopbackPipe (node re-exports both)
ws/peer            createPeerHost/createPeerGuest — WebRTC P2P, host tab authoritative, copy-paste signal codes
ws/socketIoPipe, node/socketIoServer  socketIoPipe/createSocketIoBackend + attachGameSocketIoServer
@jgengine/react    GameProvider + hooks + headless primitives (incl. identity/chat/voice/social kits); layout only in GameUI.tsx
```

Engine ships verbs and primitives. Your game ships nouns.
