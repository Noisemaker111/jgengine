react-three-fiber and drei. The 3D layer runs on plain three.js under an engine-owned frame loop (createEngineLoop, EngineCanvas, useEngineDraw); bun run check r3f-free keeps them out

Engine seam: packages/core/src/ai/AuthoredFlocks.draw.tsx, packages/core/src/ambientFauna/AmbientFauna.draw.tsx, packages/core/src/anim/CharacterCrowd.draw.tsx, packages/core/src/anim/CorpseRagdolls.draw.tsx, packages/core/src/anim/PartMotion.draw.tsx, packages/core/src/anim/SkinnedInstances.draw.tsx, packages/core/src/anim/characterGlance.draw.ts, packages/core/src/anim/characterMotion.draw.ts and 172 more

### Added

- `GlanceDriver` (`@jgengine/core/anim/characterGlance.draw`): The default head glance without React: resolves the rig once, then {@link pose} turns the head toward the local player each frame. Also `GlanceDriverOptions`.
- `drawCharacterMotion` (`@jgengine/core/anim/characterMotion.draw`): The resolved parts of the default character motion for draw code. Also `noteGameCharacterMotion`.
- `CorpseRagdolls` (`@jgengine/core/anim/CorpseRagdolls.draw`): ⚠ undocumented Also `CorpseRagdollsDrawProps`.
- `ModelAnimationDriver` (`@jgengine/core/anim/modelAnimationDriver.draw`): The engine's model animation driver without React: the same mixer `useModelAnimation` runs — `"auto"` derivation, speed-driven crossfades, one-shots from game events, held poses, death clamp, graph playback with root motion, and character-LOD pose pacing. Also `GraphPose`, `ModelAnimationDiagnostic`, `ModelAnimationDriverOptions`, `ModelMotionStep`, `createGraphPose`, `diagnoseModelAnimation`, `readModelAnimationParams`.
- `skinnedInstancesDraw` (`@jgengine/core/anim/SkinnedInstances.draw`): Draw-side form of {@link SkinnedInstances}: loads the rig through the shared per-url GLTF cache, bakes its clips to the bone texture once per (url, clips, once, fps) signature, and rebuilds the instanced mesh when capacity changes or rewrites its buffers when the instance list does — the same boundaries the old memos and layout effect had.
- `FootIkDriver` (`@jgengine/core/anim/useFootIk.draw`): Foot IK without React: resolves the rig once, then {@link pose} applies one frame of correction after the animation mixer. Also `FootIkDriverOptions`.
- `buildingKitBatchDraw` (`@jgengine/core/buildings/BuildingKitBatch.draw`): The draw-side form of {@link BuildingKitBatch}: loads the GLB once through the shared per-url cache, harvests instanceable sources, and mounts chunk draws per style group.
- `buildingChunkBudgetScratch` (`@jgengine/core/buildings/BuildingRenderBudget.draw`): ⚠ undocumented
- `instancedBuildingsDraw` (`@jgengine/core/buildings/GeneratedBuilding.draw`): The draw-side form of {@link InstancedBuildings}: buckets the placements once per prop-identity change, then mounts one draw per box family and per kit model URL.
- `interiorDressingDraw` (`@jgengine/core/buildings/InteriorDressing.draw`): The drawn side of a planned interior as one draw: trims, pipes, fittings and lamp housings as static instance batches, every cable as one merged tube, and every stain style as one instanced decal mesh. Also `practicalLightsDraw`.
- `ActiveCameraControls` (`@jgengine/core/camera/activeCameraControls.draw`): What a tool may do to the camera controls that own a scene's view: retarget them and switch them off for a drag.
- `chaseRigDraw` (`@jgengine/core/camera/cameraRigs.draw`): Vehicle chase rig that trails behind the followed entity's heading. Also `CameraRigEnv`, `cinematicRigDraw`, `lockOnRigDraw`, `observerRigDraw`, `rtsRigDraw`, `shoulderRigDraw`, `sideScrollRigDraw`, `topDownRigDraw`.
- `firstPersonBodyInstance` (`@jgengine/core/camera/firstPersonBody.draw`): The entity whose body the first-person camera sits in, for draw code. Also `noteFirstPersonBody`.
- `GameFirstPersonCameraDrawProps` (`@jgengine/core/camera/GameFirstPersonCamera.draw`): Everything the first-person draw reads, resolved by the React wrapper.
- `GameOrbitCameraDrawProps` (`@jgengine/core/camera/GameOrbitCamera.draw`): Everything the orbit draw reads each frame, resolved by the React wrapper.
- `SplitScreenRendererProps` (`@jgengine/core/camera/Viewports.draw`): ⚠ undocumented
- `ImpactFeedbackDrawProps` (`@jgengine/core/combat/ImpactFeedback.draw`): Props the impact draw reads; resolved by the React wrapper each commit.
- `HitMarkersDrawProps` (`@jgengine/core/combat/ShotFeedback.draw`): ⚠ undocumented Also `MuzzleFlashesDrawProps`.
- `dataObjectsDraw` (`@jgengine/core/data/DataObjects.draw`): The instanced-box path as an {@link EngineDraw}; `renderItem` stays on the React wrapper.
- `groundPadDraw` (`@jgengine/core/environment/GroundPad.draw`): A flat circular or rectangular pad resting on a terrain field.
- `TerrainGroundDrawProps` (`@jgengine/core/environment/terrainGround.draw`): Props for {@link terrainGroundDraw}: the terrain descriptor, live field, optional island center and sculpt snapshot.
- `fireLandscapeDraw` (`@jgengine/core/fire/FireLandscape.draw`): Draw a {@link FireLandscape}: a ground overlay of flaming, smouldering, charred and ashen cells, flame billboards as tall as each cell's flame length, and smoke puffs rising from burning cells and drifting downwind.
- `flushAfterRenderTasks` (`@jgengine/core/frame/afterRenderBoard.draw`): Run every task joined with {@link joinAfterRenderTask}, in join order. Also `flushBeforeRenderTasks`, `joinAfterRenderTask`, `joinBeforeRenderTask`.
- `EngineCanvas` (`@jgengine/core/frame/engineCanvas.draw`): The engine-owned replacement for r3f's `<Canvas>`: one canvas, one {@link createEngineLoop}, and an {@link EngineHostProvider} so every draw wrapper underneath mounts through `useEngineHost`/`useEngineDraw` exactly as it did under `R3FEngineHost`. Also `EngineCanvasProps`.
- `EngineHost` (`@jgengine/core/frame/engineHost.draw`): The render host a React subtree draws through: the engine loop's provider.
- `childFrameState` (`@jgengine/core/frame/engineLoop.draw`): A frame state scoped to a subtree: draws mounted through this add their objects under `parent` instead of the scene root. Also `EngineDraw`, `EngineFrameBoard`, `EngineFrameState`, `EngineFrameloop`, `EngineLoop`, `EngineLoopOptions`, `createEngineLoop`, `groupDraw`.
- `bindFrameSource` (`@jgengine/core/frame/frameBoard.draw`): Drive the shared board from `next` by hand (a test, a headless harness): it becomes the primary whatever was bound before. Also `FrameOwner`, `FrameSource`, `FrameTask`, `FrameTaskRef`, `joinFrameTask`.
- `clearLoadDrawCache` (`@jgengine/core/frame/loadDraw.draw`): Drop every cached load (tests, scene teardown). Also `LoadDrawOptions`, `loadDraw`, `loadDrawSystem`.
- `createTestEngineHost` (`@jgengine/core/frame/testEngineHost.draw`): ⚠ undocumented Also `MountedTestDraws`.
- `disposeObjectTree` (`@jgengine/core/frame/useEngineDraw.draw`): Dispose every geometry and material under `root` â€” for demo/preview object trees built outside draws. Also `DrawTransform`.
- `generatorMeshInstanceDraw` (`@jgengine/core/generator/GeneratorMeshInstance.draw`): One placed generator instance drawn through the mesh builder registered for its output family (`registerGeneratorMesh`), regrown from its params and seed.
- `grassCoverDraw` (`@jgengine/core/grass/GrassCover.draw`): The turf surface under one authored `grass_field` patch: a ground-draped, edge-feathered mat that turns a bare pavement footprint into grass the blade field stands in.
- `grassPatchDraw` (`@jgengine/core/grass/GrassPatch.draw`): The engine's one grass renderer: a camera-streamed blade field over a turf mat.
- `AnchoredOverlay` (`@jgengine/core/hud/hudOverlay.draw`): A world-anchored DOM overlay: drei's `<Html position center>` while r3f owns the canvas; under the engine loop a div projected to the anchor every frame, with `distanceFactor` scaling matched to drei's `distanceFactor / (2·tan(fov/2)·distance)`. Also `HudOverlay`.
- `staticShapeBatchDraw` (`@jgengine/core/instancing/staticShapeInstances.draw`): One instanced batch as an {@link EngineDraw}.
- `worldItemMarkerDraw` (`@jgengine/core/item/WorldItems.draw`): Draw-side form of the marker's meshes: the ground ring and bobbing gem are added under the caller's pose group, which the frame writes the entity pose onto.
- `backdropFogDraw` (`@jgengine/core/lighting/SceneLighting.draw`): Draw-side form of {@link BackdropFog}: writes the backdrop's linear or exponential fog onto the real scene (a scoped mount group's `scene` is not the scene fog lives on); clears it on dispose. Also `configuredLightingDraw`.
- `lightBeamDraw` (`@jgengine/core/map/LightBeam.draw`): A glowing column of light rising from where it is placed, for finding something from afar: a fallen body, a supply crate, an objective.
- `markerAccess` (`@jgengine/core/map/map.view`): Non-hook access to a marker collection's subscribe/snapshot pair, for draw factories. Also `MarkerAccess`.
- `mapMarkerBeaconsDraw` (`@jgengine/core/map/MapMarkerBeacons.draw`): World-space beacons for map markers (the visible in-world side of a ping): a floating diamond over a soft light beam, colored by marker kind.
- `hairCardsDraw` (`@jgengine/core/material/hairCards.draw`): ⚠ undocumented
- `leasedMaterialMeshDraw` (`@jgengine/core/material/materialAsset.draw`): An {@link EngineDraw} mesh whose material arrives asynchronously: mounts with `fallback` (or a plain standard material), swaps in the leased material when `load` resolves, and disposes the lease with the draw. Also `materialAssetMaterial`, `materialAssetSwatchDraw`.
- `surfaceMaterialPreviewDraw` (`@jgengine/core/material/surfaceMaterialPreview.draw`): ⚠ undocumented
- `trackSurfaceScan` (`@jgengine/core/material/surfaceScanTextures.draw`): Acquire a scan for draw code: the first holder starts the decode, `onChange` fires once the maps are ready or have failed, and the last release frees the GPU textures. Also `SurfaceScanTrack`.
- `triplanarAssetMaterial` (`@jgengine/core/material/triplanarMaterial.draw`): The draw-side form of the old `useTriplanarAssetMaterial`: resolves the asset's maps, applies world-space triplanar projection and returns an owned lease.
- `entityModelDraw` (`@jgengine/core/model/entityModelDraw.draw`): Draws an entity's model without React: loading, cloning, materials, paint, attachments, parts, animation, foot IK, glance, bounds and collision measurement — the `EntityModel` contract on the engine frame loop. Also `EntityModelDrawOptions`, `MeasureTarget`, `ModelTextureEntries`, `entitySpriteDraw`, `isolatedEntityModelDraw`, `isolatedModelUsesVariants`, `loadModelMaterialTextures`, `singleVariantModelDraw`.
- `measuredBoundsDraw` (`@jgengine/core/model/measureBounds.draw`): Wraps custom-rendered actor content (`renderEntity` / `renderObject`) and reports its measured entity-local bounds into collider resolution, so the hitbox wraps what is actually on screen instead of the fixed-size fallback box.
- `modelInstanceDraw` (`@jgengine/core/model/modelInstanceDraw.draw`): The draw-side {@link ModelInstanceConfig} renderer: loads the shared GLTF, clones and places the model through the same build path entity draws use, then poses it every frame. Also `ModelInstanceConfig`, `ModelInstanceDrawOptions`, `ModelInstanceOptions`, `ModelInstanceReady`.
- `naturePreviewDraw` (`@jgengine/core/nature/naturePreview.draw`): ⚠ undocumented
- `instancedJointsDraw` (`@jgengine/core/physics/InstancedJoints.draw`): Debug overlay drawing a PhysicsWorld's joints (suspension, ragdoll links, carry tethers) as one LineSegments batch.
- `placementGhostDraw` (`@jgengine/core/placement/PlacementGhost.draw`): Cursor-following build ghost: valid/invalid tint from a placement controller preview.
- `postProcessingDraw` (`@jgengine/core/postfx/PostProcessing.draw`): Draw form of the old `PostProcessing` component: owns the EffectComposer graph, the devtools audit probe, tone-mapping override and the cover-gated effect reveal. Also `PostProcessingProps`.
- `spriteBatchDraw` (`@jgengine/core/render/SpriteBatch.draw`): Renders a sprite sheet / tile atlas as a single InstancedMesh — one draw call for the whole batch.
- `tileLayerRendererDraw` (`@jgengine/core/render/TileLayerRenderer.draw`): Renders a tilemap as one instanced quad mesh with atlas UV rectangles.
- `RoadJunctionsProps` (`@jgengine/core/roads/RoadJunctions.draw`): Props for {@link RoadJunctions}.
- `roadRibbonsDraw` (`@jgengine/core/roads/RoadRibbons.draw`): Renders every road that looks like `road` (equal {@link roadLookKey}) from their trimmed centerline sub-paths (cut back at every junction by {@link buildAuthoredRoadNetwork}): an asphalt ribbon, a curb/edge strip along each border, an optional dashed centerline, and optional sidewalks. Also `RoadRibbonsProps`, `roadsDraw`.
- `scannedRibbonDraw` (`@jgengine/core/roads/surfaceRibbonMaterial.draw`): One ribbon mesh whose material follows a scanned surface: hidden while the scan decodes (so the shader warmup links only the programs the first frame draws), rebuilt when the maps land or the spec changes, and swapped for the flat fallback whenever the ribbon material is absent. Also `ScannedRibbonSpec`.
- `instancedScatterDraw` (`@jgengine/core/scatter/InstancedScatter.draw`): Renders resolved {@link ScatterInstance}s grouped into per-chunk, per-species GPU-instanced draws that frustum-cull independently.
- `ScatterImpostorFieldDrawOptions` (`@jgengine/core/scatter/ScatterImpostorField.draw`): ⚠ undocumented
- `ProxyPolesSpec` (`@jgengine/core/scene/PoleLineRenderer.draw`): ⚠ undocumented
- `sceneCaptureBindingDraw` (`@jgengine/core/scene/sceneCapture.draw`): In-canvas binder that registers the live renderer for `requestSceneCapture` and `requestSceneThumbnail` (a photo-mode Capture button, a save slot's thumbnail), which wait for this mount and the first painted frame.
- `SceneWarmupGateProps` (`@jgengine/core/scene/SceneWarmupGate.draw`): ⚠ undocumented
- `studioStageDraw` (`@jgengine/core/scene/StudioStage.draw`): The stage's lights, floor and backdrop as an {@link EngineDraw}; `getSpin` resolves the group the React children render under so turntable/faceCamera still spin them.
- `skyDomeDraw` (`@jgengine/core/sky/Daylight.draw`): Draw-side form of {@link SkyDome}: an owned shader-material sphere that follows the camera on x/z, converts its zenith/horizon through the display-color writers each frame, and rebuilds its material and geometry only when the resolved inputs change â€” the same memo boundaries the hooks had. Also `SkyFogDrawProps`, `SunLightDrawProps`, `skyDraw`, `skyFogDraw`, `sunLightDraw`.
- `CameraPoseDraw` (`@jgengine/core/stage/stageDraw.draw`): Mount a {@link CameraPoseSpec} as one draw. Also `CameraPoseSpec`, `OrbitControlsDraw`, `OrbitControlsSpec`, `StageDraw`, `StageLight`, `StageSpec`, `cameraPoseDraw`, `orbitControlsDraw` and 1 more.
- `carvedTerrainDraw` (`@jgengine/core/terrain/CarvedTerrain.draw`): Renders a `TerrainField` as a deformed ground mesh — the crater/mound view for destructible terrain.
- `editableGroundDraw` (`@jgengine/core/terrain/EditableGround.draw`): Mesh an editable terrain inside its bounds, coloured by each point's painted surface; bump `version` after an edit.
- `proceduralGroundDraw` (`@jgengine/core/terrain/ProceduralGround.draw`): A seeded noise-height ground mesh coloured from low to high ground.
- `RequiredTerrainMaterialInput` (`@jgengine/core/terrain/requiredTerrainMaterial.draw`): ⚠ undocumented
- `terraformBrushCursorDraw` (`@jgengine/core/terrain/TerraformBrushCursor.draw`): A ground ring showing where a terraform brush will act, coloured by its mode.
- `noteTerrainQuality` (`@jgengine/core/terrain/terrainQuality.draw`): The graphics tier for draw code, which has no React context. Also `terrainQuality`.
- `TerrainSurfacesInput` (`@jgengine/core/terrain/terrainSurfacesDriver.draw`): What a terrain surface bake needs: the resolved surface roles, paint-layer scans and graphics tier. Also `TerrainSurfacesSnapshot`.
- `TolerantTerrainMaterialInput` (`@jgengine/core/terrain/tolerantTerrainMaterial.draw`): ⚠ undocumented
- `RuneUi` (`@jgengine/core/ui/runeUi.view`): One mounted Rune UI layer. Also `RuneUiEvent`, `RuneUiFrame`, `RuneUiNode`, `RuneUiOptions`.
- `particleFieldDraw` (`@jgengine/core/vfx/ParticleField.draw`): One pooled simulation drawn as a point cloud or instanced quads, as an {@link EngineDraw}. Also `ParticleFieldDrawOptions`.
- `CullingProviderDrawProps` (`@jgengine/core/visibility/CullingProvider.draw`): ⚠ undocumented
- `oceanDraw` (`@jgengine/core/water/Ocean.draw`): An animated Gerstner-wave water surface lit by the scene's sky: it reflects the sky's colours, takes the sun's and moon's light, clears over shallows and foams at the shore wherever `bedAt` puts the bed, and follows the camera to the horizon when `config.follow` is set. Also `OceanDrawProps`.
- `dustFieldDraw` (`@jgengine/core/weather/DustField.draw`): Renders wind-borne particulate as camera-facing motes.
- `birdsDraw` (`@jgengine/core/weather/LivingWorldLayer.draw`): Draw-side form of `Birds`: an instanced gull flock orbiting the camera's look point, fading in only in fair daylight. Also `BirdsDrawProps`, `LitterDrawProps`, `LivingWorldProps`, `SteamDrawProps`, `litterDraw`, `livingWorldDriverDraw`, `livingWorldVisualsDraw`, `steamDraw`.
- `rainFieldDraw` (`@jgengine/core/weather/RainField.draw`): GPU-animated rain streaks around the camera, sheltered under authored roofs.
- `rainImpactFieldDraw` (`@jgengine/core/weather/RainImpactField.draw`): Bounded ground ripples sharing precipitation intensity and authoritative animation time.
- `snowFieldDraw` (`@jgengine/core/weather/SnowField.draw`): GPU-animated drifting snowflakes around the camera, sheltered under authored roofs.
- `markerAccess` (`@jgengine/react`): Non-hook access to a marker collection's subscribe/snapshot pair, for draw factories. Also `MarkerAccess`.

### Fixed

- each canvas on a page runs its own frame tasks, so model previews and second viewports no longer draw with another canvas's camera
- a scene group keeps one group across renders, and a draw rebuilt on every render warns once

### Removed

- react-three-fiber and drei. The 3D layer runs on plain three.js under an engine-owned frame loop (createEngineLoop, EngineCanvas, useEngineDraw); bun run check r3f-free keeps them out
- `@jgengine/core/anim/PartMotion.draw` no longer exports `PartMotionRig`.
- `@jgengine/core/buildings/GeneratedBuilding.draw` no longer exports `BuildingBlock`, `BuildingBlockProps`.
- `@jgengine/core/material/authoredSurfaceMaterial.draw` no longer exports `AuthoredSurfaceMaterial`, `useAuthoredSurfaceMaterial`.
- `@jgengine/core/material/materialAsset.draw` no longer exports `MaterialAssetSurface`, `useMaterialAssetMaterial`.
- `@jgengine/core/material/surfaceScanTextures.draw` no longer exports `useSurfaceScan`.
- `@jgengine/core/material/triplanarMaterial.draw` no longer exports `TriplanarAssetMaterial`, `useTriplanarAssetMaterial`.
- `@jgengine/core/model/SceneModels.draw` no longer exports `MeasureTarget`.
- `@jgengine/core/model/useModelInstance.draw` no longer exports `ModelInstance`, `ModelInstanceConfig`, `ModelInstanceOptions`, `useModelInstance`.
- `@jgengine/core/scene/useDecalTexture.draw` no longer exports `useDecalTexture`.
