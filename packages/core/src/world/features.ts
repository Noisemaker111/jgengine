export interface WorldBounds {
  w: number;
  d: number;
}

export interface BiomesWorldConfig {
  map: string;
  zones: string;
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

export type WorldFeature =
  | ({ kind: "biomes" } & BiomesWorldConfig)
  | ({ kind: "voxel" } & VoxelWorldConfig)
  | ({ kind: "plots" } & PlotsWorldConfig)
  | ({ kind: "tilemap" } & TilemapWorldConfig)
  | { kind: "flat" };

export function biomes(config: BiomesWorldConfig): WorldFeature {
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

export function flat(): WorldFeature {
  return { kind: "flat" };
}
