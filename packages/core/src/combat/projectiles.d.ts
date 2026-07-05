import type { EntityPosition } from "../scene/entityStore";
import type { Aim } from "../scene/spatial";
import type { CombatSpatialDeps, EffectResult, EffectSystem, EffectVia } from "./effects";
export interface ProjectileShotInput {
    from: string;
    via: EffectVia;
    aim: Aim;
    effect: string;
}
export interface RaycastHit {
    instanceId: string;
    distance: number;
    at: EntityPosition;
}
export type Raycast = (from: string, aim: Aim, range: number) => RaycastHit[];
export interface ProjectileSystemDeps {
    effects: EffectSystem;
    spatial: CombatSpatialDeps;
    getStat(itemId: string, stat: string): number | null;
    raycast?: Raycast;
    now?: () => number;
}
export interface ProjectilePrediction {
    hits: {
        instanceId: string;
        distance: number;
    }[];
    blocked?: boolean;
}
export type SettleResult = {
    status: "settled";
    shotId: string;
    at: [number, number, number];
    hits: EffectResult[];
} | {
    status: "rejected";
    shotId: string;
    reason: string;
};
export interface ProjectileSystem {
    willHitProjectile(input: ProjectileShotInput): ProjectilePrediction;
    fireProjectile(input: ProjectileShotInput): string;
    settleProjectile(shotId: string): SettleResult;
}
export declare function createProjectileSystem(deps: ProjectileSystemDeps): ProjectileSystem;
