export { CarvedTerrain, type CarvedTerrainProps } from "./CarvedTerrain";
export { GrassPatch, type GrassPatchProps } from "../grass/GrassPatch";
export {
  bakeGrassNode,
  createGrassTuftTemplate,
  GRASS_CELL_SIZE,
  grassFieldColors,
  resolveGrassBake,
  type GrassBakeOptions,
  type GrassExclusion,
  type GrassTufts,
  type GrassTuftTemplate,
  type ResolvedGrassBake,
} from "../grass/grassBake";
export { createGrassMaterial, type GrassMaterialHandle, type GrassShaderUniforms } from "../grass/grassMaterial";
export { GRASS_SCREEN_DENSITY, GrassStream, type GrassStreamOptions, type GrassStreamStats } from "../grass/grassStream";
export { ProceduralGround, type ProceduralGroundProps } from "./ProceduralGround";
export { EditableGround, type EditableGroundProps } from "./EditableGround";
export {
  displaceHeightfieldGeometry,
  type HeightfieldColorFn,
  type HeightfieldDisplaceOptions,
  type HeightfieldRect,
} from "./heightfieldGeometry";
export { TerraformBrushCursor, type TerraformBrushCursorProps } from "./TerraformBrushCursor";
export { hashNoise2, seedToUint32, type TerrainSeed } from "./random";
export {
  createFieldGroundGeometry,
  createProceduralGroundGeometry,
  createProceduralTerrainSampler,
  normalizeHeightBlend,
  resolveTerrainSegments,
  resolveTerrainSize,
  toNoiseFieldConfig,
  type FieldGroundOptions,
  type ProceduralTerrainConfig,
  type ResolvedTerrainSegments,
  type ResolvedTerrainSize,
  type TerrainArea,
  type TerrainHeightSampler,
  type TerrainSurfaceColorOptions,
  type TerrainVertexColorOptions,
} from "./terrainMath";
export {
  arenaField,
  flatField,
  fractalNoise,
  noiseField,
  resolveGroundStep,
  resolveTerrainField,
  valueNoise,
  withNormal,
  type FractalNoiseConfig,
  type NoiseFieldConfig,
  type TerrainField,
  type TerrainNormal,
} from "@jgengine/core/world/terrain";

export { createTerrainPaintColorSampler, type TerrainPaintColorSampler, type TerrainPaintSource } from "./terrainPaintColor";
export {
  ALL_TERRAIN_SURFACE_CLASSES,
  createTerrainDetailMaterial,
  type TerrainDetailMaterialHandle,
  type TerrainDetailMaterialOptions,
  type TerrainDetailMaterialTextures,
} from "./terrainDetailMaterial";
export {
  createTerrainPaintTextures,
  MAX_TERRAIN_PAINT_LAYERS,
  packTerrainPaintWeights,
  terrainSurfaceClass,
  terrainSurfaceClassIndex,
  terrainSurfaceRoughness,
  type TerrainPaintSlot,
  type TerrainPaintTextures,
  type TerrainPaintWeights,
  type TerrainSurfaceClass,
} from "./terrainSurfaces";
export { TerrainQualityContext, useTerrainQuality } from "./terrainQuality";
export {
  applyGroundEdgeFade,
  buildGroundCoverageMask,
  createGroundEdgeFade,
  type GroundCoverageMask,
  type GroundCoverageOptions,
  type GroundEdgeFade,
} from "./groundEdgeFade";
