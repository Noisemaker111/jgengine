export { type HeatConfig, type HeatGain, type HeatLevelDef, type HeatPoint, type HeatState } from "./ai/heatSystem";
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
export { type JobDef, type JobReport, type StationJob } from "./ai/jobBoard";
export {
  DEFAULT_POLICE_TIERS,
  DEFAULT_POLICE_TUNING,
  createPoliceResponse,
  policeRoadsFromLaneGraph,
  type PoliceLaneHit,
  type PoliceResponse,
  type PoliceResponseConfig,
  type PoliceResponseKind,
  type PoliceResponseState,
  type PoliceRoadblockSite,
  type PoliceRoads,
  type PoliceRoadsOptions,
  type PoliceSearchArea,
  type PoliceSighting,
  type PoliceStats,
  type PoliceStep,
  type PoliceTickContext,
  type PoliceTier,
  type PoliceTuning,
  type PoliceWitness,
} from "./ai/policeResponse";
export {
  createRvoCrowd,
  type RvoAgentSpec,
  type RvoAgentView,
  type RvoCrowd,
  type RvoCrowdOptions,
  type RvoSnapshot,
  type RvoTunables,
} from "./ai/rvo";
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
  createUtilityBrain,
  sampleResponseCurve,
  type ResponseCurve,
  type UtilityBrain,
  type UtilityBrainConfig,
  type UtilityBrainSnapshot,
  type UtilityCandidate,
  type UtilityDebugSnapshot,
  type UtilityDecision,
  type UtilityInterrupt,
  type UtilityOption,
  type UtilityScore,
  type UtilitySwitchReason,
  type UtilityTerm,
  type UtilityTunables,
} from "./ai/utilityBrain";
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
export { buildingIndex, type BuildingIndex } from "./buildings/buildingIndex";
export { type BuildingPaletteOverrides, type BuildingStyle } from "./buildings/buildings";
export {
  createCameraShake,
  type CameraShakeConfig,
  type CameraShakeController,
  type CameraShakeOffset,
  type CameraShakeSnapshot,
} from "./camera/shake/cameraShake";
export { type CityBlockKind } from "./city/cityBlocks";
export {
  CITY_LANDMARK_CLASSES,
  CITY_LOT_CLASSES,
  CITY_TREE_SPECIES,
  type CityLandmarkClass,
  type CityLotClass,
  type CityLotPiece,
  type CityPieceRole,
  type CityPieceShape,
  type CityTreeSpecies,
  type CityZoneBand,
  type CityZoneProfile,
} from "./city/cityContent";
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
} from "./city/cityKind";
export {
  createDamageDirectionTracker,
  type DamageDirectionOptions,
  type DamageDirectionSnapshot,
  type DamageDirectionTracker,
  type DamageIndicator,
  type HitInput,
} from "./combat/damage/damageDirection";
export {
  createSequenceDirector,
  type CueListener,
  type EmittedCue,
  type SequenceCue,
  type SequenceDirector,
  type SequenceDirectorOptions,
  type SequenceSnapshot,
  type SequenceState,
} from "./cutscene/sequenceDirector";
export { createFactionGraph, createFactionRoster, type FactionDef } from "./faction/factions";
export {
  DEFAULT_REPUTATION_TIERS,
  createReputationLedger,
  effectiveRelation,
  tierForStanding,
} from "./faction/reputation";
export {
  aircraftAttitudeQuaternion,
  aircraftHeadingQuaternion,
  createRigidAircraft,
  type AircraftAssistTuning,
  type RigidAircraft,
  type RigidAircraftInput,
  type RigidAircraftModifiers,
  type RigidAircraftOptions,
  type RigidAircraftStep,
  type RigidAircraftTuning,
} from "./flight/aircraftDynamics";
export {
  CREATIVE_FLIGHT_TUNING,
  HOVER_FLIGHT_TUNING,
  NOCLIP_FLIGHT_TUNING,
  SPECTATOR_FLIGHT_TUNING,
  advanceFreeFlight,
  createFreeFlightController,
  createFreeFlightState,
  resolveFlightStep,
  resolveFreeFlightIntent,
  resolveFreeFlightIntentFromInput,
  type FreeFlightBindings,
  type FreeFlightController,
  type FreeFlightIntent,
  type FreeFlightMode,
  type FreeFlightState,
  type FreeFlightStep,
  type FreeFlightTuning,
} from "./flight/freeFlight";
export {
  bakeGeneratorVariants,
  defineGenerator,
  generatorVariants,
  getGenerator,
  listGenerators,
  registerGenerator,
  runGenerator,
  untypedGenerator,
  type BakedGeneratorVariant,
  type GeneratorContext,
  type GeneratorDefinition,
  type GeneratorVariant,
  type GeneratorVariantOptions,
} from "./generator/generator";
export {
  defineParamSchema,
  findSchemaPreset,
  jitterParams,
  parseParams,
  sampleCurve,
  sampleGradient,
  type CurvePoint,
  type GradientStop,
  type ParamField,
  type ParamGroup,
  type ParamPreset,
  type ParamSchema,
  type ParamsOf,
  type ParsedParams,
  type WeightedParamEntry,
} from "./generator/paramSchema";
export {
  GRASS_FIELD_OUTPUT,
  GRASS_GENERATOR,
  GRASS_PRESETS,
  GRASS_SCHEMA,
  type GrassFieldBake,
  type GrassLook,
} from "./grass/grassKind";
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
  createPromptRegistry,
  type PositionedPromptPatch,
  type PromptRegistry,
  type PromptRegistrySnapshot,
} from "./interaction/promptRegistry";
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
export { createLodScheduler, lodBandIndex } from "./lod/lod";
export {
  DEFAULT_VARIANT_HYSTERESIS,
  createModelVariantSelector,
  type ModelVariantConfig,
  type ModelVariantLodConfig,
  type ModelVariantSelector,
  type ModelVariantSelectorState,
} from "./lod/modelLod";
export {
  createFastTravelNetwork,
  type FastTravelNetwork,
  type FastTravelOptions,
  type FastTravelSnapshot,
  type TravelPointDef,
  type TravelPointView,
} from "./map/fastTravel";
export { createFogField, type FogCells, type FogField } from "./map/fog";
export {
  createAnnotationLayer,
  type AnnotationLayer,
  type AnnotationLayerOptions,
  type AnnotationSnapshot,
  type MapNote,
  type MapShapeAnnotation,
  type MapStroke,
} from "./map/mapAnnotations";
export { mapLayerColor, type MapCellStates, type MapRoute, type MapZone } from "./map/mapLayers";
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
} from "./map/markers";
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
} from "./map/minimap";
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
} from "./map/minimapBake";
export {
  ANNOTATION_FEED_ACTION,
  createSharedAnnotations,
  type AnnotationBroadcast,
  type AnnotationFeedSink,
  type SharedAnnotations,
  type SharedAnnotationsDeps,
} from "./map/sharedAnnotations";
export {
  createWaypointStore,
  waypointAnchor,
  type WaypointEntry,
  type WaypointGuidance,
  type WaypointSnapshot,
  type WaypointStore,
  type WaypointStoreDeps,
} from "./map/waypoints";
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
export {
  BUSH_GENERATOR,
  BUSH_SCHEMA,
  DRIFTWOOD_GENERATOR,
  DRIFTWOOD_SCHEMA,
  FERN_GENERATOR,
  FERN_SCHEMA,
  NATURE_GENERATORS,
  NATURE_OUTPUT,
  PALM_GENERATOR,
  PALM_SCHEMA,
  ROCK_GENERATOR,
  ROCK_SCHEMA,
} from "./nature/natureGenerators";
export {
  addBlob,
  addCone,
  addFrond,
  addStone,
  addTube,
  isNatureMesh,
  type BlobOptions,
  type ConeOptions,
  type FrondOptions,
  type NatureMesh,
  type NatureRgb,
  type NatureVec,
  type StoneOptions,
  type TubeOptions,
} from "./nature/natureMesh";
export {
  createLaneGraph,
  laneGraphFromDocument,
  type LaneEdgeConfig,
  type LaneGraph,
  type LaneGraphConfig,
  type LaneGraphDocumentOptions,
  type LaneIntersection,
  type LaneIntersectionConfig,
  type LaneNode,
  type LanePose,
  type LaneRightOfWay,
  type LaneSignalProgram,
  type LaneSpan,
  type LaneSpot,
} from "./nav/laneGraph";
export { constrainToNavGrid } from "./nav/navConstrain";
export {
  createNavCrowd,
  type NavCrowd,
  type NavCrowdAgentSpec,
  type NavCrowdAgentView,
  type NavCrowdOptions,
  type NavCrowdRevalidate,
  type NavCrowdSnapshot,
  type NavCrowdStats,
} from "./nav/navCrowd";
export { populateNavGridFromEnvironment } from "./nav/navFromEnvironment";
export { createNavGrid, findPath, slopeStepCost, type NavGrid, type NavPoint } from "./nav/navGrid";
export {
  buildNavAdjacency,
  createNavMeshQuery,
  raycastNav,
  type NavMeshAdjacency,
  type NavMeshData,
  type NavMeshLink,
  type NavMeshPath,
  type NavMeshQuery,
  type NavMeshQueryOptions,
  type NavMeshQuerySnapshot,
} from "./nav/navMesh";
export {
  createNavRuntime,
  navMeshFromBake,
  type AuthoredNavLink,
  type NavLinkKind,
  type NavRebuildStats,
  type NavRegion,
  type NavRuntime,
  type NavRuntimeOptions,
  type NavRuntimeSnapshot,
  type SceneBake,
} from "./nav/navRuntime";
export {
  advancePathFollow,
  createPathFollow,
  followPathLength,
  pathFollowProgress,
  pathFollowSeek,
  pathFromNav,
  type PathFollowConfig,
  type PathFollowProgress,
  type PathFollowState,
  type PathProgress,
  type Waypoint,
} from "./nav/pathFollow";
export {
  createTraffic,
  type Traffic,
  type TrafficCarView,
  type TrafficOptions,
  type TrafficRoutePolicy,
  type TrafficSignalState,
  type TrafficSnapshot,
  type TrafficStats,
  type TrafficTuning,
} from "./nav/traffic";
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
export { ForceVolume, PlatformCarry } from "./physics/forceVolume";
export {
  combineGravity,
  pointGravity,
  uniformGravity,
  type GravityField,
  type GravityVector,
  type PointGravityOptions,
} from "./physics/gravityField";
export { DEFAULT_GRIP_CURVE, gripCurvePeak, sampleGripCurve, type GripCurve } from "./physics/gripCurve";
export {
  PhysicsWorld,
  SHAPE_BOX,
  SHAPE_SPHERE,
  type AddBodyOptions,
  type CollisionEvent,
  type PhysicsStats,
} from "./physics/physicsWorld";
export { createRagdoll } from "./physics/ragdoll";
export { StructureGraph, type CollapseEvent, type StructureMaterial } from "./physics/structure";
export { createTireMarks, type TireMark, type TireMarks, type TireMarksState } from "./physics/tireMarks";
export {
  createVehicleDamage,
  damagedAxis,
  damagedSpec,
  type VehicleDamage,
  type VehicleDamageConfig,
  type VehicleDamageEffect,
  type VehicleDamageEffectResolved,
  type VehicleDamageState,
  type VehicleDamageTransition,
  type VehicleDamageZone,
  type VehicleDamageZoneState,
  type VehicleDeformation,
} from "./physics/vehicleDamage";
export {
  createVehicleDynamics,
  type VehicleDynamics,
  type VehicleDynamicsModifiers,
  type VehicleDynamicsOptions,
  type VehicleDynamicsStep,
  type VehicleDynamicsTuning,
} from "./physics/vehicleDynamics";
export {
  createVehicleObstacleClamp,
  type VehicleImpact,
  type VehicleMoveClamp,
  type VehicleObstacleClamp,
} from "./physics/vehicleObstacles";
export {
  applyVehicleParts,
  feelOf,
  withPart,
  type VehicleFeel,
  type VehiclePart,
  type VehiclePartEffect,
  type VehicleSetup,
  type VehicleStat,
} from "./physics/vehicleParts";
export { VEHICLE_STYLES, vehicleTuning, type VehicleSpec, type VehicleSpecGearbox } from "./physics/vehicleSpec";
export { createContributionPool, createPlotPermissions, type BuildRole } from "./placement/buildPermissions";
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
} from "./placement/place";
export {
  placeAssetFromCommit,
  resolvePlaceAsset,
  toEditorMarker,
  toStructureInput,
  type PlaceAssetResult,
} from "./placement/placeAsset";
export { createPlacedStructureStore, type PlacedStructure } from "./placement/placedStructureStore";
export { validatePlacement, type PlacementRules } from "./placement/placement";
export {
  createPlacementController,
  quarterTurnsToRotationY,
  type PlacementCommit,
  type PlacementController,
  type PlacementPreview,
  type SnapMode,
} from "./placement/placementController";
export { type RecordingBuffer, type RecordingBufferOptions } from "./replay/recordingBuffer";
export {
  GROUND_DECAL_LAYERS,
  buildJunctionSurface,
  buildRoadRibbon,
  buildTrimmedIntersections,
  dashSegments,
  offsetPath,
  trimPathAtJunctions,
  type IntersectionStreet,
  type JunctionApproach,
  type JunctionGeometryOptions,
  type RoadCut,
  type RoadJunctionInput,
  type TrimmedIntersections,
  type TrimmedRoad,
} from "./roads/roads";
export {
  distanceToRoadEdge,
  furnitureSpots,
  parkingSpots,
  roadSurfaceSampler,
  sidewalkPoint,
  sidewalkWidthOf,
  type RoadSurfaceOptions,
} from "./roads/streets";
export {
  type ObjectSlotRejection,
  type ObjectSlotResult,
  type ObjectSlotTransfer,
  type SceneObjectSlots,
} from "./runtime/context/objectSlots";
export { scatter, type ScatterPoint } from "./scatter/scatter";
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
} from "./scatter/scatterCoverage";
export {
  isScatterGeneratorItem,
  scatterGeneratorBase,
  scatterGeneratorVariantCount,
  type ScatterGeneratorItem,
} from "./scatter/scatterGenerator";
export {
  SCATTER_PATH_KIND,
  clearanceZonesFrom,
  isScatterPath,
  readScatterPalette,
  readScatterRules,
  resolveScatter,
  resolveScatterRegion,
  scatterRegionEstimate,
  scatterRegionFromPath,
  type ScatterInstance,
  type ScatterTerrain,
} from "./scatter/scatterRegion";
export { createAssetCatalog, type AssetCatalog, type ModelAssetRef, type ModelDims } from "./scene/assetCatalog";
export {
  PARTS_OUTPUT,
  partsBounds,
  placedGeneratorFor,
  registerPlaceableGeneratorOutput,
  type GeneratedAsset,
  type GeneratedPart,
} from "./scene/assetGenerator";
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
export {
  AUTO_TARGET_POLICIES,
  nextAutoTargetPolicy,
  selectAutoTarget,
  type AutoTargetPolicy,
} from "./scene/autoTarget";
export {
  advanceBehaviors,
  behaviorControl,
  registerBehaviorActions,
  type BehaviorAction,
  type BehaviorActionContext,
  type BehaviorActionOptions,
  type BehaviorControl,
  type BehaviorInspection,
  type BehaviorResumePolicy,
  type BehaviorSnapshot,
  type BehaviorStatus,
  type PursueBehaviorSnapshot,
} from "./scene/behaviorRuntime";
export {
  patrol,
  player,
  pursue,
  talkable,
  wander,
  type BehaviorDescriptor,
  type DecisionGraphBehavior,
  type PursueBehavior,
} from "./scene/behaviors";
export { createBodyBind } from "./scene/bodyBind";
export { type ColliderPurpose, type EntityColliderSet, type ResolvedCollider } from "./scene/colliders";
export { type StatCatalog, type StatValue } from "./scene/entityStats";
export {
  entityMetaOf,
  groundSpeed,
  type EntityPosition,
  type EntityStore,
  type SceneEntity,
} from "./scene/entityStore";
export { DEFAULT_FORWARD } from "./scene/facing";
export { readNamedSockets, type ModelNode } from "./scene/modelSockets";
export { MountController, createMountController } from "./scene/mount";
export { objectVisualScale, type ObjectVisual, type SceneObject } from "./scene/objectStore";
export { type PaintStroke } from "./scene/paintLayer";
export { type RosterEntry } from "./scene/roster";
export { registerSceneKind, type SceneKindObject, type SceneKindResolveContext } from "./scene/sceneKinds";
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
export { type Aim } from "./scene/spatial";
export { createStationClaim, type Station } from "./scene/stationClaim";
export {
  VehicleSeats,
  boardVehicle,
  createVehicleSeats,
  leaveVehicle,
  type BoardVehicleOptions,
  type LeaveVehicleOptions,
} from "./scene/vehicleSeat";
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
export {
  createPerception,
  type PerceptionCandidate,
  type PerceptionConfig,
  type PerceptionMemory,
  type PerceptionObserver,
  type PerceptionPosition,
  type PerceptionService,
  type PerceptionSnapshot,
  type PerceptionStats,
  type PerceptionStimulus,
  type PerceptionStimulusKind,
} from "./sensor/perception";
export { type RevealHit, type RevealQuery } from "./sensor/revealQuery";
export { sightLineBlocked, type SightPoint, type SightSolids } from "./sensor/sightLine";
export {
  createDayNightCycle,
  type DayNightCycle,
  type DayNightCycleOptions,
  type DayNightKeyframe,
  type DayNightSample,
  type DayNightSnapshot,
} from "./sky/dayNightCycle";
export { type VolumetricCloudsConfig, type VolumetricCloudsRules } from "./sky/volumetricClouds";
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
  createParticleSystem,
  type EmitterConfig,
  type ParticleBuffers,
  type ParticleCurve,
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
export { type BoundsSpec } from "./visibility/bounds";
export { type CameraVisibilityContext } from "./visibility/camera";
export { type VisibilityConfig } from "./visibility/config";
export { distance } from "./visibility/distance";
export { type CameraView, type Frustum } from "./visibility/frustum";
export { createVisibilitySystem, type Renderable, type VisibilitySystem } from "./visibility/visibilitySystem";
export { WATER_SCHEMA, type WaterRules } from "./water/waterKind";
export {
  waterSurface,
  waterSurfaceConfigFromDescriptor,
  waterSurfaceFromDescriptor,
  type WaterSurface,
} from "./water/waterSurface";
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
} from "./waves/spawnDirector";
export {
  createWaveRunner,
  type WaveRunner,
  type WaveRunnerConfig,
  type WaveSpawnSink,
  type WaveView,
} from "./waves/waveRunner";
export {
  createFireGrid,
  resolveWeather,
  type FireGrid,
  type ResolvedWeather,
  type WeatherModifierTable,
  type WeatherState,
} from "./weather/weather";
export {
  markerCatalogId,
  placeAuthoredObjects,
  placeAuthoredObjectsFromDocument,
  resolveAuthoredObjects,
} from "./world/authoredObjects";
export { CarvableField, VoxelVolume, carvableTerrain, type VoxelMaterial } from "./world/carve";
export { catenaryCurve, sagCurve } from "./world/catenary";
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
export {
  boundaryNeighbors,
  canMerge,
  createFootprintGrid,
  footprintObstacles,
  hasValidAdjacency,
  mergeFootprints,
  splitRegion,
  type FootprintRegion,
  type MergedRegion,
  type RegionContribution,
  type RegionFootprint,
  type RegionSplitIds,
  type RegionWorkBudget,
} from "./world/footprintGrid";
export { type Aabb, type AvoidZone, type Vec3 } from "./world/geometry";
export { resolveGridInstances } from "./world/gridInstances";
export { grounded } from "./world/grounded";
export { POLE_LINE_SCHEMA, resolvePoleLine, type ResolvedPoleLine } from "./world/poleLineKind";
export { pointInPolygon, polygonArea } from "./world/polygon";
export { composeRealm } from "./world/realm";
export { createRegionField, isRegionField, type RegionField } from "./world/regions";
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
export { solveSupport, toDebrisBodies, type SupportResult } from "./world/support";
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
export { createVoxelField, type VoxelFace } from "./world/voxelField";
export { type EnclosedFootprint, type RoofPlan } from "./world/walls";
export { windField, type WindField } from "./world/wind";
