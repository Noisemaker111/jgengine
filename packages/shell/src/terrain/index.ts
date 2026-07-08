export { CarvedTerrain, type CarvedTerrainProps } from "./CarvedTerrain";
export { GrassField, type GrassFieldProps } from "./GrassField";
export { ProceduralGround, type ProceduralGroundProps } from "./ProceduralGround";
export { EditableGround, type EditableGroundProps } from "./EditableGround";
export { TerraformBrushCursor, type TerraformBrushCursorProps } from "./TerraformBrushCursor";
export {
  createGrassBladeGeometry,
  resolveGrassBladeGeometryOptions,
  resolveGrassRange,
  type GrassBladeGeometryOptions,
  type GrassRange,
  type ResolvedGrassBladeGeometryOptions,
} from "./grassGeometry";
export {
  createGrassMaterial,
  DEFAULT_GRASS_WIND,
  resolveGrassWind,
  type GrassMaterialHandle,
  type GrassMaterialOptions,
  type GrassShaderUniforms,
  type GrassWindOptions,
} from "./grassMaterial";
export { createSeededRandom, hashNoise2, seedToUint32, type TerrainSeed } from "./random";
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
