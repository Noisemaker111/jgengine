export { type HeatConfig, type HeatGain, type HeatLevelDef, type HeatState } from "./ai/heatSystem";
export {
  advanceInterestGate,
  createInterestCensus,
  createInterestGateState,
  interestPhase,
  type InterestCensus,
  type InterestCensusAccumulator,
  type InterestGateInput,
  type InterestGateState,
  type InterestGateStep,
  type InterestSchedulerConfig,
  type InterestState,
  type InterestTier,
} from "./ai/interestScheduler";
export { type Job, type JobDef, type JobReport } from "./ai/jobBoard";
export {
  advanceSpawnDirector,
  advanceWave,
  createSpawnDirectorState,
  pickSpawnPoint,
  raiseAlert,
  type SpawnDirectorConfig,
  type SpawnDirectorState,
  type SpawnEntry,
  type SpawnRequest,
  type WaveManifest,
} from "./ai/spawnDirector";
export {
  acquireTarget,
  createTargetAcquirer,
  type AcquisitionEnvelope,
  type AcquisitionPolicy,
  type AcquisitionResult,
  type AcquisitionRetention,
  type TargetAcquirer,
} from "./ai/targetAcquisition";
export { createThreatTable, type ThreatTable } from "./ai/threat";
export {
  createAreaEffectField,
  type AreaEffectEvent,
  type AreaEffectField,
  type AreaEventKind,
  type AreaFieldState,
  type AreaLeaveReason,
  type AreaMembership,
  type AreaShape,
  type AreaSourceSpec,
  type AreaStepInput,
} from "./area/areaEffectField";
export {
  cappedStacks,
  extremumStack,
  independentStacks,
  sumMagnitude,
  uniqueByStackKey,
  type AreaStackPolicy,
  type MagnitudeOf,
} from "./area/stackPolicy";
export {
  computeFalloffGain,
  distance3,
  resolveEmitterGain,
  type AudioBusDef,
  type AudioFalloffConfig,
  type SoundDef,
} from "./audio/audioFalloff";
export {
  mtof,
  notesInWindow,
  themeLoopSeconds,
  type MusicInstrument,
  type MusicTheme,
  type NoteEvent,
} from "./audio/music";
export { type NoiseVoice, type SynthPatch, type ToneVoice } from "./audio/synth";
export { createFactionGraph, createFactionRoster, type FactionDef } from "./faction/factions";
export {
  DEFAULT_REPUTATION_TIERS,
  createReputationLedger,
  effectiveRelation,
  tierForStanding,
} from "./faction/reputation";
export {
  controlGroupKey,
  resolveControlGroupIntent,
  type ControlGroupInput,
  type ControlGroupIntent,
  type ControlGroupOptions,
} from "./input/controlGroups";
export {
  buildContextMenu,
  contextVerb,
  contextVerbInput,
  type ContextMenu,
  type ContextVerb,
} from "./interaction/contextMenu";
export {
  LOCK_ACTIONS,
  generateLock,
  solveLock,
  solveLockPath,
  stepLock,
  visibleCells,
  type LockAction,
  type LockCell,
  type LockSpec,
  type LockStepResult,
  type LockTierSpec,
} from "./interaction/lockpick";
export {
  command,
  gauge,
  keybind,
  label,
  proximityPrompt,
  resolveActivePrompt,
  type PositionedPrompt,
  type ProximityPrompt,
} from "./interaction/proximityPrompt";
export { evaluateQteSequence, pendingQteStep, type QteStep } from "./interaction/qte";
export {
  evaluateSkillCheck,
  skillCheckZoneAt,
  type SkillCheckConfig,
  type SkillCheckResult,
} from "./interaction/skillCheck";
export { resolveLocalAvoidance, type AvoidanceAgent, type LocalAvoidanceOptions } from "./movement/avoidance";
export {
  assignFormationSlots,
  boxFormation,
  circleFormation,
  facingYaw,
  lineFormation,
  placeFormation,
  wedgeFormation,
  type BoxFormationOptions,
  type CircleFormationOptions,
  type FormationSlotGenerator,
  type LineFormationOptions,
  type SlotAssignmentOptions,
  type WedgeFormationOptions,
} from "./movement/formation";
export { createGlideModel } from "./movement/glideModel";
export { createGrappleSwing } from "./movement/grappleSwing";
export { createLeaderTrail } from "./movement/leaderTrail";
export { MOVEMENT_TUNING, type CollisionObstacle } from "./movement/movementModel";
export { resolvePlayerMovementTuning, stepPlayerMovement } from "./movement/playerMovement";
export { POSE_HITBOX, createPoseState, type MovementPose } from "./movement/poseState";
export { steerYaw } from "./movement/steering";
export { constrainToNavGrid } from "./nav/navConstrain";
export { populateNavGridFromEnvironment } from "./nav/navFromEnvironment";
export { createNavGrid, findPath, slopeStepCost, type NavGrid, type NavPoint } from "./nav/navGrid";
export {
  advancePathFollow,
  createPathFollow,
  pathFollowProgress,
  pathFollowSeek,
  pathFromNav,
  pathLength,
  type PathFollowConfig,
  type PathFollowProgress,
  type PathFollowState,
  type PathProgress,
  type Waypoint,
} from "./nav/pathFollow";
export {
  defineAttackMoveOrder,
  defineHoldOrder,
  defineMoveOrder,
  definePatrolOrder,
  defineStopOrder,
  defineTargetedOrder,
  type AttackMoveOrderPayload,
  type EmptyOrderPayload,
  type EngagementKindConfig,
  type EngagementOrderState,
  type MoveOrderPayload,
  type OrderKindConfig,
  type OrderMoveResult,
  type OrderMover,
  type OrderTargeting,
  type PatrolOrderPayload,
  type PatrolOrderState,
  type TargetedOrderPayload,
} from "./orders/orderKinds";
export {
  createOrderQueue,
  createOrderRegistry,
  type Order,
  type OrderCancelReason,
  type OrderEvent,
  type OrderIssueResult,
  type OrderKind,
  type OrderOutcome,
  type OrderPhase,
  type OrderProgress,
  type OrderQueue,
  type OrderQueueOptions,
  type OrderQueuePolicy,
  type OrderQueueState,
  type OrderRegistry,
  type OrderRejection,
  type OrderRequest,
  type OrderStartResult,
  type OrderTickReport,
  type OrderVec3,
} from "./orders/orderQueue";
export { createBallisticSweep, type BallisticSweep, type BallisticSweepHit } from "./physics/ballisticSweep";
export { createBuoyantBody } from "./physics/buoyancy";
export { Carryable, carrySpeedMultiplier } from "./physics/carryable";
export { createDamageModel } from "./physics/damageZones";
export { tickDrivableVehicle } from "./physics/drivableVehicle";
export {
  createAircraftDynamics,
  type AircraftDynamics,
  type AircraftKind,
  type AircraftOptions,
  type AircraftStep,
  type AircraftTuning,
  type FlightControlInput,
  type FlightControlRates,
  type FlightVector,
} from "./physics/flightDynamics";
export { ForceVolume, PlatformCarry } from "./physics/forceVolume";
export {
  combineGravity,
  pointGravity,
  uniformGravity,
  type GravityField,
  type GravityVector,
  type PointGravityOptions,
} from "./physics/gravityField";
export {
  createKinematicVehicle,
  type KinematicChassisTuning,
  type KinematicDynamicsTuning,
  type KinematicPowertrainTuning,
  type KinematicSteeringTuning,
  type KinematicVehicle,
  type KinematicVehicleStep,
  type KinematicVehicleTuning,
} from "./physics/kinematicVehicle";
export {
  PhysicsWorld,
  SHAPE_BOX,
  SHAPE_SPHERE,
  type AddBodyOptions,
  type CollisionEvent,
  type PhysicsStats,
} from "./physics/physicsWorld";
export { createRagdoll } from "./physics/ragdoll";
export { SpatialGrid } from "./physics/spatialGrid";
export { StructureGraph, type CollapseEvent, type StructureMaterial } from "./physics/structure";
export { Glide, Grapple } from "./physics/traversal";
export { DEFAULT_GRIP_CURVE, createVehicleBody, sampleGripCurve, type GripCurve } from "./physics/vehicleBody";
export {
  createVehicleObstacleClamp,
  type VehicleImpact,
  type VehicleObstacleClamp,
} from "./physics/vehicleObstacles";
export { createAssetCatalog, type AssetCatalog, type ModelAssetRef, type ModelDims } from "./scene/assetCatalog";
export { partsBounds, registerAssetGenerator, type GeneratedAsset, type GeneratedPart } from "./scene/assetGenerator";
export {
  applyRotationPolicy,
  headingToRotationY,
  normalizeDegrees,
  parseAssetSpace,
  parseRotationPolicy,
  resolveAnchorOffset,
  resolveFacingRotationY,
  rotatedFootprint,
  rotationYToHeading,
  snapHeading,
  toEngineUnits,
  validateAssetSpace,
  type AssetAnchor,
  type AssetSpace,
  type AssetSpaceIssue,
  type PlacementRotationPolicy,
} from "./scene/assetSpace";
export {
  collectAuthoredTriggers,
  createAuthoredTriggerRuntime,
  getTriggerAction,
  listTriggerActions,
  pointInVolume,
  registerTriggerAction,
  type AuthoredTrigger,
  type AuthoredTriggerRuntime,
  type TriggerActionDefinition,
  type TriggerDispatchEvent,
  type TriggerEvent,
  type TriggerHandlers,
  type TriggerSourceKind,
} from "./scene/authoredTriggers";
export { selectAutoTarget, type AutoTargetPolicy } from "./scene/autoTarget";
export {
  advanceBehaviors,
  behaviorControl,
  type BehaviorControl,
  type BehaviorInspection,
  type BehaviorResumePolicy,
  type BehaviorSnapshot,
  type BehaviorStatus,
} from "./scene/behaviorRuntime";
export { patrol, player, talkable, wander, type BehaviorDescriptor } from "./scene/behaviors";
export { createBodyBind } from "./scene/bodyBind";
export { type ColliderPurpose, type EntityColliderSet, type ResolvedCollider } from "./scene/colliders";
export { type StatCatalog, type StatValue } from "./scene/entityStats";
export { entityMetaOf, groundSpeed, type EntityPosition, type SceneEntity } from "./scene/entityStore";
export { DEFAULT_FORWARD } from "./scene/facing";
export { readNamedSockets, type ModelNode } from "./scene/modelSockets";
export { MountController, createMountController } from "./scene/mount";
export { objectVisualScale, type ObjectVisual, type SceneObject } from "./scene/objectStore";
export { type PaintStroke } from "./scene/paintLayer";
export { type RosterEntry } from "./scene/roster";
export {
  findSchemaPreset,
  parseParams,
  registerSceneKind,
  type ParamField,
  type ParamPreset,
  type ParamSchema,
  type ParsedParams,
  type SceneKindObject,
  type SceneKindResolveContext,
  type WeightedParamEntry,
} from "./scene/sceneKinds";
export { firstImpact, hitsUntilBlocked, type SceneRaycastApi, type SceneRaycastHit } from "./scene/sceneRaycast";
export {
  createSelectionSet,
  isMarquee,
  screenRect,
  selectWithinRect,
  type ScreenRect,
  type SelectionSet,
} from "./scene/selection";
export {
  createSelectionBookmarks,
  recallSelectionBookmark,
  type BookmarkRecallMode,
  type RecallBookmarkOptions,
  type SelectionBookmarkSnapshot,
  type SelectionBookmarks,
  type SelectionPruneResult,
} from "./scene/selectionBookmarks";
export {
  createSequenceDirector,
  type CueListener,
  type EmittedCue,
  type SequenceCue,
  type SequenceDirector,
  type SequenceDirectorOptions,
  type SequenceSnapshot,
  type SequenceState,
} from "./scene/sequenceDirector";
export { type Aim } from "./scene/spatial";
export { createStationClaim, type Station } from "./scene/stationClaim";
export { VehicleSeats, createVehicleSeats } from "./scene/vehicleSeat";
export { type ConcealmentSensor } from "./sensor/concealment";
export { type FreezeMonitor, type FreezeViolation } from "./sensor/freezeMonitor";
export {
  type FramingConfig,
  type FrustumProjection,
  type FrustumSample,
  type FrustumSensor,
  type FrustumTarget,
} from "./sensor/frustumSensor";
export { type HiddenStateSource, type SensorProbeOptions, type SensorReading } from "./sensor/hiddenStateProbe";
export { type RecordingBuffer, type RecordingBufferOptions } from "./sensor/recordingBuffer";
export { type RevealHit, type RevealQuery } from "./sensor/revealQuery";
export {
  createDayNightCycle,
  type DayNightCycle,
  type DayNightCycleOptions,
  type DayNightKeyframe,
  type DayNightSample,
  type DayNightSnapshot,
} from "./time/dayNightCycle";
export { getCurrentGameTimestamp, sanitizeGameTimeScale } from "./time/gameClock";
export { type ClockSnapshot, type SimClock } from "./time/simClock";
export {
  createTimerSet,
  type TimerDirection,
  type TimerExpiryListener,
  type TimerRead,
  type TimerSet,
  type TimerSetOptions,
  type TimerSetSnapshot,
  type TimerSnapshot,
  type TimerStartOptions,
} from "./time/timerSet";
export {
  createDamageDirectionTracker,
  type DamageDirectionOptions,
  type DamageDirectionSnapshot,
  type DamageDirectionTracker,
  type DamageIndicator,
  type HitInput,
} from "./vfx/damageDirection";
export {
  createParticleSystem,
  type Curve,
  type EmitterConfig,
  type ParticleBuffers,
  type ParticleSnapshot,
  type ParticleSystem,
  type Range,
} from "./vfx/particles";
export {
  createScreenEffects,
  type ScreenEffect,
  type ScreenEffectEasing,
  type ScreenEffectShape,
  type ScreenEffectSpec,
  type ScreenEffectsController,
  type ScreenEffectsOptions,
  type ScreenEffectsSnapshot,
  type StoredScreenEffect,
} from "./vfx/screenEffects";
export { type BoundsSpec, type Vec3 } from "./visibility/bounds";
export { type CameraVisibilityContext } from "./visibility/camera";
export { type VisibilityConfig } from "./visibility/config";
export { distance } from "./visibility/distance";
export { type CameraView, type Frustum } from "./visibility/frustum";
export { createVisibilitySystem, type Renderable, type VisibilitySystem } from "./visibility/visibilitySystem";
export {
  markerCatalogId,
  placeAuthoredObjects,
  placeAuthoredObjectsFromDocument,
  resolveAuthoredObjects,
} from "./world/authoredObjects";
export { createContributionPool, createPlotPermissions, type BuildRole } from "./world/buildPermissions";
export { buildingIndex, type BuildingIndex } from "./world/buildingIndex";
export { type BuildingPaletteOverrides, type BuildingStyle } from "./world/buildings";
export { CarvableField, VoxelVolume, carvableTerrain, type VoxelMaterial } from "./world/carve";
export { catenaryCurve, sagCurve } from "./world/catenary";
export { type CityBlockKind } from "./world/cityBlocks";
export {
  CITY_FILLER_CLASSES,
  CITY_LANDMARK_CLASSES,
  CITY_LOT_CLASSES,
  CITY_TREE_SPECIES,
  type CityFillerClass,
  type CityLandmarkClass,
  type CityLotClass,
  type CityLotPiece,
  type CityPieceRole,
  type CityPieceShape,
  type CityTreeSpecies,
  type CityZoneBand,
  type CityZoneProfile,
} from "./world/cityContent";
export {
  CITY_PLOT_TIERS,
  DEFAULT_BLOCK_FILL,
  DEFAULT_CITY_LEVEL_BIAS,
  DEFAULT_CITY_ZONE_MIXES,
  DEFAULT_LANDMARK_SHARE,
  LANDMARK_HARD_CAP,
  deriveCityPlots,
  generateCity,
  resolveCityLotContent,
  type CityContentOptions,
  type CityContentOverrides,
  type CityGeneratorOptions,
  type CityLevelClassBias,
  type CityPlot,
  type CityPlotFrontage,
  type CityPlotOptions,
  type CityPlotResult,
  type CityPlotTier,
  type CityZoneMixes,
  type GeneratedCity,
  type MassingFootprint,
  type ResolvedCityLot,
} from "./world/cityGenerator";
export {
  CITY_DEFAULTS,
  CITY_KIND,
  CITY_SCHEMA,
  CITY_ZONE_KIND,
  CITY_ZONE_SCHEMA,
  resolveCityObject,
  type CityBlock,
  type CityBridge,
  type CityDriveway,
  type CityHedge,
  type CityIntersection,
  type CityLight,
  type CityLot,
  type CityParcel,
  type CityParcelFrontageOut,
  type CityPark,
  type CityParking,
  type CityResolveContext,
  type CityRules,
  type CityStreet,
  type CityTree,
  type ResolvedCity,
} from "./world/cityKind";
export { snapToNearest, socketWorldPosition, socketsCompatible, worldSockets } from "./world/connectors";
export { createEnvironmentField, type EnvironmentField, type HeatSource } from "./world/envField";
export { resolveStructureBuildings, summarizeEnvironment } from "./world/environmentSummary";
export {
  createFastTravelNetwork,
  type FastTravelNetwork,
  type FastTravelOptions,
  type FastTravelSnapshot,
  type TravelPointDef,
  type TravelPointView,
} from "./world/fastTravel";
export {
  biomes,
  building,
  environment,
  flat,
  grass,
  ocean,
  pad,
  plots,
  rain,
  road,
  sky,
  snow,
  terrain,
  tilemap,
  voxel,
  type BiomeBand,
  type BuildingEnvironmentDescriptor,
  type EnvironmentWorldFeature,
  type GrassEnvironmentDescriptor,
  type OceanEnvironmentDescriptor,
  type PadEnvironmentDescriptor,
  type PadSize,
  type RainEnvironmentDescriptor,
  type RoadEnvironmentDescriptor,
  type SkyEnvironmentDescriptor,
  type SnowEnvironmentDescriptor,
  type TerrainCircleRegion,
  type TerrainDetailConfig,
  type TerrainDetailMaterialConfig,
  type TerrainEnvironmentDescriptor,
  type TerrainFlattenMask,
  type TerrainMaterialRegion,
  type TerrainPolylineRegion,
  type TerrainRectRegion,
  type TerrainRegionStyle,
  type WeatherEnvironmentDescriptor,
  type WorldFeature,
  type WorldGridCell,
  type WorldGridConfig,
} from "./world/features";
export { createFogField, type FogCells, type FogField } from "./world/fog";
export { boundaryNeighbors, createFootprintGrid, footprintObstacles, hasValidAdjacency } from "./world/footprintGrid";
export { type Aabb, type AvoidZone } from "./world/geometry";
export { GRASS_SCHEMA } from "./world/grassKind";
export { resolveGridInstances } from "./world/gridInstances";
export { createLodScheduler } from "./world/lod";
export {
  createAnnotationLayer,
  type AnnotationLayer,
  type AnnotationLayerOptions,
  type AnnotationSnapshot,
  type MapNote,
  type MapShapeAnnotation,
  type MapStroke,
} from "./world/mapAnnotations";
export { mapLayerColor, type MapCellStates, type MapRoute, type MapZone } from "./world/mapLayers";
export {
  DEFAULT_MARKER_KINDS,
  createMarkerSet,
  createMarkerSource,
  markerKindStyle,
  type MapMarker,
  type MarkerCollection,
  type MarkerKindStyle,
  type MarkerSet,
  type MarkerSource,
  type MarkerSourceOptions,
  type MarkerView,
} from "./world/markers";
export {
  bearingToCardinal,
  clampToMinimapEdge,
  compassBearing,
  headingToBearing,
  projectToMinimap,
  relativeBearing,
  unprojectFromMinimap,
  type Cardinal,
  type MinimapView,
  type WorldXZ,
} from "./world/minimap";
export {
  DEFAULT_MINIMAP_PALETTE,
  bakeMinimapBackground,
  bakeMinimapImage,
  encodeBakePng,
  minimapBakeToPngDataUri,
  type MinimapBake,
  type MinimapBakeBounds,
  type MinimapBakeOptions,
  type MinimapBakePalette,
  type MinimapBakeSource,
  type MinimapBakeZone,
} from "./world/minimapBake";
export { placeAlongPath } from "./world/pathInstances";
export {
  withPathProfiles,
  type PathHeightPolicy,
  type PathRetaining,
  type TerrainPathProfile,
} from "./world/pathTerrain";
export {
  isPlaceWorld,
  resolveWorldPhysics,
  seedForPlace,
  world,
  type BoardGround,
  type BoardGroundSize,
  type FlatGround,
  type FlatGroundSize,
  type GroundConfig,
  type GroundGenerator,
  type GroundMode,
  type PlaceConfig,
  type PlaceWorldFeature,
  type ResolvedGround,
  type RoundGround,
  type RoundGroundSize,
  type SurfaceLaws,
  type VoxelGround,
  type VoxelGroundSize,
} from "./world/place";
export {
  placeAssetFromCommit,
  resolvePlaceAsset,
  toEditorMarker,
  toStructureInput,
  type PlaceAssetResult,
} from "./world/placeAsset";
export { createPlacedStructureStore, type PlacedStructure } from "./world/placedStructureStore";
export { validatePlacement, type PlacementRules } from "./world/placement";
export {
  createPlacementController,
  quarterTurnsToRotationY,
  type PlacementCommit,
  type PlacementController,
  type PlacementPreview,
  type SnapMode,
} from "./world/placementController";
export { POLE_LINE_SCHEMA, resolvePoleLine, type ResolvedPoleLine } from "./world/poleLineKind";
export { composeRealm } from "./world/realm";
export { createRegionField, isRegionField, type RegionField } from "./world/regions";
export {
  GROUND_DECAL_LAYERS,
  buildJunctionSurface,
  buildRoadRibbon,
  buildTrimmedIntersections,
  dashSegments,
  trimBandAtJunctions,
  trimPathAtJunctions,
  type BandTrimOptions,
  type IntersectionStreet,
  type JunctionApproach,
  type JunctionGeometryOptions,
  type RoadCut,
  type RoadJunctionInput,
  type TrimmedIntersections,
  type TrimmedRoad,
} from "./world/roads";
export { scatter, type ScatterPoint } from "./world/scatter";
export {
  CITY_BUILDING_BUDGET,
  SCATTER_COVERAGE_SPECS,
  SCATTER_INSTANCE_BUDGET,
  budgetWarning,
  densityCoverage,
  describeScatterCoverage,
  placedCoverage,
  scatterCoverageSpec,
  scatterFootprintArea,
  type ScatterCoverage,
  type ScatterCoverageKind,
  type ScatterCoverageSpec,
} from "./world/scatterCoverage";
export { pickWeighted, scatterItems, type ScatterInstance } from "./world/scatterItems";
export {
  SCATTER_PATH_KIND,
  clearanceZonesFrom,
  distanceToPolygonEdge,
  isScatterPath,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  readScatterPalette,
  readScatterRules,
  resolveScatter,
  resolveScatterRegion,
  scatterRegionEstimate,
  scatterRegionFromPath,
  type ScatterTerrain,
} from "./world/scatterRegion";
export {
  ANNOTATION_FEED_ACTION,
  createSharedAnnotations,
  type AnnotationBroadcast,
  type AnnotationFeedSink,
  type SharedAnnotations,
  type SharedAnnotationsDeps,
} from "./world/sharedAnnotations";
export { SOIL_KIND, SOIL_SCHEMA, type SoilRules } from "./world/soilKind";
export {
  annulusRegion,
  boxRegion,
  customRegion,
  discRegion,
  pointSetRegion,
  polygonRegion,
  rectRegion,
  sampleBatch,
  samplePoint,
  sampleStratified,
  shellRegion,
  sphereRegion,
  weightedRegion,
  type AreaDistribution,
  type FallbackPolicy,
  type Point3,
  type RadialDistribution,
  type SampleBatchOptions,
  type SampleBatchResult,
  type SampleConstraints,
  type SamplePoint,
  type SamplePointOptions,
  type SampleReason,
  type SampleRegion,
  type SampleResult,
  type StratifiedOptions,
  type VolumeDistribution,
  type WeightedRegionEntry,
} from "./world/spatialSample";
export {
  distanceToRoadEdge,
  furnitureSpots,
  laneCenters,
  offsetPath,
  parkingSpots,
  roadSurfaceSampler,
  sidewalkPoint,
  sidewalkWidthOf,
  type RoadSurfaceOptions,
} from "./world/streets";
export { solveSupport, toDebrisBodies, type SupportResult } from "./world/support";
export {
  applyDeltaToSnapshot,
  applySurfaceDeltaToSnapshot,
  beginSurfaceStroke,
  beginTerraformStroke,
  createEditableTerrain,
  createTerraformBrush,
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
  migrateTerrainSnapshot,
  revertDeltaFromSnapshot,
  revertSurfaceDeltaFromSnapshot,
  type EditableTerrain,
  type SurfaceDelta,
  type SurfaceStroke,
  type TerraformDelta,
  type TerraformEdit,
  type TerraformFalloff,
  type TerraformMode,
  type TerraformShape,
  type TerraformSnapshot,
  type TerraformStroke,
  type TerrainMaterialLayer,
  type TerrainSurfaceRule,
} from "./world/terraform";
export {
  TERRAIN_MATERIAL_PALETTES,
  applyPathProfiles,
  type NoiseFieldConfig,
  type ResolvedTerrainDetail,
  type TerrainField,
  type TerrainPalette,
} from "./world/terrain";
export {
  chooseContourInterval,
  drapePolyline,
  extractContours,
  sampleElevation,
  summarizeElevation,
  surfaceGridLines,
  surfaceRing,
  terrainContourGuides,
  type ContourLine,
  type ContourOptions,
  type DrapeOptions,
  type ElevationReadout,
  type ElevationSummary,
  type GroundPoint,
  type GuideRegion,
  type HeightSampler,
  type SurfaceGridLine,
  type SurfaceGridOptions,
} from "./world/terrainGuides";
export { VEGETATION_VOLUME_KIND } from "./world/vegetation";
export {
  VISIBILITY_HIDDEN,
  VISIBILITY_OBSERVED,
  VISIBILITY_REMEMBERED,
  createVisibilityField,
  type VisibilityCells,
  type VisibilityDelta,
  type VisibilityField,
  type VisibilityFieldConfig,
  type VisibilityFieldState,
  type VisibilityGroupState,
  type VisibilityMemory,
  type VisibilityState,
} from "./world/visibilityField";
export { type VolumetricCloudsConfig, type VolumetricCloudsRules } from "./world/volumetricClouds";
export { createVoxelField, type VoxelFace } from "./world/voxelField";
export { type EnclosedFootprint, type RoofPlan } from "./world/walls";
export { waterSurface, waterSurfaceFromDescriptor, type WaterSurface } from "./world/water";
export { WATER_SCHEMA, type WaterRules } from "./world/waterKind";
export {
  createWaypointStore,
  type WaypointEntry,
  type WaypointGuidance,
  type WaypointSnapshot,
  type WaypointStore,
  type WaypointStoreDeps,
} from "./world/waypoints";
export {
  createFireGrid,
  resolveWeather,
  type FireGrid,
  type ResolvedWeather,
  type WeatherModifierTable,
  type WeatherState,
} from "./world/weather";
export { windField, type WindField } from "./world/wind";
