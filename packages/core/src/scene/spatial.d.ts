import type { EntityPosition } from "./entityStore";
export type Aim = {
    origin: EntityPosition;
    direction: EntityPosition;
} | {
    yaw: number;
    pitch: number;
    spread?: number;
};
export interface QueryArcOptions {
    from: string;
    aim: Aim;
    radius: number;
    halfAngleDeg?: number;
}
export interface MoveTowardOptions {
    speed: number;
    stopDistance?: number;
    dt: number;
}
export interface SpatialApiOptions {
    resolvePosition: (instanceId: string) => EntityPosition | undefined;
    candidates: () => string[];
    occluder?: (from: EntityPosition, to: EntityPosition) => boolean;
}
export interface SpatialApi {
    distance(aInstanceId: string, bInstanceId: string): number | null;
    inRadius(center: EntityPosition | string, radius: number, filter?: (instanceId: string) => boolean): string[];
    hasLineOfSight(fromInstanceId: string, toInstanceId: string): boolean;
    queryArc(options: QueryArcOptions): string[];
    moveToward(instanceId: string, target: EntityPosition | string, options: MoveTowardOptions): EntityPosition | null;
}
export declare function distanceBetween(a: EntityPosition, b: EntityPosition): number;
export declare function createSpatialApi(options: SpatialApiOptions): SpatialApi;
