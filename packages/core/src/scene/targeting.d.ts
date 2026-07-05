export type TargetRelation = "hostile" | "friendly";
export type TargetFilter = TargetRelation | "any";
export interface TargetingOptions {
    candidates: () => string[];
    classify?: (fromId: string, toId: string) => TargetRelation;
    orderBy?: (a: string, b: string) => number;
    distance?: (fromId: string, toId: string) => number | null;
}
export interface CycleTargetOptions {
    filter?: TargetFilter;
    direction?: "next" | "prev";
    maxDistance?: number;
}
export interface Targeting {
    setTarget(fromId: string, toId: string | null): void;
    getTarget(fromId: string): string | null;
    cycleTarget(fromId: string, options?: CycleTargetOptions): string | null;
    clearAll(instanceId: string): void;
}
export declare function createTargeting(options: TargetingOptions): Targeting;
