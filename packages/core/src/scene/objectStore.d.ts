import type { EntityPosition } from "./entityStore";
export interface SceneObject {
    instanceId: string;
    catalogId: string;
    position: EntityPosition;
    rotationY: number;
    parentSpace?: string;
}
export interface PlaceOptions {
    instanceId?: string;
    parentSpace?: string;
    rotation?: number;
}
export interface ObjectListFilter {
    parentSpace?: string;
}
export interface ObjectStore {
    place(catalogId: string, x: number, y: number, z: number, options?: PlaceOptions): string;
    remove(instanceId: string): boolean;
    move(instanceId: string, x: number, y: number, z: number): boolean;
    rotate(instanceId: string, rotationY: number): boolean;
    get(instanceId: string): SceneObject | null;
    list(filter?: ObjectListFilter): readonly SceneObject[];
    clear(): void;
    subscribe(listener: () => void): () => void;
    snapshot(): readonly SceneObject[];
}
export declare function createObjectStore(): ObjectStore;
