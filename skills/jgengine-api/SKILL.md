---
name: jgengine-api
description: Use when building, extending, or debugging a game on JGengine, or when another skill needs the engine surface — defineGame, GameContext, the three buckets, catalogs, and the world/combat/loot/quest/trade primitives. Read before writing any game.config.ts or catalog.
---

# JGengine — API Reference

The engine ships **verbs and primitives**; your game ships **nouns** (catalogs) and thin handlers. Read this before writing `game.config.ts` or any game content. Companion skills: **`jgengine-newgame`** (master blueprint + phased build to completion), **`jgengine-ui`** (the look-and-behave quality bar), and **`jgengine-assets`** (real models/textures from day one) — read all three before building.

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
| Runner contract | `game/playableGame` | `PlayableGame`, `GameCameraConfig`, `CameraRigKind`, `TopDownCameraConfig`, `RtsCameraConfig`, `ShoulderCameraConfig`, `LockOnCameraConfig`, `ChaseCameraConfig`, `ObserverCameraConfig`, `CameraShakeConfig`, `CinematicCameraConfig`, `CameraKeyframe`, `EntitySpriteConfig` |
| Runtime ctx | `runtime/gameContext` | `createGameContext`, `GameContext`, `GameContextContent`, `GameContextItemEntry`, `GameContextEntityEntry`, `GameContextObjectEntry`, `CatalogEntityRole` |
| Scene instance role | `scene/entityStore` | `EntityRole`, `SceneEntity`, `SpawnOptions`, `EntityPose` |
| Possession | `scene/possession` | `createPossession`, `Possession`, `PossessionDeps`, `PossessionSwappedEvent` |
| Form / shapeshift | `scene/form` | `createForms`, `Forms`, `FormDef`, `FormsDeps`, `FormChangedEvent` |
| Multiplayer adapters | `runtime/adapter` | `offline`, `ws`, `convex`, `socketIo`, `p2p`, `lan`, `fly`, `servers`, `MultiplayerTopology`, `ServersPoolConfig` |
| Loot | `game/lootTable` | `lootTable`, `LootTableDef`, `LootEntry`, `Drop` |
| Dropped-item entity | `game/worldItem` | `WORLD_ITEM_ENTITY_NAME`, `WorldItemRecord`, `WorldItemSpawnInput`, `createWorldItemStore`, `resolveDeathDrops`, `scatterOffset`, `scatterPosition`, `selectNearestWorldItem`, `resolveWorldItemPresentation`, `RarityStyle`, `WorldItemPresentation`, `DEFAULT_RARITY`, `DEFAULT_PICKUP_RADIUS`, `DEFAULT_SCATTER` |
| Loot filter | `game/lootFilter` | `lootFilter`, `evaluateLootFilter`, `LootFilterRule`, `LootFilterCondition`, `LootFilterItem`, `LootFilterOverride` |
| Loadout | `game/loadout` | `LoadoutDef`, `LoadoutItemEntry`, `Loadouts` |
| Cosmetic loadout | `game/cosmetics` | `createCosmetics`, `Cosmetics`, `CosmeticLoadoutDef` |
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
| Round state | `session/roundState` | `createRoundState`, `lossBonusFor`, `RoundState`, `RoundConfig`, `RoundPhase`, `RoundEvent`, `RoundEconomy`, `LossBonusRule` |
| Shrinking ring | `session/ring` | `createRing`, `ringSampleAt`, `Ring`, `RingConfig`, `RingPhase`, `RingSample`, `RingHit`, `RingPoint` |
| Extraction session | `session/extraction` | `createRaidSession`, `RaidSession`, `RaidSessionConfig`, `ExtractPoint`, `ExtractionResult`, `DeathResult`, `RaidStatus` |
| Downed / revive | `combat/downed` | `createDownedState`, `DownedState`, `DownedConfig`, `DownedPhase`, `DownedEntry`, `DownedEvent` |
| Persistence scopes | `runtime/persistenceScope` | `partitionScopes`, `resetRun`, `mergeScopes`, `clearRunFields`, `applyRunReset`, `planScenarioReset`, `ScopeSchema`, `ScenarioReset`, `PersistenceScope` |
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
| Touch controls | `input/touchScheme` | `deriveTouchScheme`, `touchCode`, `touchActionLabel`, `withTouchCodes`, `TouchControlsConfig`, `TouchGestureBindings`, `TouchDragBinding`, `TouchButtonSpec`, `TouchScheme`, `TouchJoystick`, `TouchButton` |
| Pointer hit | `input/pointer` | `PointerHit`, `PointerButton`, `aimToPoint`, `moveTargetFromHit`, `groundOf`, `PointerVec3` |
| Navmesh + A* | `nav/navGrid` | `createNavGrid`, `findPath`, `smoothPath`, `NavGrid`, `NavGridConfig`, `NavPoint`, `FindPathOptions` |
| Path follow | `nav/pathFollow` | `createPathFollow`, `advancePathFollow`, `pathFromNav`, `PathFollowConfig`, `PathFollowState`, `Waypoint` |
| Selection set | `scene/selection` | `createSelectionSet`, `SelectionSet`, `screenRect`, `selectWithinRect`, `rectContainsPoint`, `isMarquee`, `ScreenRect` |
| Context menu | `interaction/contextMenu` | `contextVerb`, `buildContextMenu`, `contextVerbInput`, `ContextVerb`, `ContextMenu` |
| Shared / group wallet | `economy/sharedWallet` | `createWalletBook`, `WalletBook`, `WalletScope`, `userScope`, `groupScope`, `balanceIn`, `grantTo`, `chargeFrom`, `contributionOf`, `contributorsOf` |
| Analog axis input | `input/axisInput` | `AxisInput`, `AxisChannel`, `AxisBindingMap`, `DRIVE_AXIS_BINDINGS`, `clampAxis`, `rampToward`, `NEUTRAL_AXIS` |
| Physics world | `physics/physicsWorld` | `PhysicsWorld`, `PhysicsWorldConfig`, `PhysicsBounds`, `PhysicsStats`, `AddBodyOptions`, `JointOptions`, `JointKind`, `CollisionEvent` |
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
| Voice seam | `multiplayer/voiceContract` | `VoiceTransport`, `VoiceParticipant`, `VoiceRoute`, `createLocalVoiceTransport`, `createPushToTalk`, `PushToTalkMode` |
| Race state | `game/race` | `raceTrack`, `RaceTrack`, `createRaceState`, `RaceState`, `RaceEvent`, `RaceWinCondition`, `firstPastPost`, `topK`, `lastStanding`, `everyoneFinishes` |
| Reveal query | `sensor/revealQuery` | `createRevealQuery`, `RevealQuery`, `RevealQueryOptions`, `RevealHit` |
| Hidden-state probe | `sensor/hiddenStateProbe` | `probeHiddenState`, `probeHiddenStateAll`, `HiddenStateSource`, `HiddenStateValue`, `SensorProbeOptions`, `SensorReading` |
| View-frustum sensor | `sensor/frustumSensor` | `createFrustumSensor`, `projectToView`, `framingScore`, `FrustumCamera`, `FrustumTarget`, `FrustumProjection`, `FrustumSample`, `FrustumSensor`, `FramingConfig` |
| Recording buffer | `sensor/recordingBuffer` | `createRecordingBuffer`, `RecordingBuffer`, `RecordingFrame`, `RecordingBufferOptions` |
| Animation SM | `combat/animationState` | `createAnimationState`, `AnimationState`, `AnimationClip`, `FramePhase`, `FrameRange`, `phasesAtFrame`, `activeRangeAtFrame`, `frameAtMs` |
| Accumulator meter | `stats/accumulatorMeter` | `createAccumulatorMeter`, `AccumulatorMeter`, `AccumulatorMeterConfig`, `MeterTier`, `MeterAddResult`, `tierAt` |
| Stagger / buildup | `combat/breakMeters` | `createStaggerMeter`, `createBuildupMeter`, `StaggerMeter`, `BuildupMeter`, `BuildupProc` |
| Attack tags | `combat/attackTags` | `attackMeta`, `AttackTag`, `AttackMeta`, `hasTag`, `isBlockable`, `isParryable`, `isDodgeable`, `counters` |
| Defensive window | `combat/defensiveWindow` | `createDefensiveWindow`, `resolveDefense`, `DefensiveWindowConfig`, `DefenseKind`, `DefenseOutcome`, `windowActiveAt`, `iframeActiveAt` |
| Combo string | `combat/comboString` | `createComboRunner`, `advanceCombo`, `ComboString`, `ComboStep`, `AdvanceComboResult` |
| Hit reaction | `combat/hitReaction` | `resolveHitReaction`, `HitReaction`, `HitReactionConfig`, `CameraShake`, `applyImpulse` |
| Telegraph | `combat/telegraph` | `pointInTelegraph`, `telegraphProgress`, `telegraphFired`, `TelegraphShape`, `TelegraphConfig` |
| Dash / dodge | `movement/dash` | `createDashState`, `DashState`, `DashConfig`, `DashBurst`, `iframeActive`, `dashOffset` |
| Ability kit | `combat/abilityKit` | `createAbilityKit`, `AbilityKit`, `AbilitySlotConfig`, `AbilitySlotSnapshot`, `AbilitySlotState`, `AbilityCastType`, `AbilityCastResult`, `AbilitySlotRetune` |
| Event meter | `stats/eventMeter` | `createEventMeter`, `EventMeter`, `EventMeterConfig`, `EventMeterFeedResult` |
| Auto-target policy | `scene/autoTarget` | `selectAutoTarget`, `createAutoTargeter`, `AutoTargetPolicy`, `AutoTargeter`, `AutoTargetDeps` |
| Resistance matrix | `combat/resistance` | `resolveResistance`, `resistanceScale`, `ResistanceMatrix`, `ResistVerdict`, `ResistanceResult` |
| Run draft | `game/runDraft` | `createRunDraft`, `createRunModifierStack`, `RunDraft`, `RunModifierStack`, `RunModifierOffer` |

## Getting started (new project)

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

A multi-game host (a launcher, a dev registry) wires `GamePlayerShell` directly over a `GameRegistry`:

```tsx
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

const games: GameRegistry = {
  "my-game": () => import("./my-game").then((m) => m.game),
};

function App() {
  const [playable, setPlayable] = useState<PlayableGame | null>(null);
  useEffect(() => { void games["my-game"]().then(setPlayable); }, []);
  return playable ? <GamePlayerShell playable={playable} /> : null;
}
```

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

## `defineGame` — the single authoring entry

`@jgengine/shell/defineGame` is the game-authoring entry: one call in `game.config.ts` takes both engine fields (`name`, `assets`, `world`, `physics`, `inventories`, `input`, `server`, `save`, `time`, `multiplayer`) and presentation fields (`content`, `loop`, `GameUI`, `camera`, `environment`, `WorldOverlay`, `renderEntity`, `entitySprites`, `entityModels`, `objectModels`, `hotbarSelection`, `prompts`, `pointer`, `touch`, `worldHealthBars`, `audio`, `entitySounds`, `objectSounds`, `worldItem`) and returns a ready `PlayableGame` — no separate object to assemble. It is a thin wrapper over the core `defineGame` primitive (below) plus the `PlayableGame` runner assembly; see `packages/shell/src/defineGame.tsx` for the exact accepted fields. Never game tuning (walk speeds, damage, prompts — those live in catalogs).

**Smart defaults** — omit any of these and the call still resolves: `multiplayer` → `offline()`; `loop` hooks (`onInit`/`onNewPlayer`/`onTick`) → no-ops; `content` → `{}`; `GameUI` → an empty component; `camera` → third-person orbit; a `world` of kind `environment()` auto-renders as the backdrop with no `environment` component supplied — a non-`environment()` world (`flat()`, `voxel()`, …) still needs the game to hand it one.

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

- Input bindings are string arrays (hold semantics) or `{ hold, toggle }` for the same verb.
- **Keybind → command convention.** The shell fires a command for any bound action that isn't reserved: pressing an action runs a command of the **same name** if one is defined, else a `ui.<action>` fallback (so `openBackpack` → `ui.openBackpack`). Just declare the binding and a matching command — no per-game `keydown` listener. Reserved actions the shell consumes natively and never routes to a command: `moveForward/moveBack/moveLeft/moveRight`, `turnLeft/turnRight`, `sprint`, `jump`, `tabTarget`, `clearTarget`, `useAbility`, `interact`, and any `hotbarSlotN`/`slotN`. `tabTarget`/`clearTarget` run `target.cycle`/`target.clear` (native `cycleTarget`/`setTarget` fallback).
- **`interact`** is special: pressing it resolves the active proximity prompt from the `prompts` field of `defineGame({...})` and runs that prompt's `invoke` command. A prompt with `invoke: null` is display-only and does nothing on the key.
- UI keybind badges derive from `keybinds` via `actionLabel(keybinds, "openBackpack")` — `bindingLabel` maps codes to short labels (`Digit1`→`1`, `KeyB`→`B`, `mouse0`→`LMB`, `Escape`→`Esc`). Never hardcode label strings; they drift the moment a binding changes.
- `server.mode` is a string your loop/commands interpret — the engine ships no gamemode presets.
- Never in defineGame: player tuning, catalog helpers (`defineItems` etc.), game nouns, behaviors, prompts, or inline binding/inventory/world blobs.

### `@jgengine/core/game/defineGame` — the underlying primitive

The low-level engine boot call the shell `defineGame` composes internally: engine fields only (`name`, `assets`, `world`, `physics`, `inventories`, `input`, `server`, `save`, `time`, `multiplayer`, `loop`) — no `content`/`GameUI`/`camera`/render fields, those are the shell layer's job.

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

Optional render/world fields the shell also reads: `entitySprites` / `entityModels` (billboards / GLBs keyed by entity kind), `objectModels` (GLBs keyed by object catalog id), `WorldOverlay` (canvas-layer VFX), `environment` (canvas-layer scenery — ground/sky/structures; when set, replaces the default ground plane + debug grid + rock field), `camera`, and `worldHealthBars`. A model value is a catalog id (`string`, resolved via `game.assets`) or an inline `ModelConfig { url, scale?, y?, anchor?, dims? }`. Catalog-resolved models carry measured `dims` (`catalog.resolve(id).dims = { footprint:{w,d}, center:{x,z}, minY }`); with the default `anchor: "center"` the shell centers the footprint on the placement point and ground-snaps `minY` to it, so corner-pivot kit models place correctly with no per-game pivot math.

The runner boots `createGameContext({ definition, content, player: { userId, isNew } })`, calls `loop.onInit(ctx)` then `loop.onNewPlayer(ctx)`, and drives `loop.onTick(ctx, dt)` per frame. **Convention: `onNewPlayer` spawns the player entity with `id === ctx.player.userId`** — bounded stats, targeting, and kill attribution key off that.

### Audio — positional emitters, listener falloff, buses
Catalog-first, no per-game audio glue. The `audio` field of `defineGame({...})` — `{ sounds: Record<string, SoundDef>, buses?: Record<string, AudioBusDef> }` — declares the sound catalog (`SoundDef = { id, url, bus, gain?, loop?, positional?, falloff? }`) and mix buses (`music`/`sfx`/`ambient`/…, `AudioBusDef = { id, gain? }`) — both types from `@jgengine/core/audio/audioFalloff`. `entitySounds?: Record<string, string>` maps an entity **kind name** (same convention as `entitySprites`/`entityModels`) to a sound id: while a matching entity exists, the shell keeps a looping positional emitter on it, repositioned every frame. `objectSounds?: Record<string, string>` does the same keyed by placed-object catalog id. The pure distance→gain math (`computeFalloffGain(distance, config)`, curves `"linear" | "inverse" | "none"`) lives in core so it is unit-tested without a browser; `@jgengine/shell` (`shell/audio/audioEngine`, `shell/audio/AudioComponents`) is the only package that touches Web Audio — it owns an `AudioContext`, mounts `AudioListener` on the camera every frame, and `EntityAudioEmitters`/`ObjectAudioEmitters` drive per-instance emitter gain from the core falloff function. `GamePlayerShell` wires all of this automatically from `playable.audio`/`entitySounds`/`objectSounds` — a game never touches `AudioContext` directly.
### Camera rigs (`camera` field of `defineGame({...})`)
The shell ships a **rig library**; a game picks and tunes one through `camera` config, never by writing camera positions from `onTick`. Select with `camera.rig` (or the `perspective: "third" | "first"` shorthand):
| `rig` | For | Key config (`camera.<rig>`) |
|-------|-----|------------------------------|
| `orbit` (default) | Third-person chase | `initialDistance`, `targetHeight`, `min/maxPolarAngle`, drag/zoom |
| `first` | FPS mouse-look | `firstPerson: { eyeHeight, sensitivity, maxPitch, reticle, viewmodel }` |
| `topDown` | ARPG iso / top-down (Diablo IV, Hades II) | `topDown: { height, pitch, yaw, followSmoothing, zoom }` — decoupled follow |
| `rts` | Free-pan / edge-scroll (The Sims, Manor Lords) | `rts: { panSpeed, edgeScroll, rotateSpeed, bounds, start }` |
| `shoulder` | Over-the-shoulder (Helldivers 2, Remnant II) | `shoulder: { shoulderOffset, distance, ads, side }` — ADS + shoulder-swap (V) |
| `lockOn` | Souls-like strafe (Elden Ring) | `lockOn: { targetEntityId?, distance, framingBias, yawSmoothing }` — yaw binds to player→target; WASD becomes strafe |
| `chase` | Vehicle chase (Forza, Rocket League) | `chase: { distance, springDamping, fov: { base, max, speedForMax }, shakePerSpeed, view: "chase"|"cockpit"|"hood"|"rear" }` |
| `observer` | Detached spectator/photo/kill-cam (#120) | `observer: { bind: { kind: "entity", entityId } \| { kind: "point", position }, distance, height, orbitSpeed }` — reads no player input, auto-orbits the bound subject |
**Every rig accepts `followEntityId: null`** so avatar-less games (city-builders, card games, auto-battlers) still mount a camera. **Shake / trauma (#28):** every rig reads a shake channel; feed it from anywhere with `import { cameraShake } from "@jgengine/shell/camera"` — `cameraShake(amplitude, decayPerSecond?)` (amplitude 0..1) — or from React via `useCameraShake()`. Tune with `camera.shake: { maxOffset, maxRoll, decayPerSecond, exponent, frequency }`. **Cinematic (#29):** set `camera.cinematic: { keyframes: [{ position, lookAt, fov?, duration?, ease? }], loop? }` to play a scripted path over the active rig, and `camera.transitionSeconds` cross-fades the camera when the rig changes so mode swaps don't hard-cut. The pure rig math (shake decay, spring-arm, speed→FOV, offset/strafe, keyframe lerp) is exported from `@jgengine/shell/camera` for testing.
**Every rig accepts `followEntityId: null`** so avatar-less games (city-builders, card games, auto-battlers) still mount a camera. Leave `followEntityId` unset and the shell defaults it to `ctx.player.possession.active(userId)` every frame, so a possession swap (party control-swap, BG3-style) or a form's mesh/camera-relevant change re-targets the camera automatically — set it explicitly only to override that default. **Shake / trauma (#28):** every rig reads a shake channel; feed it from anywhere with `import { cameraShake } from "@jgengine/shell/camera"` — `cameraShake(amplitude, decayPerSecond?)` (amplitude 0..1) — or from React via `useCameraShake()`. Tune with `camera.shake: { maxOffset, maxRoll, decayPerSecond, exponent, frequency }`. **Cinematic (#29):** set `camera.cinematic: { keyframes: [{ position, lookAt, fov?, duration?, ease? }], loop? }` to play a scripted path over the active rig, and `camera.transitionSeconds` cross-fades the camera when the rig changes so mode swaps don't hard-cut. The pure rig math (shake decay, spring-arm, speed→FOV, offset/strafe, keyframe lerp) is exported from `@jgengine/shell/camera` for testing.

## `GameContext` — the ctx surface

`createGameContext` (in `@jgengine/core/runtime/gameContext`) wires every system:

```
ctx.scene.object    place, remove, move, rotate, get, list, subscribe
ctx.scene.entity    spawn, despawn, setPose, get, list,
                    stats.{get,set,delta}, setTarget, getTarget, cycleTarget,
                    canReceive, preview, effect,
                    willHitProjectile, fireProjectile, settleProjectile,
                    distance, inRadius, hasLineOfSight, queryArc, moveToward,
                    form.{register,get,active,abilities,shapeshift,revert}
ctx.game            commands, events, feed, loot, trade, quest, social,
                    unlocks, economy, leaderboard, roster
                    unlocks, economy, leaderboard
ctx.game.social     friends, party, presence, emotes.play
ctx.player          userId, isNew, inventory, stats (modifiers), loadout,
                    applyLoadout, movement (pose/aim), possession, cosmetics
ctx.item            use, weapon
ctx.world           ground (TerrainField), groundHeightAt(x, z) — the canonical
                    sampler for the game's declared world; environment worlds
                    resolve their terrain field, every other world kind is 0.
                    Use it for every spawn/placement/waypoint y — never
                    hand-roll a noise sampler or hardcode y = 0 on relief
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
ctx.scene.entity.canReceive(instanceId, effect, magnitude?)  // null | reason — reads catalog receive
ctx.scene.entity.preview({ from, to, effect, via })      // magnitude, no state change
ctx.scene.entity.effect({ from, to, effect, via })                          // single target
ctx.scene.entity.effect({ from, effect, via, at, radius, falloff?, los? })  // AoE at a point
```

AoE: `inRadius(at, radius)` → LoS filter (default on) → `canReceive` per target → absorption; `falloff: "linear" | "none"`. `via` = `{ item }` (magnitude from weapon stats) or `{ amount }`. `canReceive`'s `pools-depleted` reason checks headroom in the effect's direction: a positive (draining) magnitude needs a stat above its min, a negative (restorative) magnitude needs a stat below its max — so a heal can still raise a stat sitting at its minimum. Omitting `magnitude` assumes the draining direction.

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

- **Ability kit** (`combat/abilityKit`) — `createAbilityKit([{ id, cooldownMs, chargesMax?, resourceCost?, castType?, flashMs? }])`. `state(id, resourceAvailable?)` → `AbilitySlotSnapshot { state: "ready" | "cooldown" | "no-resource" | "just-cast", charges, chargesMax, cooldownRemainingMs, cooldownFraction, justCast, ready }`; `cast(id, resourceAvailable?)` consumes a charge, starts the recharge, and flashes just-cast; `canCast` / `tick(dt)` / `reset` / `retuneSlot(id, { cooldownMs?, resourceCost? })` (rebalance a slot at runtime — patches the config in place without touching charges or an in-flight cooldown timer, returns `false` for an unknown slot). The kit is resource-**agnostic** — it reports `no-resource` by comparing `resourceCost` to a supplied `resourceAvailable` (a mana stat, or an ult meter), and never spends the resource itself; the game's handler spends it and calls `cast`. Charges recharge one at a time; the four states drive the hotbar slot art. Cooldowns tick on `dt`, so hang `kit.tick(dt)` in `onTick`.
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
Click-to-grab is engine-owned: setting `pointer.grabWorldItems: true` in `defineGame({...})` makes `@jgengine/shell`'s `GamePlayerShell` resolve `pointer.worldHit()` on primary click, and — when the hit entity is a `worldItem` within the `worldItem.pickupRadius` (default `DEFAULT_PICKUP_RADIUS`) configured on `defineGame({...})` of the local player — calls `pickup` directly, no game command needed. `@jgengine/react`'s `useWorldItems()` / `useNearestWorldItem(radius)` drive a HUD pickup prompt off the same store.
Presentation is a two-layer render binding, both engine-owned (rendered by `@jgengine/shell`'s `WorldItems`) over **game-supplied data**:
1. **Rarity baseline** — the `worldItem.rarityStyle: Record<rarity, { color?, beam?, label? }>` field of `defineGame({...})`, the game's rarity palette (Borderlands/Diablo-style beam + color coding).
2. **Loot filter overlay** (#33) — the `worldItem.filter: LootFilterRule[]` field of `defineGame({...})`, built with `lootFilter([{ id, when: { rarity?, baseType?, minAffixTier?, maxAffixTier? }, hide?, color?, beam?, label? }])` from `game/lootFilter`. **First matching rule wins** (PoE/Last Epoch block semantics); a rule only overrides the fields it sets, everything else falls back to the rarity baseline. `resolveWorldItemPresentation(item, rarityStyle, rules)` composes both layers and is what the shell calls per item.
## Gear systems — durability, affixes, modular items, storage tiers
Four pure primitives that hang off item **instances** (not the stackable catalog id) — all catalog-first (specs are game-supplied config) and renderer-free. Item instances that carry durability/affix/modular state key off a game-assigned instance id, the same way targeting keys off entity instance ids.
**Durability** (`item/durability`) — per-instance wear + repair. `DurabilitySpec` (`{ max, wearPerUse?, wearPerHit?, disableAtZero?, repair? }`) is catalog data; `createDurability(spec)` seeds a `DurabilityState`, `wear(spec, state, "use" | "hit", times?)` decrements (floors at 0), `isDisabled(spec, state)` gates use at zero, `durabilityFraction` feeds a HUD bar. Repair is quote-then-apply: `repairQuote(spec, state, { station?, to? })` returns the `{ item, count }[]` material cost (scaled by points restored) + the post-repair state (optional `qualityLossPerRepair` shrinks `max` each repair, Tarkov-style) — the game charges the materials through inventory, then commits the quote's `state`. `createDurabilityTracker()` keeps `DurabilityState` per instance id for the runtime.
**Affix roller** (`item/affix`) — procgen `base × rarity → { rolled affixes, computed stats, name }`. `createAffixRoller({ pools, rarities })` over rarity-weighted `AffixPool`s. `roll(base, rarityId, rng)` draws `affixCount` distinct affixes without replacement (weighted, via the engine's `pickWeighted`), computes stats (base × `rarity.statScale`, then `op: "add"` affixes, then `op: "mul"`), and composes a name from `rarity.namePart` + prefix/suffix parts. `rollRarity(rng)` picks a weighted tier; `rollRandom(base, rng)` chains both. Pass `seededRng(seed)` for deterministic drops; any `() => number` rng works (same contract as `loot.roll`).
**Modular item** (`item/modularItem`) — a whole assembled from parts in typed mount slots (guns, mechs). `ModularItemDef` has `slots: MountSlotDef[]` (`{ id, accepts, required? }`); `install(def, installed, slotId, part)` validates the slot exists, accepts the part's `category`, and is empty; `computeEffectiveStats(def, installed)` rolls part `stats` (additive) then `multipliers` over `baseStats`; `missingRequiredSlots`/`isComplete` gate a buildable whole. `createModularItem(def)` is the stateful wrapper (`install`/`uninstall`/`effectiveStats`/`partInSlot`).
**Storage tiers + insurance** (`inventory/storageTier`) — the extraction-economy inventory half. Inventory containers carry a `tier: "carried" | "banked"` (`InventoryDeclaration.tier`; a Tarkov secure container is just a `banked` container on the body). `partitionOnDeath(containers)` splits a death snapshot into `{ kept, lost }` (banked survives, carried is dropped, stacks merged). `createDeliveryQueue()` is the delayed-delivery (insurance) hook: `schedule` a `ScheduledDelivery` with a game-time `deliverAt`, then `due(now)` / `claimDue(now)` drain it on the tick clock. `insureLost(lost, policy, userId, now, rng?)` filters the lost set to insured items and stamps a delayed `deliverAt` → feed straight into the queue. `resolveConsolation(policy, partition)` returns a baseline loadout id (apply via `applyLoadout`) — the death consolation grant, optionally gated on `if-carried-empty`. *(Session/round machines — extraction hold-to-leave, raid banking — consume this tier; see the objective-machine group.)*
## Objective, round & session machines
Content-agnostic state machines for competitive/session shapes — plant/defuse, buy/live/end rounds, downed/revive, the battle-royale ring, extraction raids, run-vs-meta persistence. All pure `core`; every timer takes a **game-time** `dt`/`now` (`ctx.time`), so pause and fast-forward apply for free. Drive them from `loop.onTick` and pipe their events into `ctx.game.feed`/`events`; render their snapshots as HUD (see **`jgengine-ui`** — the downed banner, ring warning, and extraction timer are required HUD).
**Contested channel** (`session/contestedChannel`) — the interrupt-on-damage progress objective behind plant/defuse, cash-out, urn deposit, banishing, and hold-to-extract. `createContestedChannel({ duration, interruptOnDamage?, resetOnInterrupt?, favorability?, ratePerOccupant?, contested?, decayRate? })`: `start(team)` begins the channel, `tick(dt, occupants)` advances it against per-team occupancy (`Record<teamId, count>`) and emits `start`/`tick`/`contested`/`paused`/`complete` events, `damage(reason?)` interrupts (keeps or zeroes progress per `resetOnInterrupt`). `favorability[team]` scales fill rate (Deadlock deposit); `ratePerOccupant` fills faster with more owners present; `contested: "pause" | "decay"` chooses whether an opposing occupant freezes or reverses progress (The Finals contest). The owner leaving pauses it. Extraction hold-to-leave reuses this primitive verbatim.
**Round state** (`session/roundState`) — the buy→live→end match machine (Valorant/CS). `createRoundState({ phases: { buy, live, end }, teams, maxRounds?, winReward?, lossBonus? })`: `tick(dt)` runs the phase timer and auto-advances (emitting `phase.start`/`phase.end`, rolling `end` into the next round's `buy`), `concludeRound(winner)` records the win mid-`live`, settles `round.economy` (winner gets `winReward`, losers get an escalating `lossBonus` via `lossBonusFor(rule, streak)` clamped to `max`), and moves to `end`. `onPhaseEnd(hook)` fires commerce/spawn gates on each transition; `match.end` fires at `maxRounds`. `server.mode` stays a game string — this is the timer/economy engine under it.
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

Commands mutate state and return it; **event handlers use `ctx` directly** (side effects: leaderboard, economy, scheduling) and never reassign state. One feed primitive for kill feeds, loot logs, quest updates — no per-domain feed hooks.

## Movement, pose, input

```ts
ctx.player.movement.getPose(id) / setPose(id, "crouch")   // validates catalog movement.poses
ctx.player.movement.getAim(id) / setAim(id, "ads")        // ADS = aim state + zoom modifier, not a pose
```

Poses (`standing/crouch/prone/running`) change the collision capsule (`POSE_HITBOX`); aim pairs with a `player.stats` zoom modifier on `"reticle"`. Game code reads action names only (`isDown("aim")`, `wasPressed("interact")`) — hold vs toggle is resolved by the binding config, never by raw key branches.

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
- **`buttons`** — curate the on-screen cluster (order preserved; bare string or `{ action, label?, icon? }`); omit to auto-derive one button per remaining bound action. Buttons render a glyph, not text: `iconForAction` (`@jgengine/react/gameui/icons`) resolves the action name to a `GameIconName` (`jump`, `sprint`, `rotateCw`, `hardDrop`, `swap`, `hand`, `restart`, arrows, …), the `label` becomes the `aria-label`; set `icon: "<GameIconName>"` to pick one explicitly or `icon: false` to force the text label.
- **`hidden`** — actions to drop from the derived buttons without gesture-binding them.
- **`movement: false`** — suppress the virtual joystick even when movement actions are bound.
- **`look` / `lookSensitivity`** — drag-to-look on the play surface; defaults to `true` for `first`-person camera rigs, `0.005` radians/px.
- **`touch: false`** — opt out entirely when the game's own DOM UI is already touch-native.

`useDisplayProfile()` (`@jgengine/react/display`) reports `{ coarsePointer, compact, portrait }` — live media-query state, SSR-safe — for adaptive HUD layout; see `jgengine-ui`'s mobile quality bar.

## Interaction — `proximityPrompt`

One primitive for all float UI: `{ radius, display, invoke }` where `display` is `{ kind: "keybind", actionId }` | `{ kind: "gauge", gaugeId }` | `{ kind: "label", text }` and `invoke` is `{ command, args? }` or null (display-only). `talkable: "dialogue_id"` on an entity expands to a talk prompt. Engine picks the nearest prompt in radius (priority tie-break). Never build per-game hint resolver chains.

## Pointer-driven input and navigation
The **pointer is a service, not per-game glue**. Opt in with `camera` plus a `pointer` config in `defineGame({...})`; the shell casts the cursor into the world and dispatches commands you define — verbs stay commands, catalogs stay data.
- **`pointer.worldHit()` (shell service).** The shell raycasts the cursor to `{ point, normal, entity, object }` (a renderer-free `PointerHit` from `@jgengine/core/input/pointer`) — entity/object are the topmost instance ids under the cursor, else `null`, with a ground-plane fallback for open terrain. Consume it renderer-free: `aimToPoint(origin, point)` builds an `Aim` for `item.use`/projectiles (ground-target skillshots, twin-stick), `groundOf(hit)` drops to `[x, z]` for routing.
- **The `pointer` field of `defineGame({...})`** (all optional): `moveCommand` (left-click ground → `run(cmd, { point, entity, object })`, click-to-move), `select` (left-drag marquee + single-click box-select of entities), `orderCommand` (right-click ground → `run(cmd, { selection, point })`, issue a command to the selection), `contextMenu` (right-click an entity/object → its catalog `verbs` menu), `aim` (route the primary ability's aim to the cursor), `grabWorldItems` (left-click a `worldItem` within pickup radius → engine-owned `ctx.scene.worldItem.pickup`, no game command). Enabling `select`/`moveCommand` frees the left button for verbs; orbit moves to middle-drag.
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
Shell wiring: `@jgengine/shell/vision/RevealVision` (`RevealHighlights` — depth-test-disabled 3D highlight meshes for tagged entities in radius, meant for `WorldOverlay`; `RevealScreenTint` — full-screen CSS tint for "vision mode is on", meant for `GameUI`), `@jgengine/shell/vision/HiddenStateProbeHud` (`SensorReadoutMeter` — needle-strength HUD readout), `@jgengine/shell/vision/FrustumSensorHud` (`FrustumSensorReadout` — drives the sensor off the live render camera via `useThree`/`useFrame`, portals its HUD through drei's `Html fullscreen`), `@jgengine/shell/replay/useSessionRecorder` (records an entity's pose into a `RecordingBuffer` every frame; drive an observer-cam ghost, scrubber, or kill-cam export from it). The detached spectator/photo cam itself is the `observer` camera rig (see Camera rigs above) — bind it to any entity or fixed point.

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

**Destructible terrain (`world/carve`).** Two runtime-editable primitives for dig/carve worlds. `VoxelVolume` is a dense grid of material ids (0 = empty) — `carve({ center, radius, toolStrength })` clears a sphere of solid cells the tool is strong enough to break and returns the count removed (feed a loot roll), `deposit({ center, radius, material })` fills one (Deep Rock tunnels, Astroneer terrain add); `solidAtWorld` reads it back for collision. `CarvableField` (via `carvableTerrain(base)`) wraps any `TerrainField` and writes craters/mounds into its height — `carve({ x, z, radius, depth })`/`deposit({ x, z, radius, height })` — so ground-snap, collision, and the shell mesh all read the deformed surface (Helldivers 2 explosion craters). Cell strengths come from a `VoxelMaterial` table (DATA). Renders through `@jgengine/shell/terrain/CarvedTerrain`.

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

`physics/physicsWorld` `PhysicsWorld` is a standalone fixed-capacity rigid-body sim (SoA buffers, spatial-hash broadphase, sleeping) — **not** the `defineGame` `physics: { gravity }` field, which only configures the shell's character controller. Reach for it when a game needs many colliding dynamic bodies (piles, debris, stress scenes): `new PhysicsWorld({ capacity, bounds, … })`, `addBody({ position, halfExtents, mass? })`, then `step(dt)` per tick → `PhysicsStats`. Core owns the sim; `@jgengine/shell/world/InstancedBodies` renders its bodies. Most games never need it — the character controller covers ordinary movement. The broadphase grid (`nx*ny*nz` cells from `bounds`/`cellSize`) throws at construction if it would exceed a sane cell cap — shrink `bounds` or raise `cellSize` (same guard on `physics/spatialGrid`'s `SpatialGrid`).

**Removing and moving bodies.** `removeBody(id)` tombstones a body — it drops out of integration/broadphase and its slot is queued for the next `addBody` — without moving or invalidating any other body's `id` (ids are raw SoA slots, stored as-is in joints and game state, so nothing ever gets swapped). It conservatively wakes any sleeping body whose AABB touched the removed one's (no persistent contact set to consult, so this errs toward waking too much, never too little). `setVelocity(id, x, y, z)` and `setPosition(id, x, y, z)` write a body's velocity/position directly (instead of poking the public `velX`/`posX` SoA arrays) and wake it if asleep; `teleport(id, x, y, z)` is `setPosition` plus a hard velocity reset (respawn/teleporter, vs. sliding). `isAlive(id)`/`highWater` (one past the highest slot ever handed out) let a consumer that iterates the raw SoA arrays skip tombstoned holes correctly instead of assuming `count` is a dense `0..count` range.

**Joints & constraints.** `hingeJoint`/`fixedJoint`/`distanceJoint`/`springJoint(opts)` connect two bodies, or a body to a fixed world point (omit `bodyB`). The sim is translational (no angular DOF), so `hinge`/`fixed` pin the shared anchor (the `axis` is retained metadata), `distance` holds a fixed separation, and `spring` drives toward `restLength` with `stiffness`/`damping` (suspension, follow-point carry). `removeJoint(id)`, `setJointAnchor(id, x, y, z)` (move anchor B — a world anchor's follow point, or body B's local offset), `setJointAnchorA(id, x, y, z)` (move anchor A's local offset — e.g. re-rotating a suspension mount each frame as the chassis turns), `setJointRest`, and `readJointSegments(out)` for `@jgengine/shell/world/InstancedJoints` (debug line render). This is the foundation under vehicles, ragdolls, grapples, and carry.

**Collision → gameplay events.** `world.onCollision(listener, minApproachSpeed?)` delivers every impacting contact — `CollisionEvent { a, b, nx, ny, nz, approachSpeed, impulse }` — to game code during `step` (the object is reused; read/copy it, never retain). This is the seam crash-damage and destruction read; pass `null` to detach.

**Actors on top of the sim:** `physics/ragdoll` (`createRagdoll(world, { bones, links, balance? })` — jointed bones, floppy or active-ragdoll via a balance motor), `physics/carryable` (`Carryable` — grab a body to a follow point, shared multi-owner carry, `carrySpeedMultiplier` encumbrance, drop/throw; the raycast pick is the caller's job, core owns the constraint), `physics/forceVolume` (`ForceVolume` — impulse/velocity/accelerate trigger region, `once` for boost pads; `PlatformCarry` — carry bodies standing on a moving platform by its per-`step` delta). Separately, `physics/spatialGrid` `SpatialGrid` is a broad-phase grid over the x/z plane, **distinct** from the rigid-body sim, for cheap same-tick proximity across hundreds–thousands of simple movers — `rebuild(count, xs, zs)` then `queryCircle` (swarm enemies hitting a player/AoE) or `forEachPair` (mutual separation).

**Traversal (`physics/traversal`).** `Grapple` fires a rope from a body to a fixed world point on the joint API — `fire(x,y,z)` attaches a `distance` (rigid) or `elastic` (spring) joint, `reel(dt)`/`payOut(dt)` shorten/lengthen the rope to pull the traveller in, `moveAnchor` re-points it (ziplines, grapple-to-moving-target). Grapple/zipline/swing (Sekiro, Deep Rock, Just Cause) are all the same primitive; the raycast that finds the anchor is the caller's. `Glide` is a reduced-gravity, forward-thrust wingsuit/glider over a body — call `apply(dt, steerX, steerZ)` each frame before `step` to feed back most of gravity (`gravityScale`), thrust along the steer vector, and clamp descent; stop calling it to fall normally, no attach/detach state.
**Structural destruction (`physics/structure`).** `StructureGraph` models a building as nodes (pieces) + load-bearing edges with some nodes `anchor`ed (foundations). `damage(id, n)`/`damageEdge(a,b,n)`/`severEdge(a,b)` wear pieces and connections; when one breaks, the graph recomputes reachability to an anchor and returns a single `CollapseEvent { fell }` — every piece the loss disconnected. `toDebris(world, event)` sinks the fallen pieces into a `PhysicsWorld` as rigid bodies (The Finals, Rainbow Six). It is coarse by design: **replicate the collapse event (the `fell` id list), not each fragment's physics** — game clients re-derive the debris locally. Piece integrity and edge strength default from a `StructureMaterial` table (DATA).
### Vehicles, mounts, crash damage & racing
Five primitives layer a driving/racing game over the physics sim and `world/water`. All are **data-first** (spec the chassis/wheels/grip curve, damage thresholds, and checkpoint layout as catalog data) and pure `@jgengine/core`; renderers live in the game/shell. Each `update(dt, …)` runs **before** the shared `world.step(dt)`.
- **Analog input — `input/axisInput`.** `AxisInput { throttle, brake, steer, handbrake }` is a continuous channel, **distinct from the digital action bindings**. `new AxisChannel({ bindings, smoothing })` ramps held keys into pedal-like analog values (`sample(dt, isDown)`), or `setAnalog(axis, value)` drives it straight from a gamepad axis. `DRIVE_AXIS_BINDINGS` is a ready WASD/arrow map.
- **`physics/vehicleBody`.** `createVehicleBody(world, config)` is an arcade car: a chassis box body with per-wheel suspension held by G3's `springJoint` against the sampled `groundHeight`, drive/brake along the heading, and a `GripCurve` (`sampleGripCurve`) that bleeds lateral velocity for cornering — and, under `handbrake`, drift. `update(dt, axisInput)` then `world.step`. Because the chassis is a real body it still collides, which feeds crash damage. Rocket League, Trackmania, Wreckfest.
- **`physics/buoyancy`.** `createBuoyantBody(world, { body, water, … })` floats a body on a CPU `WaterSurface` (Archimedes per hull point + water drag) so it settles at the waterline and rides the Gerstner waves; pass an `AxisInput` to `update(dt, time, input?)` and it drives as a boat (thrust + yaw + keel). Sea of Thieves, BOTW rafts.
- **`scene/mount`.** `createMountController()` transfers control to a driven entity: `register({ id, kit, seats })`, `mount(riderId, mountId, seatId?)`, `dismount`. Read `cameraTarget(riderId)` to point the follow camera and `driveTarget(riderId)` to route that rider's `AxisInput` at the mount — the control seat drives, passenger seats ride (multi-seat shared vehicles), and an un-mounted rider drives themselves. `driver(mountId)`/`occupants(mountId)`/`kitOf`. Palworld mounts, V Rising horse, a crewed ship.
- **`scene/stationClaim`.** `createStationClaim(controller?)` layers **facet stations** on `scene/mount` for a vehicle several players crew at once: `register({ id, kit, stations })` where each `Station` tags a seat with a `facet` (`"steer"`/`"sails"`/`"cannon"`). `claim(playerId, vehicleId, facetOrStationId)`, `release`, `controllerOf(vehicleId, facet)` (who mans it), `facetOf(playerId)`, `openFacets`, `crew`. Only a `control` station operates the hull (`driver`/`driveTarget`); the rest ride but command their own facet. Sea of Thieves helm + sails + cannons.
- **`physics/damageZones`.** `createDamageModel({ zones, disableAt })` maps accumulated contact impulse (from `onCollision`) to **coarse discrete stages** (not soft-body): `absorb(zoneId, impulse)` / `routeCollision(event, resolveZone)` bump a zone's stage (caller swaps the visual/collider), an optional `detachStage` ejects a part as debris once, and crossing `disableAt` flips a whole-vehicle `disabled` state. Wreckfest crumple/derby.
- **`game/race`.** `raceTrack({ checkpoints, laps })` is an ordered ring of AABB checkpoint volumes (the final one is the finish line); `createRaceState({ track, win })` — driven each tick by `update(now, positions)` on game time — emits `checkpoint.hit` / `lap.completed` / `position.changed` / `race.finished`, keeps split times, resolves a pluggable `RaceWinCondition` (`firstPastPost`, `topK` round-cut, `everyoneFinishes`, `lastStanding` derby), and `resetToCheckpoint(id)` hands back a respawn pose. `removeRacer(id)` drops a racer mid-race and renumbers the remaining standings; `reset()` clears all racer progress/finish state back to construction time so the same instance replays without rebuilding it. Trackmania, Mario Kart, Fall Guys.

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

type LiveGameBackend = GameBackend & {
  presenceSync: PresenceSync;        // subscribe(serverId, onChange) + syncPose(serverId, pose)
  pushFeedEntry: (args: { serverId: string; action: string; entry: unknown }) => Promise<void>;
  chatSyncFor?: (serverId: string) => ChatSync;   // present ⇒ the shell also bridges global chat
};

type MultiplayerSession = { gameId: string; userId: string; backend: LiveGameBackend; feedActions: string[] };
```

`GameRuntimeFeeds` is a callback contract (`subscribe*(args, onChange) => FeedUnsubscribe`) — backend-neutral, no reactive-query shapes. Swapping backends = implement `GameBackend` (or the richer `LiveGameBackend` a shell session needs) + host authoritative `runCommand` elsewhere; game `commands` and `loop` do not change. Adapter configs in defineGame: `offline()`, `convex({ topology })`, `ws({ topology, url? })`, `fly({ app, topology?, path? })` (ws sugar → url `wss://<app>.fly.dev<path ?? "/ws">`), `socketIo({ topology?, url? })`, `p2p({ topology?, room? })` (topology defaults `"private"`), `lan({ topology?, port?, path? })`, `servers({ maxServers, slotsPerServer, minPlayersToStart, adapter })`. `topology` is exactly `"shared" | "lobbies" | "private"` — no other values exist; a persistent MMO world is `server: "persistent"` + topology `"shared"`.

**Resolvers turn a game + adapter config into a `MultiplayerSession`, or `null` when the config doesn't match** — offline stays the default whenever none resolves: `resolveShellMultiplayer({ game, gameId, url?, userId?, force?, feedActions? })` (`@jgengine/shell/multiplayer`) resolves `ws` (url from arg ?? adapter ?? `ws://localhost:8080/ws`) and `lan` (url derived from `window.location`); `resolvePeerShellMultiplayer({ gameId, role, room? })` is the `p2p` counterpart over `broadcastChannelSignaling`; `resolveConvexMultiplayer({ game, gameId, url?, client?, api?, userId?, force?, feedActions?, poseTuning? })` (`@jgengine/convex/resolveConvexMultiplayer`) resolves on `"convex"`, wrapping `createConvexBackend`. `adapterOf` / `multiplayerAdapterKind` (`@jgengine/core/runtime/adapter`) are the shared classifiers every resolver calls. A host that supports several transports tries them in sequence and hands whichever resolves (or `null`) to `<GamePlayerShell multiplayer={...}>` — see `apps/dev/src/main.tsx` for `resolveConvexMultiplayer(...) ?? resolveShellMultiplayer(...)`.

Once a session resolves, `GamePlayerShell` wires it up with **no game code changes**: pose presence (subscribes `presenceSync`, renders every other member as `RemotePlayers`), `feedActions` (default `entity.died`) bridged both ways through `pushFeedEntry` / `feeds.subscribeFeed` with echo suppression, and — only when the backend exposes `chatSyncFor` — `global`-kind chat channels relayed through it (`whisper` / `party` / `proximity` stay local regardless of backend). Everything else in `GameContext` (inventories, quests, world state) stays client-local unless the game also registers a server-side `GameRuntime`.

**Server side** — `@jgengine/convex/server` ships an entire authoritative Convex backend as factories, not a template to copy: `jgengineTables()` (schema spread), `createGameServerFunctions({ runtimes?, auth? })`, `createLeaderboardFunctions({ auth? })`, `createPresenceFunctions({ auth?, freshWindowMs? })`, `createChatFunctions({ auth?, historyLimit?, maxBodyLength?, minIntervalMs? })`, and `jgengineCronSpecs()` (tick/flush interval metadata for a `crons.ts`). A consumer's `convex/` directory is ~25 lines: `schema.ts` (`defineSchema({ ...jgengineTables() })`), four one-line re-export files (`runtime.ts`, `leaderboard.ts`, `presence.ts`, `chat.ts`, each just calling its factory), and `crons.ts` registering the tick (1s) + flush (60s) internal mutations — see `examples/convex-host` for the reference shape. No game-specific code lives there; any JGengine game can point at the same deployment. Games without a registered `GameRuntime` fall back to a no-save runtime that only understands `engine.ping`; pass `createGameServerFunctions({ runtimes: [createGameRuntime({ gameId, commands, loop, save })] })` to make `runCommand` / tick / save actually do something.

Auth defaults to `"anonymous"` (`JgAuthMode`) on every factory — the client's `externalId` is trusted as claimed, fine for local dev but spoofable. Pass `{ auth: "required" }` to every factory for production; the resolved actor becomes `ctx.auth.getUserIdentity()`'s `subject` and `externalId` is only cross-checked against it, never trusted alone.

**Flip a game online, step by step:** (1) add `multiplayer: convex({ topology: "shared" })` to `game.config.ts` (see `Games/voxel-mine`); (2) stand up a Convex deployment — `bunx convex dev` inside `examples/convex-host` codegens `convex/_generated/` and prints the dev URL; (3) run the client with `VITE_CONVEX_URL=<url>` (env or `.env.local`) — `apps/dev/src/main.tsx` reads it and forces `resolveConvexMultiplayer`. No Convex Cloud account is required: `examples/convex-host/docker-compose.yml` runs the open-source backend (FSL-1.1-Apache-2.0) locally or on any Docker host (Fly.io/Railway templates upstream; Vercel can host only the game client, never the backend) — set `CONVEX_SELF_HOSTED_URL` + `CONVEX_SELF_HOSTED_ADMIN_KEY` in `.env.local` and the same `bunx convex dev` deploys there with full parity (crons, scheduling, file storage). The ws path is the same shape: `multiplayer: ws({ topology })`, a `@jgengine/node` host (`createGameHost` + `createGameWsServer`), and `VITE_JG_WS_URL` forcing `resolveShellMultiplayer`.

**Game code never calls backend functions for gameplay verbs.** The generic server surface (no game nouns): `joinServer / leaveServer / runCommand / getServer / getPlayerProfile / getFeed / listOpenServers`, leaderboard `getTop / getProfile` (writes are internal — increments stage under `LEADERBOARD_PENDING_KEY` in server session and drain through the persistence seam on flush).

Persistence tiers (`@jgengine/core/runtime/hostPersistence` — `HostPersistence` interface, `GameServerRecord` / `PlayerProfileRecord` / `WorldChunkRecord`, `planServerPersist` / `buildHydratePlayers` / `shouldAutoSave` / `trimFeedEntries`): server session, player profile (split on join — `isNew` = no profile), world chunks, leaderboards, feeds (ring of 20). Saves store ids/counts/positions; catalogs stay live so balance patches apply retroactively. Register runnable games host-side via `createGameRuntime({ gameId, commands, loop, save })` — those server hooks are `ServerLoopHooks` (snapshot-based), distinct from the client `GameLoop<GameContext>`.

**Netcode-depth primitives (pure core, backend-neutral).** These sit *above* the transport — game code drives them inside `commands`/`loop`; the host retains what must be authoritative:
- **Lag-compensated hit reg** (`multiplayer/lagCompensation`, #104). `createPositionHistory({ historyMs })` is an N-sample ring per entity; the authoritative `@jgengine/node` ws host records every accepted presence pose and exposes `server.rewind({ serverId, atMs })`. A hitscan command rewinds to `rewindTimestamp(now, rtt, interpDelay)` (= `now − rtt/2 − interpDelay`) and calls `resolveHitscan(history, targets, ray, atMs)` — coarse server-side rewind, **not** full rollback. Valorant/Apex twitch hit reg.
- **Simultaneous hidden-commit + reveal** (`multiplayer/simultaneousCommit`, #105). `createCommitRound({ participants })`: each side `seal`s a sealed action; nothing is readable until `allSealed()`, then `reveal()` returns commits in **participant order** (deterministic regardless of arrival), which `resolveCommits` folds. Marvel Snap face-down-then-reveal.
- **Combat-snapshot replay** (`multiplayer/combatSnapshot`, #106). `serializeBoard({ ownerId, units, stats, seed })` deep-freezes a build into a portable `BoardSnapshot`; `replayCombat(a, b, rules)` resolves it **deterministically** (seeded PRNG) against a live opponent's snapshot — distinct from live-sync adapters. The Bazaar async PvP.
- **Auth identity seam** (`multiplayer/identity`). `AuthSession { userId, displayName?, avatarUrl?, email?, isNew? }` is the one shape every social/multiplayer system keys off. `sessionPlayer(session)` maps it onto the `player: { userId, isNew }` argument of `createGameContext`; `resolveGuestSession(seed?)` mints a stable anonymous id for local/dev. Clerk and better-auth wire in through the `@jgengine/react/identity` adapters (`clerkIdentity(useUser())`, `betterAuthIdentity(authClient.useSession())`) — structural mappers over the shapes those hooks return, so neither SDK is a dependency of any engine package.
- **Session matchmaking** (`multiplayer/matchmaking`, #109). Filters are DATA: `browseSessions(listings, filter, { limit })` hides private/closed, `findByJoinCode` (loose-normalized codes), `quickMatch` fills the fullest joinable lobby. The node host carries generic `SessionAttributes` (`label`/`mode`/`visibility`/`joinCode`/`tags`) on `GameServerRecord`/`ServerListing` and adds `browseServers` + `joinByCode`; the ws backend exposes `browse` / `joinByCode` / `createSession`. Fortnite island browse, Web Fishing join-by-code.

**Transport pipe seam** (`@jgengine/ws/pipe`) — `createWsBackend` and the host-side `createHostRouter` don't require a raw WebSocket; both run over any bidirectional string channel. `TransportPipe { send(data: string), close() }` + `TransportPipeHandlers { onOpen, onMessage(data), onClose }`; a `TransportPipeFactory = (handlers) => TransportPipe` opens one connection. `webSocketPipe(url, webSocketFactory?)` is the browser-`WebSocket` default. `createWsBackend({ userId, url?, pipe? })` takes either (one of the two is required) — this seam is what lets the same JSON wire protocol ride a raw ws socket, socket.io, an in-process loopback, or a WebRTC data channel with one implementation.

**Browser-safe host + router** (`@jgengine/ws/host`, `@jgengine/ws/hostRouter`) — `createGameHost({ runtimes, persistence, tickMs? })` and `memoryPersistence()` moved here from `@jgengine/node` (which still re-exports both, unchanged, from `@jgengine/node/host` / `@jgengine/node/persistence` — not a breaking change); the host itself has zero Node dependencies, so a browser tab can host a session. `createHostRouter({ host, authenticate?, poseRules?, positionHistoryMs?, chatRateLimit?, chatHistoryLimit?, chatMaxBodyLength?, now? }): HostRouter` is the ws wire-protocol session logic extracted out of `createGameWsServer` — `.connect(transport: { send, close }) → { handleRaw, close }` binds one connection, `.rewind` replays lag-comp history, `.close` tears the router down. `loopbackPipe(router): TransportPipeFactory` wires a `createWsBackend` straight into an in-process router — how a host player plays over their own hosted session with no socket at all.

**Socket.IO transport** (`@jgengine/ws/socketIoPipe`, `@jgengine/node/socketIoServer`) — `SocketIoLikeSocket` is a structural client-socket shape (`connected`/`on`/`off`/`send`/`disconnect`; no socket.io dependency). `socketIoPipe(socket): TransportPipeFactory` + `createSocketIoBackend({ socket, userId, … }): WsBackend` ride the existing wire protocol over socket.io's `send`/`message` frames. Server side, `@jgengine/node`'s `attachGameSocketIoServer({ io, host, …router options }): { rewind, close }` binds a structural `SocketIoLikeServer`/`SocketIoLikeServerSocket` to the router — no socket.io dependency in the type, just the shape.

**WebRTC P2P** (`@jgengine/ws/peer`) — one browser tab is the authoritative host; no server process. `encodePeerSignal`/`decodePeerSignal` turn an SDP offer/answer into a copy-pasteable base64url code. `createPeerHost({ userId, host?, runtimes?, persistence?, tickMs?, router?, rtc? }): PeerHost` (persistence defaults to `memoryPersistence()`) runs a `GameHost` + `HostRouter` in the host tab, exposing `backend` (the host player's own loopback `WsBackend`) and `accept(offerCode) → Promise<answerCode>` per joining guest. `createPeerGuest({ userId, token?, rtc? }): PeerGuest` exposes `backend`, `offer()`, `connect(answerCode)`; both close via `.close()`. Signaling is a swappable seam — `PeerSignaling { publishOffer, onOffer, close }` — with `broadcastChannelSignaling(room)` covering same-origin multi-tab automatically; `announcePeerHost(host, signaling)` / `joinPeerSession(guest, signaling) → Promise<WsBackend>` wire a host/guest to a signaling channel in one call. Cross-machine play is manual copy/paste of the offer/answer codes; there is no auto-reconnect.

Backends:
- **Convex** — `@jgengine/convex` `createConvexBackend({ client, gameId, userId, api?, poseTuning?, presence? })` (a `LiveGameBackend`, `api` defaults to `anyApi`); server side is `@jgengine/convex/server`'s factories (tables `jgGameServers`, `jgPlayerProfiles`, `jgWorldChunks`, `jgLeaderboardRows`, `jgFeedBuffers`, `jgPoses`, `jgChatMessages`); a 1s tick cron runs loop ticks + auto-save, a 60s cron flushes dirty servers.
- **Node host** — `createGameHost({ runtimes, persistence, tickMs? })` now lives in `@jgengine/ws/host` (browser-safe); `@jgengine/node` re-exports it unchanged from `@jgengine/node/host` (same for `memoryPersistence` from `@jgengine/node/persistence`) — runs the authoritative loop in any JS process (in-memory snapshots, save-cadence flush), plus `browseServers({ gameId, filter? })` / `joinByCode({ userId, gameId, code })` and `joinServer({ …, attributes })` for coded/private lobbies. `memoryPersistence()` / `filePersistence(dir)` (Node-only, still `@jgengine/node`) implement `HostPersistence`. `createGameWsServer({ host, port | server, authenticate?, poseRules?, positionHistoryMs? })` is now a thin `@jgengine/node` binding of `@jgengine/ws/hostRouter`'s `createHostRouter` onto the `ws` npm package (same public API + `RewoundPosition` re-export, versioned JSON protocol in `@jgengine/ws/protocol`, poses clamped server-side via `decidePoseSync`) and retains presence history for `rewind`.
- **WebSocket client** — `@jgengine/ws` `createWsBackend({ userId, url?, pipe? })` returns a `GameBackend` (plus `pushFeedEntry`, `browse` / `joinByCode` / `createSession`, `presenceSync` with client-side `poseSyncGate`); one of `url`/`pipe` is required — `url` opens the default `webSocketPipe`, `pipe` accepts any `TransportPipeFactory` (socket.io, WebRTC, loopback, custom). Browser-safe, imports core only. `createHttpReads({ baseUrl, gameId })` gives plain-fetch reads (`getTop / getLeaderboardProfile / getPlayerProfile / listOpenServers`) — no live-query dependency.
- **Postgres** — `@jgengine/sql` `ensureSchema(pool)` + `sqlPersistence(pool)` implement `HostPersistence` over any pg-compatible pool (structural interface, no hard `pg` dep; tables `jg_game_servers`, `jg_player_profiles`, `jg_world_chunks`, `jg_leaderboard_rows`, `jg_feed_buffers`). `HostPersistence.savePlan` applies a whole `ServerPersistPlan` in one transaction (leaderboard drain included); hosts fall back to per-tier calls when absent.
- **Clients** — `@jgengine/shell` (`GamePlayerShell`; each client supplies its own `GameRegistry`) is the shared player: it works in Vite, Next.js, or a Tauri webview; the authoritative ws host stays a standalone process (or, over `@jgengine/ws/peer`, the host player's own browser tab).
- **Shell multiplayer** — every resolver produces a `MultiplayerSession` (`ShellMultiplayer` is an alias of it). `resolveShellMultiplayer` resolves straight off `defineGame`'s `multiplayer` adapter config: `ws(...)` connects to `url ?? adapter.url ?? ws://localhost:8080/ws`; `lan(...)` derives `ws(s)://<page hostname>:<port ?? 8080><path ?? /ws>` from `window.location`, so any browser on the LAN auto-connects to whichever machine served the page; other adapter kinds resolve to `null` (or fall back to the plain ws URL under `force` / the web dev route's `?ws` / desktop's `VITE_JG_WS_URL`). `resolvePeerShellMultiplayer({ gameId, role: "host" | "join", room?, userId?, feedActions? }): Promise<ShellMultiplayer & { close }>` is the `p2p` counterpart — hosts or joins over `broadcastChannelSignaling`, no ws URL involved; `apps/dev` wires it behind `?p2p=host` / `?p2p=join`. `resolveConvexMultiplayer` is the `convex` counterpart (forced by `VITE_CONVEX_URL` the same way). `<GamePlayerShell multiplayer={session}>` then joins a server, pose-syncs the local player, renders remote players from the presence roster, bridges feed actions (default `entity.died`) both ways with echo suppression, and — when the backend exposes `chatSyncFor` — relays `global`-kind chat channels too. Game code unchanged either way.
- **Voice channels** — `@jgengine/ws/voiceChannel` (`createVoiceChannelRouter(channels?)`) is a thin, coarse layer on top of the same transport/presence model: it ships the channel/falloff **routing model**, not a WebRTC media stack (no audio transport — the media plane stays behind `multiplayer/voiceContract`'s `VoiceTransport` signaling seam: `join / leave / publish(streamId) / subscribers`; `createWsBackend(...).voiceSync` / `.voiceTransportFor(serverId)` implement it over `voiceJoin`/`voiceLeave`/`voicePublish` frames with host-relayed channel rosters, and `createLocalVoiceTransport()` covers local/dev; peers exchange stream **descriptors** here and negotiate actual media host-side). Mic capture + push-to-talk live in `@jgengine/react/voice` (`useVoice`, `createPushToTalk` state model: hold / toggle / openMic, mute-gated). `VoiceChannelDef = { id, positional, falloff?, gain? }` — `positional: true` channels (proximity voice) attenuate by distance using the same `@jgengine/core/audio/audioFalloff` curve as positional SFX; `positional: false` channels (walkie/crew) play at flat gain regardless of distance. A member `join`s any number of channels at once (a Sea of Thieves–style crew channel *and* nearby-ship proximity, simultaneously); `updatePosition(userId, xyz)` feeds positions (typically mirrored from `WsPresenceRow`); `setMuted(userId, bool)` silences every channel from that speaker at once. `resolveRoutes(listenerUserId)` returns one `{ fromUserId, channelId, gain }` per shared channel — the mixer plays each route independently, so the same speaker can be loud on `walkie` and near-silent on `proximity` at the same time.

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
| `useFriends()` / `useParty()` / `usePresence(userId)` / `useWorldInvites()` | social panels |
| `useFriendRequests()` / `usePartyInvites()` | pending inbound requests/invites for the local player |
| `useWorldBrowser({ fetchSessions, filter?, limit?, refreshMs? })` | polls a host-supplied fetcher (e.g. `createWsBackend().browse`) through matchmaking's `browseSessions` |
| `useSession()` / `useAuthedPlayer({ guestSeed? })` | auth session from `<GameIdentityProvider>` / the `{ userId, isNew }` player seam for `createGameContext` |
| `useChat(channelId, { limit? })` | local-player-filtered recent messages from `ctx.game.chat` |
| `useVoice({ transport?, channelId?, mode?, resolveRoutes? })` | mic capture + PTT + voice-channel roster over the `VoiceTransport` seam |
| `useRoster(userId?)` | owned/captured roster entries for a user (defaults to the local player) |
| `useLeaderboard(stat, { scope, limit? })` | `{ userId, value }[]` |
| `useActivePrompt(prompts)` | nearest proximity prompt |
| `useGameClock()` | clock snapshot (`now`, `paused`, `speed`, `calendar`) + `controls` (pause/play/setSpeed) |
| `useLocalPlayerDead()` / `localPlayerEntity(entities, userId)` | death-screen gating; local player from a snapshot |
| `useMarkers(markerSet)` / `useFog(fogField)` | live map-marker list / fog-cell snapshot (bind a core `MarkerSet`/`FogField`) |
| `useGameStore()` | raw store handle — escape hatch under the typed hooks |
| `useEngineState(store)` / `useEngineStore(store, selector)` / `useEngineEvent(store, event, handler)` | bind/select/subscribe against any `ReadableEngineStore<TState>` / `EventfulEngineStore<TEventMap>` — the escape hatch below `useGameStore()` for state that isn't wired into a typed hook yet |

Import hooks from `@jgengine/react/hooks`, components from `@jgengine/react/components`, `GameProvider` from `@jgengine/react/provider` (the package uses deep paths like core). `useEngineState`, `ReadableEngineStore`, `useEngineStore`, `useEngineEvent` also ship from the main `@jgengine/react` entry point (defined in `@jgengine/react/engineStore`, re-exported at the package root) — no deep import required.

Headless components (className passthrough, no baked-in styling): `SlotGrid`, `HealthBar` (+ `fillClassName`), `CurrencyPill`, `ProximityPrompt`, `Screen`, `KeybindRow`, `DialogueBox` (+ `lineClassName`/`speakerClassName`/`choicesClassName`/`choiceClassName`/`checkClassName`, `rollCheck`-gated choices), `SkillCheckBar` (+ `trackClassName`/`zoneClassName`/`markerClassName`), `QteTrack` (+ `stepClassName`/`activeClassName`/`doneClassName`), `CaptureOdds` (+ `fillClassName`), `ToastStack`, `DeathScreen`, `LevelUpFlash`. Not yet implemented: `useServer`.
**Identity (`@jgengine/react/identity`)** — `<GameIdentityProvider source={…}>` + `useSession()`. Sources: `clerkIdentity({ isLoaded, isSignedIn, user })` maps Clerk's `useUser()` shape, `betterAuthIdentity({ data, isPending })` maps better-auth's `useSession()` shape (both pure structural mappers — no SDK imports, one line at the call site), `guestIdentity(seed?)` for local/dev. Gate UI with `<RequireSession fallback loading>`; `<UserBadge>` / `<SignOutButton>` are headless like everything else. `useAuthedPlayer({ guestSeed? })` returns the `{ userId, isNew }` to hand `createGameContext` — feed the player seam from the session instead of hand-picking a userId.
**Chat (`@jgengine/react/chat`)** — headless `<ChatPanel>` (tabs + log + input composition with internal active-channel state), or compose `<ChannelTabs active onSelect>`, `<ChatLog channelId>` (auto-scrolls, `renderMessage` override), `<ChatInput channelId onSent onRejected>` yourself. All drive `ctx.game.chat` through `useChat`. `chatTransportFromSync(sync)` lifts a callback-style `ChatSync` (e.g. `createWsBackend(...).chatSyncFor(serverId)`) into the hook-shaped `ChatTransport` for remote chat.
**Voice (`@jgengine/react/voice`)** — `useVoice()` once per channel: `getUserMedia` mic capture (`requestMic()`, tracks gated by transmission), push-to-talk via `createPushToTalk` (hold/toggle/openMic + mute), roster from `VoiceTransport.subscribers`, and per-speaker `gainFor(userId)` when you pass `resolveRoutes: () => router.resolveRoutes(myUserId)` from `@jgengine/ws/voiceChannel`. Hand the returned state to the headless `<PushToTalkButton voice>`, `<MicToggle voice>`, `<SpeakingIndicator voice userId>`, `<VoiceRoster voice>`.
**Social (`@jgengine/react/social`)** — the headless social kit over `ctx.game.social`: friends (`<FriendsList>`, `<FriendRow>`, `<PresenceDot>`, `<AddFriendButton toUserId>`, `<FriendRequestsList>` with accept/decline), party (`<PartyFrame>`, `<PartyMemberRow>`, `<PartyInviteToast>`, `<LeavePartyButton>`), worlds (`<WorldBrowser listings onJoin>`, `<JoinByCode onJoin>` — normalizes codes, `<QuickMatchButton listings filter?>`, `<InviteToWorldButton toUserId target>`, `<WorldInviteToast onAccepted>` — hands you the `{ serverId, joinCode? }` join target), and `<EmoteWheel emotes>` over `emotes.play`. All className-passthrough with `data-*` hooks and `renderX` overrides; the `social-hub` demo in `apps/dev` (`?game=social-hub`) composes the whole kit.
**Drag/rotate/drop/snap gesture layer** (`@jgengine/react/dragLayer`) — a 2-D UI-space gesture layer over the card/shaped-grid primitives, distinct from 3-D world drag. `useDragLayer<T>({ onDrop })` owns pointer-follow drag state (begin/rotate/setTarget/end); pair it with the headless, className-passthrough `DraggableCard` (right-click rotates), `DropZone` (reports the snapped `cellFromPoint` cell + active state), and `DragGhost` (a pointer-anchored preview). Drop resolution and overlap validation stay the game's job via `canPlace`/`placeShaped` from `inventory/shapedGrid` — Balatro hand→play drags, Backpack Hero grid placement, Slay-the-Spire card-onto-enemy targeting.
Headless components (className passthrough, no baked-in styling): `SlotGrid`, `HealthBar` (+ `fillClassName`), `CurrencyPill`, `ProximityPrompt`, `Screen`, `KeybindRow`, `DialogueBox`, `ToastStack`, `DeathScreen`, `LevelUpFlash`. Map components (bind a core `MarkerSet`/`FogField`, `kindStyles` palette overridable): `Minimap` (framed circular player-centered map — fog + markers + facing arrow, optional baked terrain `background`+`mapBounds`), `Compass` (facing strip with cardinals + marker pips), `WorldMap` (full-bounds top-down overlay). Not yet implemented: `useServer`, `useDialogue`.

**Styled game-UI kit (`@jgengine/react/gameui`)** — ~50 fully styled, game-native components (inline styles, zero CSS/Tailwind setup needed; every visual token comes from a theme). Start here before hand-rolling HUD chrome; the headless primitives above remain the low-level escape hatch. Theming: wrap in `<GameUiThemeProvider theme={emberTheme | synthwaveTheme | fieldkitTheme | your GameUiTheme}>` — every component reskins from the one token object (`useGameUiTheme()` inside custom components). Families, each with its own construction so nothing looks like the same card twice: **vitals** (`VitalBar`/`EntityVitalBar` slant-clipped bars with damage ghost-trail + segment ticks, `UnitFrame`/`TargetFrame` portrait plates with level rosette, `CastBar`, `BossBar` with phase ticks, `ResourceOrb` liquid orbs, `HeartRow`, `XpBar`, `ChargeMeter`, `BreakMeter`); **slots** (`AbilitySlotButton` with the four required states + conic cooldown sweep + charge pips + corner `KeybindBadge`, `ActionBar`, `AbilityActionBar` bound to an `AbilityKit` via `useAbilitySlots`, `HotbarSelector`, `ItemGrid`/`InventorySlotGrid` with rarity borders, `EquipmentDoll`, `BuffTray`/`MoodleTray`, `LootCard`); **feedback** (`CombatFloatLayer`/`GameEventFloats` floating combat text, `HitMarker`, `KillFeed`/`FeedKillFeed`, `AnnouncementBanner`, `ComboCounter`, `StreakCallout`, `PickupToastStack`/`FeedPickupToasts`, `LevelUpSplash`); **meters** (`ScoreReadout`, `MatchTimer`, `CountdownPips`, `WaveIndicator`, `AmmoCounter`, `CurrencyDisplay`/`WalletCurrencyDisplay`, `ObjectiveChannel`, `TeamScoreBoard`, `RacePosition`, `ArcGauge`, `EventChargeMeter`); **panels** (bracket-cornered `HudPanel` chrome: `QuestTracker`/`JournalQuestTracker` — frameless per MMO convention, `ScoreboardOverlay`, `RankList`/`StatLeaderboard`, `CombatLogPanel`/`FeedCombatLog`, `VendorPanel`, `CraftingPanel`, `DialoguePanel`); **screens** (`TitleScreen`, `PauseScreen`, `DeathScreenView`/`DeathOverlayBound`, `ResultsScreen`, `LoadingScreen`, `MenuButton`/`MenuList`, `SliderRow`/`ToggleRow`/`SettingsGroup`); **reticles** (`Reticle` variants with spread, `LockOnMarker`, `DamageDirectionIndicator`, `WaypointMarker`/`HudMarkerLayer`, `InteractionRing`); **icons** (`GameIcon` + 59-name `GAME_ICON_NAMES` silhouette catalog, `iconForItemId` keyword resolver — satisfies the no-placeholder-icon rule out of the box). Engine-bound variants (prefixed `Entity`/`Ability`/`Journal`/`Feed`/`Wallet`/`Stat`/`GameEvent`) wrap the hooks table above; everything else is prop-driven and works without a `GameContext`. Browse everything staged: `apps/dev` `?game=ui-kit&mode=ui` (tabs via `&tab=hud|items|meters|panels|screens|icons`, theme via `&kitTheme=`).

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
- [ ] HUD screenshotted over a staged `GameUiPreview` scenario and **judged by looking at the image** (see `jgengine-ui`) — the final human glance, not the verification loop
- [ ] Co-located bun tests for pure game math (curves, cooldowns, spawn logic)
- [ ] Multiplayer via adapter config only; no direct backend calls

## Quick reference

```
defineGame (shell) engine fields (assets, world, physics, inventories, input, server, save, time, multiplayer)
                   + presentation fields (content, loop, GameUI, camera, environment, …) in one call — smart defaults fill the rest
defineGame (core)  the underlying engine-only primitive: assets, world, physics, inventories, input, server, save, time, multiplayer, loop
PlayableGame       { game, content, loop, GameUI, camera, … } — the runner contract `defineGame` (shell) returns
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
game.social        friends (persisted, requests listable), party (ephemeral, invites listable), presence, emotes (nearby broadcast), worldInvites (accept → join target)
game.chat          send / whisper / history / register — global/party/proximity channels, rate-limited, mute via blocked set
game.roster        capture / release / list / setEquipped — persisted owned-creature roster
game.events/feed/leaderboard   on / bind+push+recent / track+increment+getTop
applyLoadout       all-or-nothing kit seeding per userId
player.movement    pose (hitboxes) + aim (zoom modifier)
player.possession  own/disown/owns/listOwned + active + possess — control-swap, rebinds shell camera
player.cosmetics   register + apply/equip + get — per-player appearance slots, no gameplay effect
scene.entity.form  register + shapeshift/revert + active/abilities — movement+ability+mesh bundle, game-time duration
proximityPrompt    { radius, display: {kind}, invoke } — one float-UI primitive
skillCheck/qte     evaluateSkillCheck (moving zone + window) / evaluateQteSequence (timed steps)
captureCheck       captureChance / rollCapture — hp% + catchPower → probability
dialogue check     DialogueChoice.check (roll vs DC + advantage/disadvantage) → onSuccess/onFailure
world features     biomes / voxel / plots / tilemap / flat descriptors
physics/physicsWorld  optional headless rigid-body sim (PhysicsWorld) — not the defineGame physics field
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
