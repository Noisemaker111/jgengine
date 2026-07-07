export { GrassField, type GrassFieldProps } from "./GrassField";
export { ProceduralGround, type ProceduralGroundProps } from "./ProceduralGround";
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
  createProceduralGroundGeometry,
  createProceduralTerrainSampler,
  fbmValueNoise2,
  resolveTerrainSegments,
  resolveTerrainSize,
  smoothValueNoise2,
  type ProceduralTerrainConfig,
  type ResolvedTerrainSegments,
  type ResolvedTerrainSize,
  type TerrainArea,
  type TerrainHeightSampler,
  type TerrainVertexColorOptions,
} from "./terrainMath";
