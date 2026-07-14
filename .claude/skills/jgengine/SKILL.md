---
name: jgengine
description: Main skill — intake, foundation, and routing for JGengine games.
---

# JGengine

JGengine is a pure-TypeScript game-engine SDK for games built by AI coding agents. Its skills teach the agent how to use the SDK. When a user says “make X with JGengine” or “make X with jgengine.com,” treat that as sufficient intake. If the skills are not installed, run `npx jgengine skills`; then use this skill and build on the SDK. Do not make the user discover or name skills.

## Where the game lives

The game is **its own project in its own repo/directory**, built on the published npm packages (`@jgengine/core`, `@jgengine/react`, `@jgengine/shell`, …) via the `npx jgengine` CLI and these skills.

- **Never clone the jgengine GitHub repo to build a game.** The repo is the engine's development monorepo, not a starter. Scaffold with `npx jgengine create` and depend on the npm packages.
- **Never copy code, assets, catalogs, or content from the repo's `Games/*` directory.** Those are private in-repo test games (some recreate well-known commercial titles for engine-gap probing) — they are not templates, and their content is not licensed for reuse. Build the user's game from their intake using the documented API surface below.
- The only jgengine sources in a game project are the npm dependencies and the installed skills.

## Intake

State the reading as a short numbered list that is easy to correct, then proceed unless the user changes it. Prefer concrete values and actions over prose:

1. **POV:** first-person
2. **World:** custom 3D wasteland with three settlements
3. **Core loop:** get quests by talking to people → defeat enemies → return to redeem quests
4. **Interaction:** collect ground items by walking over them; interact with people and doors at close range
5. **Combat:** ranged weapons, damage, death, loot
6. **Progression:** inventory, currency, quest rewards, upgrades
7. **Players:** single-player, or name the multiplayer topology and synchronized systems
8. **UI:** visible controls, objective tracker, health, inventory feedback
9. **Art direction:** one aesthetic, palette, asset family, and UI voice
10. **Done looks like:** one observable end-to-end play scenario

Keep this compact—roughly one line per item. It is a build map, not a large specification or an approval gate. Infer conventional details from the named game or genre. Ask only when two plausible readings would fundamentally change the game.

## Route selectively

This skill is the foundation for every task (packages, project shape, defineGame, context, catalogs). After intake, also read only the domain skills the work needs:

| Need | Read |
| --- | --- |
| Terrain, scenes, camera, movement, physics, maps, sensors | `jgengine-world` |
| Seeded generation, terrain/environment generation, grids, buildings, simulation | `jgengine-procedural` |
| Damage, effects, weapons, targeting, projectiles, loot, death | `jgengine-combat` |
| Items, quests, dialogue, economy, crafting, objectives, turns, social systems | `jgengine-gameplay` |
| Networking adapters, authority, rooms/topology, persistence/backend seams | `jgengine-multiplayer` |
| React HUD, shell affordances, controls, feedback, accessibility | `jgengine-ui` |
| Models, sprites, textures, audio, catalogs, attribution | `jgengine-assets` |
| Proof and screenshots | `jgengine-verify` after implementation |

Do not read every domain by default. Build through documented engine surfaces; do not infer APIs from gallery games. Inspect engine source only when a documented surface appears wrong or a missing primitive blocks the work.

**Before hand-rolling any mechanic, check the domain's `capabilities.md`.** Each selected domain skill carries a generated `capabilities.md` — an intent→primitive index (`the thing you need` → `the import line`). Toast/announcer feeds, charge/decay meters, mm:ss clocks, best-time persistence, minimaps, and the like already exist as primitives; grep the capability index for the concept before writing your own. Re-implementing a listed capability is the papercut this index exists to kill.

## Build behavior

Scaffold with `npx jgengine create game-name --name "Game Name"` when needed. Build the requested game continuously from the intake, keeping systems end-to-end rather than leaving registered-but-unusable pieces. Use real assets and visible feedback early. Verify at completion with `jgengine-verify`.

Cartridge-shaped games (declarative config, engine-owned loop): see [reference-cartridge.md](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine/reference-cartridge.md).

---

The engine ships **verbs and primitives**; your game ships **nouns** (catalogs) and thin handlers. This skill is that foundation plus intake. Use domain skills only when needed; use `jgengine-verify` afterward. UI guidance lives in [`../jgengine-ui/reference.md`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-ui/reference.md); assets live in `jgengine-assets`.

Load detailed references only for the selected domain: [`jgengine-combat`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-combat/reference.md), [`jgengine-world`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-world/reference.md), [`jgengine-multiplayer`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-multiplayer/reference.md), and [`jgengine-ui`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-ui/reference.md). Each domain skill explains when its reference is needed.

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
| Scene instance role | `scene/entityStore` | `EntityRole`, `SceneEntity`, `SpawnOptions`, `EntityPose` |
| Object spatial queries | `scene/objectQuery` | `raycastObjects`, `raycastObjectsAll`, `ObjectRaycastInput`, `ObjectRaycastHit` — backs `ctx.scene.object.raycast`/`raycastAll` |
| Runtime paint layer | `scene/paintLayer` | `createPaintLayer`, `PaintLayer`, `PaintStroke` — backs `ctx.scene.entity.paint` |
| Possession | `scene/possession` | `createPossession`, `Possession`, `PossessionDeps`, `PossessionSwappedEvent` |
| Form / shapeshift | `scene/form` | `createForms`, `Forms`, `FormDef`, `FormsDeps`, `FormChangedEvent` |
| Multiplayer adapters | `runtime/adapter` | `offline`, `ws`, `convex`, `socketIo`, `p2p`, `lan`, `fly`, `servers`, `MultiplayerTopology`, `ServersPoolConfig` |
| Loot | `game/lootTable` | `lootTable`, `LootTableDef`, `LootEntry`, `Drop` |
| Dropped-item entity | `game/worldItem` | `WORLD_ITEM_ENTITY_NAME`, `WorldItemRecord`, `WorldItemSpawnInput`, `createWorldItemStore`, `resolveDeathDrops`, `scatterOffset`, `scatterPosition`, `selectNearestWorldItem`, `resolveWorldItemPresentation`, `RarityStyle`, `WorldItemPresentation`, `DEFAULT_RARITY`, `DEFAULT_PICKUP_RADIUS`, `DEFAULT_SCATTER` |
| Loot filter | `game/lootFilter` | `lootFilter`, `evaluateLootFilter`, `LootFilterRule`, `LootFilterCondition`, `LootFilterItem`, `LootFilterOverride` |
| Loadout | `game/loadout` | `LoadoutDef`, `LoadoutItemEntry`, `Loadouts` |
| Cosmetic loadout | `game/cosmetics` | `createCosmetics`, `Cosmetics`, `CosmeticLoadoutDef` |
| Quest | `game/quest` | `QuestDef`, `QuestRewards`, `QuestObjective`, `QuestJournal` |
| World features | `world/features` | `WorldFeature`, `biomes`, `voxel`, `plots`, `tilemap`, `flat`, `environment`, `terrain`, `rain`, `snow`, `grass`, `ocean`, `building`, `road` |
| Street layout | `world/streets` | `laneCenters`, `sidewalkPaths`, `furnitureSpots`, `parkingSpots`, `sidewalkPoint`, `offsetPath`, `sidewalkWidthOf`, `StreetLane`, `FurnitureSpot`, `ParkingSpot` — where things belong on a `road()`: lanes for traffic, sidewalks for peds, curb anchors for furniture |
| Road ribbons | `world/roads` | `buildRoadRibbon`, `dashSegments`, `nearestOnPath`, `isOnRoad`, `pathLength`, `RoadRibbon`, `RoadSample`, `RoadPoint` — geometry + queries behind the `road()` environment feature |
| Voxel field | `world/voxelField` | `createVoxelField`, `VoxelField`, `VoxelCell`, `VoxelHit`, `VoxelBounds`, `VoxelFieldSummary`, `VoxelFace`, `VOXEL_FACES`, `VOXEL_FACE_NORMALS` — a chunked block lattice, distinct from the `voxel()` `WorldFeature` descriptor |
| Terrain field | `world/terrain` | `TerrainField`, `noiseField`, `resolveTerrainField`, `rollingField`, `fractalNoise`, `valueNoise`, `withNormal`, `arenaField`, `flatField`, `resolveGroundStep`, `snapToGround`, `snapEntityToGround`, `resolveTerrainPalette`, `TERRAIN_MATERIAL_PALETTES` |
| Seeded RNG | `random/rng` | `seededRng`, `seededStreams` |
| Seed share link | `random/seedLink` | `withSeedParam`, `seedFromUrl`, `seedFromSearch`, `dailySeed`, `DEFAULT_SEED_PARAM` — encode/decode a world seed to/from a shareable URL query param; `dailySeed` is the UTC daily-run seed |
| Name generator | `random/nameGen` | `createNameGenerator`, `pickFrom`, `fillTemplate`, `NameGenerator`, `NameGeneratorOptions`, `SyllableBank` |
| Regions | `world/regions` | `createRegionField`, `isRegionField`, `RegionDef`, `RegionField`, `RegionSample` |
| Wind field | `world/wind` | `windField`, `WindField`, `WindFieldConfig`, `WindVector` |
| Water surface | `world/water` | `waterSurface`, `waterSurfaceFromDescriptor`, `synthesizeWaves`, `WaterSurface`, `GerstnerWave` |
| Scatter | `world/scatter` | `scatter`, `scatterAabb`, `ScatterConfig`, `ScatterPoint` |
| Content scatter | `world/scatterItems` | `scatterItems`, `pickWeighted`, `ScatterLayer`, `ScatterInstance` |
| Building generator | `world/buildings` | `generateBuilding`, `generateBuildingDistrict`, `createBuildingGrid`, `GeneratedBuilding` |
| Building index | `world/buildingIndex` | `buildingIndex`, `BuildingIndex`, `BuildingHit` |
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
| Touch controls | `input/touchScheme` | `deriveTouchScheme`, `touchCode`, `touchActionLabel`, `touchButtonShape`, `withTouchCodes`, `TouchControlsConfig`, `TouchGestureBindings`, `TouchDragBinding`, `TouchButtonSpec`, `TouchButtonShape`, `TouchAnchor`, `TouchLayoutConfig`, `TouchMovementConfig`, `TouchStyle`, `TOUCH_STYLE_OPTIONS`, `TouchScheme`, `TouchJoystick`, `TouchButton` — `shape`/`anchor`/`layout`/`movement.axis`/`style` refine the derived dock; player picks the skin in Settings → Controls |
| Pointer hit | `input/pointer` | `PointerHit`, `PointerButton`, `aimToPoint`, `moveTargetFromHit`, `groundOf`, `PointerVec3` |
| Navmesh + A* | `nav/navGrid` | `createNavGrid`, `findPath`, `smoothPath`, `NavGrid`, `NavGridConfig`, `NavPoint`, `FindPathOptions` |
| Path follow | `nav/pathFollow` | `createPathFollow`, `advancePathFollow`, `pathFromNav`, `PathFollowConfig`, `PathFollowState`, `Waypoint` |
| Nav-grid movement constraint | `nav/navConstrain` | `constrainToNavGrid`, `NavConstrainProposed`, `NavConstrainEntity`, `NavConstrainOptions` — a standalone walkable-pass-through + wall-slide helper; adapt its `(proposed, entity)` shape to `PlayerMovementConfig.beforeCommit`'s `(frame) => [x,y,z]` with a small closure |
| Selection set | `scene/selection` | `createSelectionSet`, `SelectionSet`, `screenRect`, `selectWithinRect`, `rectContainsPoint`, `isMarquee`, `ScreenRect` |
| Context menu | `interaction/contextMenu` | `contextVerb`, `buildContextMenu`, `contextVerbInput`, `ContextVerb`, `ContextMenu` |
| Shared / group wallet | `economy/sharedWallet` | `createWalletBook`, `WalletBook`, `WalletScope`, `userScope`, `groupScope`, `balanceIn`, `grantTo`, `chargeFrom`, `contributionOf`, `contributorsOf` |
| Analog axis input | `input/axisInput` | `AxisInput`, `AxisChannel`, `AxisBindingMap`, `DRIVE_AXIS_BINDINGS`, `clampAxis`, `rampToward`, `NEUTRAL_AXIS` |
| Raw control polling | `runtime/inputSnapshot` | `createInputSnapshot`, `InputSnapshot` (`isDown`, `justPressed`, `justReleased`, `held`, `axis`) — backs `ctx.input` |
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
| Beat clock | `time/beatClock` | `createBeatClock`, `createBeatInputBuffer`, `nextBeatTime`, `BeatClock`, `BeatClockConfig`, `BeatSnapshot`, `BeatInputBuffer`, `BufferedAction` |
| Spawn director | `ai/spawnDirector` | `createSpawnDirectorState`, `advanceSpawnDirector`, `advanceWave`, `raiseAlert`, `pickSpawnPoint`, `SpawnDirectorConfig`, `WaveManifest`, `SpawnEntry`, `SpawnRequest`, `DirectorContext` |
| Threat table | `ai/threat` | `createThreatTable`, `ThreatTable`, `ThreatTableConfig`, `ThreatEntry`, `HighestThreatOptions` |
| Group-assist aggro | `ai/groupAssist` | `createAssistNetwork`, `AssistNetwork`, `AssistNetworkConfig`, `AssistMember` — propagates one member's threat gains to same-group members (optional radius + `distanceBetween` gating) so a single pull rallies the group |
| Job board | `ai/jobBoard` | `createJobBoard`, `JobBoard`, `JobDef`, `Job`, `JobPhase`, `WorkerState`, `JobReport`, `JobTickContext` |
| Crowd flow | `ai/crowd` | `computeFlowField`, `createCrowdField`, `selectPoi`, `FlowField`, `FlowFieldOptions`, `CrowdField`, `Poi`, `SelectPoiOptions` |
| Factions & reputation | `faction/factions`, `faction/reputation` | `createFactionGraph`, `createFactionRoster`, `FactionRelation`, `FactionDef`, `FactionGraph`, `FactionRoster`, `createReputationLedger`, `DEFAULT_REPUTATION_TIERS`, `tierForStanding`, `effectiveRelation`, `ReputationTier`, `ReputationLedger` |
| Physics actors | `physics/ragdoll`, `physics/carryable`, `physics/forceVolume`, `physics/spatialGrid` | `createRagdoll`, `Ragdoll`, `Carryable`, `carrySpeedMultiplier`, `ForceVolume`, `PlatformCarry`, `SpatialGrid` |
| Traversal (grapple/glide) | `physics/traversal` | `Grapple`, `GrappleConfig`, `Glide`, `GlideConfig` |
| Structural destruction | `physics/structure` | `StructureGraph`, `StructureNodeSpec`, `StructureEdgeSpec`, `StructureMaterial`, `StructureMaterialTable`, `CollapseEvent`, `DebrisConfig` |
| Destructible terrain | `world/carve` | `VoxelVolume`, `VoxelMaterial`, `VoxelMaterialTable`, `CarvableField`, `carvableTerrain`, `CarveOp`, `DepositOp`, `CraterOp`, `MoundOp`, `EMPTY_VOXEL` |
| Vehicle body | `physics/vehicleBody` | `createVehicleBody`, `VehicleBody`, `VehicleBodyConfig`, `WheelSpec`, `GripCurve`, `sampleGripCurve`, `DEFAULT_GRIP_CURVE` |
| Buoyant boat | `physics/buoyancy` | `createBuoyantBody`, `BuoyantBody`, `BuoyantBodyConfig` |
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
| Race state | `game/race` | `raceTrack`, `RaceTrack`, `createRaceState`, `RaceState`, `RaceEvent`, `RaceWinCondition`, `firstPastPost`, `topK`, `lastStanding`, `everyoneFinishes` |
| Race session | `game/race` | `RacePhase`, `RaceSessionState`, `idleRaceSession`, `startRaceCountdown`, `tickRaceSession`, `finishRaceSession` — pure `idle→countdown→racing→finished` clock; `racePlacements`, `placementOf`, `raceOutcomeOf` derive placement/win-lose from a finish order |
| Reveal query | `sensor/revealQuery` | `createRevealQuery`, `RevealQuery`, `RevealQueryOptions`, `RevealHit` |
| Hidden-state probe | `sensor/hiddenStateProbe` | `probeHiddenState`, `probeHiddenStateAll`, `HiddenStateSource`, `HiddenStateValue`, `SensorProbeOptions`, `SensorReading` |
| View-frustum sensor | `sensor/frustumSensor` | `createFrustumSensor`, `projectToView`, `framingScore`, `FrustumCamera`, `FrustumTarget`, `FrustumProjection`, `FrustumSample`, `FrustumSensor`, `FramingConfig` |
| Recording buffer | `sensor/recordingBuffer` | `createRecordingBuffer`, `RecordingBuffer`, `RecordingFrame`, `RecordingBufferOptions` |
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
| Ability kit | `combat/abilityKit` | `createAbilityKit`, `AbilityKit`, `AbilitySlotConfig`, `AbilitySlotSnapshot`, `AbilitySlotState`, `AbilityCastType`, `AbilityCastResult`, `AbilitySlotRetune` |
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
| Devtools overlay + tunables | `devtools/devtools` | `devtools`, `createDevtools`, `tunable`, `snapshotDevtools`, `instrumentLatency`, `Tunable`, `TunableOptions`, `TunableAccessor`, `DevtoolsControl`, `DiscoveredEntry`, `DevtoolsOverrides`, `DevtoolsSnapshot` |
| Tunable auto-discovery | `devtools/transformTunables` | `transformTunableExports`, `tunableModuleTable`, `tunableDiscoveryPlugin`, `TunableTransformResult` |

## Getting started (new project)

Fastest path — the `jgengine` CLI scaffolds the entire canonical shape below (harness, skeleton, stub game, verify test, AGENTS.md) as a booting game:

```sh
npx jgengine create my-game   # then: cd my-game && bun dev
npx jgengine doctor           # later, if the setup drifts (version skew, unstyled HUD, shape strays)
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

Every game is one shape, enforced by `check-game-shape` (part of `check-types`): the top of `src/` holds only the skeleton, and every game-specific module, UI component, and test lives under `src/game/`. In this repo the gate also requires a root `package.json` script `"games:<id>": "bun run --cwd Games/<id> dev"` for every `Games/*` directory — add it with the scaffold, or the very first `check-types` fails before the compiler even runs. Dense files — one `catalog.ts` per domain, never one file per entry.

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

## `defineGame` — the single authoring entry

`@jgengine/shell/defineGame` is the game-authoring entry: one call in `game.config.ts` takes both engine fields (`name`, `assets`, `world`, `physics`, `inventories`, `input`, `server`, `save`, `time`, `feed`, `multiplayer`) and presentation fields (`content`, `loop`, `GameUI`, `camera`, `environment`, `WorldOverlay`, `renderEntity`, `renderObject`, `entitySprites`, `entityModels`, `objectModels`, `hotbarSelection`, `prompts`, `pointer`, `touch`, `worldHealthBars`, `audio`, `entitySounds`, `objectSounds`, `worldItem`, `shadows`, `collision`, `movement`, `devtools`) and returns a ready `PlayableGame` — no separate object to assemble. It is a thin wrapper over the core `defineGame` primitive (below) plus the `PlayableGame` runner assembly; see `packages/shell/src/defineGame.tsx` for the exact accepted fields. Never game tuning (walk speeds, damage, prompts — those live in catalogs).

**Smart defaults** — omit any of these and the call still resolves: `multiplayer` → `offline()`; `assets` → an empty asset catalog; `loop` hooks (`onInit`/`onNewPlayer`/`onTick`) → no-ops; `content` → `{}`; `GameUI` → an empty component; `camera` → third-person orbit; `feed` → 20-entry ring buffers per action; a `world` of kind `environment()` auto-renders as the backdrop with no `environment` component supplied — a non-`environment()` world (`flat()`, `voxel()`, …) still needs the game to hand it one.

**Opt-in `ctx.game.*` subsystems (`features`)** — core is genre-agnostic: the always-on base is `commands` / `events` / `store` / `feed` (plus `audio`), and genre subsystems are opt-in via `defineGame({ features: { roster, cards, turn, race, leaderboard, social, chat } })`. Omit one and `ctx.game.<name>` is `undefined` — a puzzle game isn't handed a card pile, race state, or party/chat it never asked for. Declare only what the game uses (`chat` implies `social`). (The content cluster — economy/quest/loot/trade — joins this manifest in a later slim-core phase.)

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
- **Keybind → command convention.** The shell fires a command for any bound action that isn't reserved: pressing an action runs a command of the **same name** if one is defined, else a `ui.<action>` fallback (so `openBackpack` → `ui.openBackpack`). Just declare the binding and a matching command — no per-game `keydown` listener. Reserved actions the shell consumes natively and never routes to a command: `moveForward/moveBack/moveLeft/moveRight`, `turnLeft/turnRight`, `sprint`, `jump`, `tabTarget`, `clearTarget`, `useAbility`, `interact`, and any `hotbarSlotN`/`slotN`. `tabTarget`/`clearTarget` run `target.cycle`/`target.clear` (native `cycleTarget`/`setTarget` fallback). Because `hotbarSlotN` never reaches a command, a game that drives selection from game code binds its own `selectSlot1..N` actions, defines matching commands that write a store key, and reads it back through `hotbarSelection: () => ...` on `defineGame` (see `loot-shooter`).
- **`interact`** is special: pressing it resolves the active proximity prompt from the `prompts` field of `defineGame({...})` and runs that prompt's `invoke` command. A prompt with `invoke: null` is display-only and does nothing on the key.
- UI keybind badges derive from `keybinds` via `actionLabel(keybinds, "openBackpack")` — `bindingLabel` maps codes to short labels (`Digit1`→`1`, `KeyB`→`B`, `mouse0`→`LMB`, `Escape`→`Esc`). Never hardcode label strings; they drift the moment a binding changes.
- `server.mode` is a string your loop/commands interpret — the engine ships no gamemode presets.
- Never in defineGame: player tuning, catalog helpers (`defineItems` etc.), game nouns, behaviors, prompts, or inline binding/inventory/world blobs. The one exception is `physics.gravity`/`physics.jumpVelocity` — global controller tuning, not a catalog value (see "Controller kinematics" below).
- `assets` may be omitted for a game with no models (a HUD-only card/board game, say) — `defineGame` injects an empty catalog, so `GameDefinition.assets` is always present downstream with no per-caller `?.` checks.
- `devtools` defaults to `true` — every game gets the F2+D-toggled debug overlay (debug mode) (Perf/Tune/Logs/Net/Keys) for free, and every top-level `export const` number/boolean/color and every exported flat table of them under `src/` is auto-discovered into the Tune tab with zero game code; set `false` to disable the toggle entirely. In the dev runner the Tune tab's **Save to source** button writes changed values back into the game's `.ts` files via the dev server's `/__jgengine/save` endpoint (`@jgengine/core/devtools/rewriteTunables` does the literal rewrite; unlocatable keys are reported skipped). See "Devtools — F2+D overlay and tunables" below.

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

**Capture recipe.** Any game with a start/title screen declares `PlayableGame.capture` at build time: `capture: { play: ["<startCommand>"] }` (the same commands its start buttons dispatch; entries may be `{ name, input }` when a command needs arguments), plus optional named `states` for other screenshot-worthy screens. Without it, `shoot --mode play` fails loudly on the menu. Details: `jgengine-verify`.

**Auto environment.** When `world` is an `environment()` descriptor and `PlayableGame.environment` is unset, the shell renders that descriptor as the backdrop automatically — no manual `environment` wiring needed for the common case. Set `environment` explicitly only to override that default (a custom canvas component always wins). The same auto-render convention covers grid-cell worlds (`biomes`/`voxel`/`plots`/`tilemap`) — see "World features" below.

**Lighting and backdrop.** `PlayableGame.lighting` (`LightingConfig`, `@jgengine/core/game/playableGame`) replaces the shell's hardcoded ambient/directional default when present, regardless of world kind: `ambient?: { color?, intensity? }`, `directional?: { color?, intensity?, position, castShadow? }[]`, `hemisphere?: { skyColor?, groundColor?, intensity? }`. `PlayableGame.backdrop` (`BackdropConfig`) is a generic background/sky/fog for **any** world kind, including a custom `environment` component: `background?: string` (CSS color), `sky?: SkyEnvironmentConfig` (same descriptor `environment()`'s `sky` field takes), `fog?: { color?, near?, far?, density? }` (`density` set switches to exponential `FogExp2` and `near`/`far` are ignored). Both are optional and additive to whatever the world/`environment` renderer already draws.

**Visibility & streaming (automatic).** Every 3D game gets camera frustum + distance culling for free — the shell's `CullingProvider` reads the live camera each frame, runs the engine `createVisibilitySystem` (`@jgengine/core/visibility/visibilitySystem`) over the scene's entities and placed objects, and toggles `group.visible` so off-screen objects are never submitted to the renderer (never unmounted — gameplay and simulation are untouched). Defaults are conservative (a preload margin larger than the view, hysteresis, `Infinity` default render distance) so existing games only benefit. Tune or opt out via `PlayableGame.visibility` (`VisibilityConfig`, `@jgengine/core/visibility/config`): `enabled: false` disables it; `culling`/`streaming` patch the global `CullingSettings`/`StreamingSettings` (`@jgengine/core/visibility/settings`); `scene` sets scene-wide overrides; `entities`/`objects` override by kind name / catalog id (`alwaysVisible`, `maxRenderDistance`, custom `bounds`, `pinned`, `cullingDisabled`, …). The engine layer also ships `@jgengine/core/visibility/spatialIndex` (the 3D hash the culler queries instead of scanning every object), `@jgengine/core/visibility/assetStreaming` (dedup/budget/grace-period asset loading), and `@jgengine/core/visibility/simulationCulling` (opt-in, off by default — throttles low-priority off-screen updates, never protected entities). Full reference: `packages/core/src/visibility/README.md`.

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
| `orbit` (default) | Third-person chase | Top-level fields on `camera` itself — `initialDistance`, `minDistance`/`maxDistance`, `targetHeight`, `min/maxPolarAngle`, drag/zoom. There is **no `camera.orbit` block**; orbit is the one rig tuned at the top level |
| `first` | FPS mouse-look | `firstPerson: { eyeHeight, sensitivity, maxPitch, reticle, viewmodel }` |
| `topDown` | ARPG iso / top-down (Diablo IV, Hades II) | `topDown: { height, pitch, yaw, followSmoothing, zoom }` — decoupled follow; `pitch` is camera elevation (PI/2 = straight down, near 0 = grazing and boom-distance blows up past `frustum.far`) |
| `rts` | Free-pan / edge-scroll (The Sims, Manor Lords) | `rts: { panSpeed, edgeScroll, rotateSpeed, bounds, start, pan }` — `pan: false` turns it into a static backdrop camera: no WASD/arrow pan, no edge-scroll, no Q/E rotate, no wheel zoom, still re-centers on `followEntityId` if one resolves |
| `shoulder` | Over-the-shoulder (Helldivers 2, Remnant II) | `shoulder: { shoulderOffset, distance, ads, side }` — ADS + shoulder-swap (V) |
| `lockOn` | Souls-like strafe (Elden Ring) | `lockOn: { targetEntityId?, distance, framingBias, yawSmoothing }` — yaw binds to player→target; WASD becomes strafe |
| `chase` | Vehicle chase (Forza, Rocket League) | `chase: { distance, springDamping, fov: { base, max, speedForMax }, shakePerSpeed, view: "chase"|"cockpit"|"hood"|"rear" }` |
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
ctx.player          userId, isNew, inventory, stats (modifiers), loadout,
                    applyLoadout, movement (pose/aim), motion (impulse/setVerticalVelocity/setY/takePending),
                    possession, cosmetics
ctx.player.motion   impulse(vy), setVerticalVelocity(vy), setY(y), takePending() — game-code
                    seam into the shell's vertical-motion integrator; drained once per frame
                    before gravity, so a jump pad or grapple release calls this from
                    onTick/commands instead of touching y directly
ctx.item            use, weapon
ctx.input           publish(held), isDown(action), held(), justPressed(action), justReleased(action)
                    — per-frame held-action snapshot, polled from onTick; justPressed/justReleased
                    fire exactly once on the up/down transition frame, replay-safe
ctx.world           ground (TerrainField), groundHeightAt(x, z) — the canonical
                    sampler for the game's declared world; environment worlds
                    resolve their terrain field, every other world kind is 0.
                    Use it for every spawn/placement/waypoint y — never
                    hand-roll a noise sampler or hardcode y = 0 on relief
ctx.camera          follow(entityId | null), followedEntityId(), setCinematic(config), cinematic(),
                    subscribe — runtime camera-follow/cinematic override; the shell reads
                    followedEntityId() each frame, falling back to the static
                    playable.camera.followEntityId when it returns undefined
ctx.time            advance, now, calendar, snapshot; pause, play, toggle,
                    setSpeed, cycleSpeed; after, every, at (game-time timers)
ctx.subscribe / ctx.version    change signal — UI layers bind via useSyncExternalStore
```

`content.itemById(id)` supplies `{ use?, weapon?, trade? }` — exact shapes: `use` is the handler **name string** (not an object), `weapon` is a flat `Record<string, number | Record<string, number>>` built from your catalog stats (`damage`, `projectile.{...}`, `explosion.{...}`), and every lookup returns **`null`** (not `undefined`) for an unknown id; `content.entityById(id)` supplies `{ stats?, receive?, onDeath?, movement?, role? }`; `content.objectById(id)` supplies `GameContextObjectEntry` `{ proximityPrompt?, breakable?, slotInventory? }`. Build all three from your catalogs in `content.ts`. Call-shape gotchas that cost typecheck loops: `ctx.item.use.use(input)` takes **one** argument on the ctx surface (the two-arg `use(state, input)` is the raw factory shape); `ctx.scene.entity.moveToward(id, target, { speed, dt, stopDistance? })` — the third argument is an options object, never a bare `dt`; `nav/pathFollow`'s `createPathFollow(config)` returns the initial `PathFollowState` directly and `advancePathFollow(config, state, dt)` returns the **next state** (with `position: [x,y,z]`, `heading`, `done`) — there is no wrapper object, and `Waypoint` is a `[x, y, z]` tuple. A placed object resolves its catalog entry via `ctx.scene.object.catalog(instanceId)`; `ctx.scene.object.at(x, y, z, tolerance?)` finds placed objects near a point (grid interaction, click resolution beyond the pointer service). `ctx.scene.entity.update(id, patch)` writes a shallow patch onto a spawned entity's mutable fields (e.g. `movement.walkSpeed`) without a full respawn — `scene/movementSpeed`'s `applyStatDrivenSpeed(deps, id, { baseSpeed, multiplierStat?, flatBonusStat? })` is the catalog-driven helper that recomputes and writes `movement.walkSpeed` from a stat-modifier pair each time a buff changes.

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
## External data — `data/dataSource` and the dev proxy

Renderer-free async-state primitives (`@jgengine/core/data`) for a game that reads a live external source (a leaderboard API, a session browser, remote config) — distinct from `ctx.game.store`/multiplayer, which are for the game's own authoritative state.

- **`createDataSource(load, options?)`** (`data/dataSource`) → `DataSource<T>` wraps one `load(signal)` async call as `{ status: "idle"|"loading"|"ready"|"error", data, error }`. `getState()` reads the current snapshot, `subscribe(listener)` fires on every change, `refresh({ force? })` re-runs `load` (de-duplicates a call already in flight unless `force`; aborts the prior call first when forced), `startPolling(intervalMs?)`/`stopPolling()` run `refresh` on an interval (`intervalMs` falls back to the one passed at construction; throws if neither is given), `dispose()` tears down polling and in-flight requests for good. Pass `options.clock` (`{ setInterval, clearInterval }`) to swap the timer source in tests.
- **`fetchJson<T>(url, options?)`** (`data/fetchJson`) — `fetch` + JSON-parse in one call; throws `HttpStatusError` (`status`, `statusText`, `url`) on a non-OK response and `JsonParseError` (`url`, `cause`) on unparsable JSON, so a `DataSource`'s `error` is always one of these two typed shapes, never a bare `Error`. `options.fetchImpl` swaps the fetch implementation for tests/SSR.
- **`createJsonDataSource<T>(url, options?)`** (`data/jsonDataSource`) — sugar combining the two above: a `DataSource<T>` whose `load` calls `fetchJson(url, options)`.
- **Dev proxy (`data/devProxy`)** — same-origin routing for external APIs during `bun dev` so browser CORS never blocks a game's `fetchJson` call against a third-party host. `parseDevProxyTable(raw)` parses a `VITE_JGENGINE_DEV_PROXY` env value (a JSON object of `{ routeName: "https://api.example.com" }`) into a `DevProxyTable`; `proxiedUrl(target, { dev?, table?, prefix? })` rewrites a `target` URL whose prefix matches a table entry into `/proxy/<routeName>/<rest>` (default prefix `/proxy`) when `dev` is true (defaults to `import.meta.env.DEV`) — else returns `target` unchanged, so the same call hits the real host in production. `apps/dev`'s `vite.config.ts` reads the same env var and wires a matching Vite server `proxy` entry per route (`changeOrigin: true`, strips the `/proxy/<routeName>` prefix) — set `VITE_JGENGINE_DEV_PROXY` once and both sides (the URL rewrite and the actual proxy route) agree.

## Multiplayer and the backend seam
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
| Half a system: quest without tracker, cooldown without sweep, keybind never shown, stub "coming soon" modal | Finish the system end to end — or cut it whole (see `jgengine`) |
| Game-side workaround for a missing engine primitive | File the gap at github.com/Noisemaker111/jgengine/issues (or PR the primitive) and cut or scope the dependent system honestly |
| Game nouns in this skill | Engine primitives + placeholder ids only |

## New-game definition of done

This is a gate, not a suggestion — every box, in one pass (workflow: **`jgengine`** skill). "Compiles and the hooks are wired" is not done; a declared system with no UI, no feedback, or no way to exercise it is not done — finish the system or cut it whole.

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
- [ ] HUD screenshotted over a staged `GameUiPreview` scenario and **judged by looking at the image** against the UI quality bar in [`../jgengine-ui/reference.md`](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-ui/reference.md) — the final human glance, not the verification loop
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


