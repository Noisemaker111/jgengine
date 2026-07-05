import type { DeathReason, GameEvents } from "../game/events";
import type { Drop } from "../game/lootTable";
import type { EffectVia } from "./effects";
export type DeathReasonKind = DeathReason["kind"];
export interface OnDeathDropRule {
    table: string;
    when?: {
        reason: DeathReasonKind;
    };
}
export interface OnDeathCommandRule {
    name: string;
    args?: unknown;
    when?: {
        reason: DeathReasonKind;
    };
}
export interface OnDeathSpec {
    drops?: string | OnDeathDropRule[];
    command?: string | OnDeathCommandRule;
}
export interface NormalizedOnDeath {
    drops: OnDeathDropRule[];
    command: OnDeathCommandRule | null;
}
export declare function normalizeOnDeath(spec: OnDeathSpec | null | undefined): NormalizedOnDeath;
export interface DeathIdentity {
    catalogId: string;
    userId?: string;
    displayName?: string;
    position: [number, number, number];
}
export interface DeathSystemDeps {
    resolveOnDeath(instanceId: string): OnDeathSpec | null | undefined;
    resolveIdentity(instanceId: string): DeathIdentity | null;
    loot: {
        roll(tableId: string): Drop[];
    };
    events: GameEvents;
    runCommand?(name: string, args: unknown): void;
    despawn(instanceId: string): void;
}
export type DeathResolution = {
    status: "resolved";
    drops: Drop[];
    ranCommand: string | null;
} | {
    status: "rejected";
    reason: string;
};
export interface DeathSystem {
    resolveDeath(instanceId: string, reason: DeathReason): DeathResolution;
    revive(instanceId: string): boolean;
}
export declare function createDeathSystem(deps: DeathSystemDeps): DeathSystem;
export interface EffectDeathContext {
    from: string;
    via?: EffectVia;
    userIdOf?(instanceId: string): string | undefined;
}
export declare function deathReasonFromEffect(ctx: EffectDeathContext): DeathReason;
