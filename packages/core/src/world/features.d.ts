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
    streaming?: {
        radius: number;
    };
}
export interface PlotsWorldConfig {
    city?: string;
    interiors?: string;
}
export interface TilemapWorldConfig {
    map: string;
}
export type WorldFeature = ({
    kind: "biomes";
} & BiomesWorldConfig) | ({
    kind: "voxel";
} & VoxelWorldConfig) | ({
    kind: "plots";
} & PlotsWorldConfig) | ({
    kind: "tilemap";
} & TilemapWorldConfig) | {
    kind: "flat";
};
export declare function biomes(config: BiomesWorldConfig): WorldFeature;
export declare function voxel(config: VoxelWorldConfig): WorldFeature;
export declare function plots(config?: PlotsWorldConfig): WorldFeature;
export declare function tilemap(config: TilemapWorldConfig): WorldFeature;
export declare function flat(): WorldFeature;
