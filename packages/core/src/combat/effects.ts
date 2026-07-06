import type { EntityPosition } from "../scene/entityStore";
import { applyPoolDelta, type StatValueMap } from "../scene/entityStats";
import { distanceBetween } from "../scene/spatial";

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

const DEFAULT_DRAIN_STAT = "damage";

export function createEffectSystem(deps: EffectSystemDeps): EffectSystem {
  function resolveRule(instanceId: string, effect: string): ReceiveRule | null {
    return deps.resolveReceive(instanceId)?.[effect] ?? null;
  }

  function baseDrainMagnitude(effect: string, via: EffectVia | undefined): number {
    if (via?.amount !== undefined) return via.amount;
    if (via?.item === undefined) return 0;
    const statName = deps.drainStatByEffect?.[effect] ?? DEFAULT_DRAIN_STAT;
    return deps.getStat(via.item, statName) ?? 0;
  }

  function modifiedDrainMagnitude(magnitude: number, rule: ReceiveRule): number {
    let result = magnitude;
    for (const reduction of Object.values(rule.modifiers ?? {})) {
      result *= 1 - reduction;
    }
    return result;
  }

  function canReceive(instanceId: string, effect: string): string | null {
    const rule = resolveRule(instanceId, effect);
    if (rule === null) return "not-receivable";
    const stats = deps.resolveStats(instanceId);
    if (stats === undefined) return "unknown-instance";
    const anyPoolAboveMin = rule.order.some((statId) => {
      const stat = stats[statId];
      return stat !== undefined && stat.current > stat.min;
    });
    if (!anyPoolAboveMin) return "pools-depleted";
    return null;
  }

  function drainPools(
    instanceId: string,
    effect: string,
    rule: ReceiveRule,
    stats: StatValueMap,
    drainMagnitude: number,
  ): EffectResult {
    const applied: AppliedPoolDelta[] = [];
    const lastStatId = rule.order[rule.order.length - 1];
    let remaining = drainMagnitude;
    let lethal = false;
    for (const statId of rule.order) {
      if (remaining === 0) break;
      const before = stats[statId];
      if (before === undefined) continue;
      const result = applyPoolDelta(stats, statId, -remaining);
      if (result.status === "rejected") continue;
      stats[statId] = result.stat;
      const delta = result.stat.current - before.current;
      if (delta !== 0) applied.push({ statId, delta });
      remaining += delta;
      if (statId === lastStatId && drainMagnitude > 0 && result.hitMin) lethal = true;
    }
    return { instanceId, effect, applied, lethal };
  }

  function applyTo(
    instanceId: string,
    effect: string,
    via: EffectVia | undefined,
    from: string,
    scale: number,
  ): EffectResult | null {
    if (canReceive(instanceId, effect) !== null) return null;
    const rule = resolveRule(instanceId, effect);
    const stats = deps.resolveStats(instanceId);
    if (rule === null || stats === undefined) return null;
    const drainMagnitude = modifiedDrainMagnitude(baseDrainMagnitude(effect, via) * scale, rule);
    const result = drainPools(instanceId, effect, rule, stats, drainMagnitude);
    if (result.lethal) deps.onLethal?.(instanceId, { from, via, effect });
    return result;
  }

  return {
    canReceive,
    preview(input) {
      const rule = resolveRule(input.to, input.effect);
      if (rule === null) return 0;
      return modifiedDrainMagnitude(baseDrainMagnitude(input.effect, input.via), rule);
    },
    applyEffect(input) {
      if ("to" in input) {
        const result = applyTo(input.to, input.effect, input.via, input.from, 1);
        return result === null ? [] : [result];
      }
      const falloff = input.falloff ?? "none";
      const los = input.los ?? true;
      const results: EffectResult[] = [];
      for (const instanceId of deps.spatial.inRadius(input.at, input.radius)) {
        if (los && !deps.spatial.hasLineOfSight(input.at, instanceId)) continue;
        let scale = 1;
        if (falloff === "linear") {
          const position = deps.spatial.positionOf(instanceId);
          if (position === undefined) continue;
          scale = Math.max(0, 1 - distanceBetween(input.at, position) / input.radius);
        }
        const result = applyTo(instanceId, input.effect, input.via, input.from, scale);
        if (result !== null) results.push(result);
      }
      return results;
    },
  };
}
