import type { BehaviorDescriptor } from "./behaviors";
export type EntityRole = "player" | "npc" | "prop";
export interface EntityMovement {
    walkSpeed?: number;
}
export type EntityPosition = readonly [number, number, number];
export type SpawnPositionInput = EntityPosition | {
    x: number;
    y: number;
    z: number;
};
export interface SceneEntity<TMeta = undefined> {
    id: string;
    name: string;
    position: EntityPosition;
    rotationY: number;
    rotationX: number;
    rotationZ: number;
    role: EntityRole;
    movement: EntityMovement;
    behaviors: readonly BehaviorDescriptor[];
    meta: TMeta;
}
export interface SpawnOptions<TMeta = undefined> {
    id?: string;
    position?: SpawnPositionInput;
    rotationY?: number;
    rotationX?: number;
    rotationZ?: number;
    role?: EntityRole;
    movement?: EntityMovement;
    behaviors?: readonly BehaviorDescriptor[];
    meta?: TMeta;
}
export interface EntityPose {
    position: SpawnPositionInput;
    rotationY?: number;
    rotationX?: number;
    rotationZ?: number;
}
export interface EntityStore<TMeta = undefined> {
    spawn(name: string, options?: SpawnOptions<TMeta>): string;
    despawn(id: string): boolean;
    update(id: string, patch: Partial<Pick<SceneEntity<TMeta>, "position" | "rotationY" | "rotationX" | "rotationZ" | "role" | "movement" | "behaviors" | "meta">>): boolean;
    setPose(id: string, pose: EntityPose): boolean;
    get(id: string): SceneEntity<TMeta> | null;
    list(): readonly SceneEntity<TMeta>[];
    clear(): void;
    subscribe(listener: () => void): () => void;
    snapshot(): readonly SceneEntity<TMeta>[];
}
export declare function createEntityStore<TMeta = undefined>(): EntityStore<TMeta>;
