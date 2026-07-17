export { type HeatConfig, type HeatGain, type HeatLevelDef, type HeatState } from "./ai/heatSystem";
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
export { createGlideModel } from "./movement/glideModel";
export { createGrappleSwing } from "./movement/grappleSwing";
export { createLeaderTrail } from "./movement/leaderTrail";
export { MOVEMENT_TUNING } from "./movement/movementModel";
export { resolvePlayerMovementTuning, stepPlayerMovement } from "./movement/playerMovement";
export { POSE_HITBOX, createPoseState, type MovementPose } from "./movement/poseState";
export { steerYaw } from "./movement/steering";
export { constrainToNavGrid } from "./nav/navConstrain";
export { populateNavGridFromEnvironment } from "./nav/navFromEnvironment";
export { createNavGrid, findPath, slopeStepCost, type NavGrid, type NavPoint } from "./nav/navGrid";
export {
  advancePathFollow,
  createPathFollow,
  pathFromNav,
  type PathFollowConfig,
  type PathFollowState,
  type Waypoint,
} from "./nav/pathFollow";
export { createBallisticSweep, type BallisticSweep, type BallisticSweepHit } from "./physics/ballisticSweep";
export { createBuoyantBody } from "./physics/buoyancy";
export { Carryable, carrySpeedMultiplier } from "./physics/carryable";
export { createDamageModel } from "./physics/damageZones";
export { tickDrivableVehicle } from "./physics/drivableVehicle";
export { ForceVolume, PlatformCarry } from "./physics/forceVolume";
export {
  createKinematicVehicle,
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
export { createAssetCatalog, type AssetCatalog, type ModelAssetRef, type ModelDims } from "./scene/assetCatalog";
export { partsBounds, registerAssetGenerator, type GeneratedAsset, type GeneratedPart } from "./scene/assetGenerator";
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
export { advanceBehaviors } from "./scene/behaviorRuntime";
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
  parseParams,
  registerSceneKind,
  type ParamField,
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
export { getCurrentGameTimestamp, sanitizeGameTimeScale } from "./time/gameClock";
export { type ClockSnapshot, type SimClock } from "./time/simClock";
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
export { snapToNearest, socketWorldPosition, socketsCompatible, worldSockets } from "./world/connectors";
export { createEnvironmentField, type EnvironmentField, type HeatSource } from "./world/envField";
export { resolveStructureBuildings, summarizeEnvironment } from "./world/environmentSummary";
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
export { mapLayerColor, type MapCellStates, type MapRoute, type MapZone } from "./world/mapLayers";
export {
  DEFAULT_MARKER_KINDS,
  createMarkerSet,
  markerKindStyle,
  type MapMarker,
  type MarkerKindStyle,
  type MarkerSet,
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
export { placeAlongPath } from "./world/pathInstances";
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
export { composeRealm } from "./world/realm";
export { createRegionField, isRegionField, type RegionField } from "./world/regions";
export { buildRoadRibbon, dashSegments } from "./world/roads";
export { scatter, type ScatterPoint } from "./world/scatter";
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
export { SOIL_KIND, SOIL_SCHEMA, type SoilRules } from "./world/soilKind";
export {
  furnitureSpots,
  laneCenters,
  offsetPath,
  parkingSpots,
  sidewalkPoint,
  sidewalkWidthOf,
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
  type NoiseFieldConfig,
  type ResolvedTerrainDetail,
  type TerrainField,
  type TerrainPalette,
} from "./world/terrain";
export { VEGETATION_VOLUME_KIND } from "./world/vegetation";
export { type VolumetricCloudsConfig, type VolumetricCloudsRules } from "./world/volumetricClouds";
export { createVoxelField, type VoxelFace } from "./world/voxelField";
export { type EnclosedFootprint, type RoofPlan } from "./world/walls";
export { waterSurface, waterSurfaceFromDescriptor, type WaterSurface } from "./world/water";
export { WATER_SCHEMA, type WaterRules } from "./world/waterKind";
export {
  createFireGrid,
  resolveWeather,
  type FireGrid,
  type ResolvedWeather,
  type WeatherModifierTable,
  type WeatherState,
} from "./world/weather";
export { windField, type WindField } from "./world/wind";
