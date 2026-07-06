import type { EntityPosition } from "../scene/entityStore";
import { type StatValueMap } from "../scene/entityStats";
export interface ReceiveRule {
    order: string[];
    modifiers?: Record<string, number>;
}
export type ReceiveMap = Record<string, ReceiveRule>;
export interface EffectVia {
    item?: string;
    amount?: number;
}
export interface SingleTargetEffectInput {
    from: string;
    to: string;
    effect: string;
    via?: EffectVia;
}
export interface AreaEffectInput {
    from: string;
    effect: string;
    via?: EffectVia;
    at: EntityPosition;
    radius: number;
    falloff?: "linear" | "none";
    los?: boolean;
}
export type EffectInput = SingleTargetEffectInput | AreaEffectInput;
export interface AppliedPoolDelta {
    statId: string;
    delta: number;
}
export interface EffectResult {
    instanceId: string;
    effect: string;
    applied: AppliedPoolDelta[];
    lethal: boolean;
}
export interface LethalContext {
    from: string;
    via?: EffectVia;
    effect: string;
}
export interface CombatSpatialDeps {
    inRadius(center: EntityPosition, radius: number): string[];
    hasLineOfSight(from: EntityPosition | string, to: string): boolean;
    positionOf(instanceId: string): EntityPosition | undefined;
}
export interface EffectSystemDeps {
    resolveReceive(instanceId: string): ReceiveMap | null | undefined;
    resolveStats(instanceId: string): StatValueMap | undefined;
    getStat(itemId: string, stat: string): number | null;
    spatial: CombatSpatialDeps;
    drainStatByEffect?: Record<string, string>;
    onLethal?(instanceId: string, ctx: LethalContext): void;
}
export interface EffectSystem {
    canReceive(instanceId: string, effect: string): string | null;
    preview(input: SingleTargetEffectInput): number;
    applyEffect(input: EffectInput): EffectResult[];
}
export declare function createEffectSystem(deps: EffectSystemDeps): EffectSystem;
