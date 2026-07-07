export interface WorldBounds {
  w: number;
  d: number;
}

export interface BiomesWorldConfig {
  map?: string;
  zones?: string;
  bounds?: WorldBounds;
}

export interface VoxelWorldConfig {
  seed: string;
  generate?: string;
  streaming?: { radius: number };
}

export interface PlotsWorldConfig {
  city?: string;
  interiors?: string;
}

export interface TilemapWorldConfig {
  map: string;
}

export interface RollingWorldConfig {
  seed?: string | number;
  amplitude?: number;
  frequency?: number;
  bounds?: WorldBounds;
}

export interface ArenaWorldConfig {
  seed?: string | number;
  bounds?: WorldBounds;
}

export interface HeightfieldWorldConfig {
  seed?: string | number;
  amplitude?: number;
  frequency?: number;
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
  baseHeight?: number;
  ridged?: boolean;
  bounds?: WorldBounds;
  waterLevel?: number;
}

export type WorldFeature =
  | ({ kind: "biomes" } & BiomesWorldConfig)
  | ({ kind: "voxel" } & VoxelWorldConfig)
  | ({ kind: "plots" } & PlotsWorldConfig)
  | ({ kind: "tilemap" } & TilemapWorldConfig)
  | ({ kind: "rolling" } & RollingWorldConfig)
  | ({ kind: "arena" } & ArenaWorldConfig)
  | ({ kind: "heightfield" } & HeightfieldWorldConfig)
  | { kind: "flat" };

export function biomes(config: BiomesWorldConfig = {}): WorldFeature {
  return { kind: "biomes", ...config };
}

export function voxel(config: VoxelWorldConfig): WorldFeature {
  return { kind: "voxel", ...config };
}

export function plots(config: PlotsWorldConfig = {}): WorldFeature {
  return { kind: "plots", ...config };
}

export function tilemap(config: TilemapWorldConfig): WorldFeature {
  return { kind: "tilemap", ...config };
}

export function rolling(config: RollingWorldConfig = {}): WorldFeature {
  return { kind: "rolling", ...config };
}

export function arena(config: ArenaWorldConfig = {}): WorldFeature {
  return { kind: "arena", ...config };
}

export function heightfield(config: HeightfieldWorldConfig = {}): WorldFeature {
  return { kind: "heightfield", ...config };
}

export function flat(): WorldFeature {
  return { kind: "flat" };
}
