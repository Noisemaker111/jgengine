import type { EntityPosition } from "../scene/entityStore";
import { distanceBetween } from "../scene/spatial";
import { applyStatPoolDelta, type StatPool, type StatPoolAccess } from "../stats/statPool";

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

/**
 * Identity of an entity slain by a lethal effect, captured before the death system despawns it.
 * Serializable and genre-agnostic: `catalogId` is the slain entity's spawn kind/name (the same
 * value the `entity.died` event carries), `name` an optional human-readable label for kill feeds,
 * and `userId` the owning player when the slain unit was player-controlled. The slain entity's
 * instance id is already {@link EffectResult.instanceId}.
 */
export interface SlainIdentity {
  catalogId: string;
  name?: string;
  userId?: string;
}

export interface EffectResult {
  instanceId: string;
  effect: string;
  applied: AppliedPoolDelta[];
  lethal: boolean;
  /**
   * Present only on a lethal hit: the slain entity's identity, captured before despawn so
   * kill-credit / XP can read `catalogId`/`name` without a game-side spawn-time registry.
   * A non-lethal hit omits this field.
   */
  slain?: SlainIdentity;
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

export interface AreaTargetInput {
  at: EntityPosition;
  radius: number;
  falloff?: "linear" | "none";
  los?: boolean;
}

export interface AreaTarget {
  instanceId: string;
  scale: number;
}

export function resolveAreaTargets(
  spatial: CombatSpatialDeps,
  input: AreaTargetInput,
  accept?: (instanceId: string) => boolean,
): AreaTarget[] {
  const falloff = input.falloff ?? "none";
  const los = input.los ?? true;
  const targets: AreaTarget[] = [];
  for (const instanceId of spatial.inRadius(input.at, input.radius)) {
    if (los && !spatial.hasLineOfSight(input.at, instanceId)) continue;
    let scale = 1;
    if (falloff === "linear") {
      const position = spatial.positionOf(instanceId);
      if (position === undefined) continue;
      scale = Math.max(0, 1 - distanceBetween(input.at, position) / input.radius);
    }
    if (accept !== undefined && !accept(instanceId)) continue;
    targets.push({ instanceId, scale });
  }
  return targets;
}

export interface EffectSystemDeps {
  resolveReceive(instanceId: string): ReceiveMap | null | undefined;
  /** Preferred portable bridge to caller-owned resource state. */
  statPools?: StatPoolAccess;
  /**
   * Legacy native bridge retained for source compatibility. New integrations
   * should provide {@link statPools} and keep their own state model.
   */
  resolveStats?(instanceId: string): Record<string, StatPool> | undefined;
  getStat(itemId: string, stat: string): number | null;
  spatial: CombatSpatialDeps;
  drainStatByEffect?: Record<string, string>;
  /**
   * Resolve the target's identity, called on a lethal hit *before* {@link onLethal} despawns it.
   * The returned {@link SlainIdentity} is attached to the lethal {@link EffectResult.slain} so kill
   * credit works without a parallel registry. Return `null`/`undefined` to omit identity.
   */
  resolveSlainIdentity?(instanceId: string): SlainIdentity | null | undefined;
  onLethal?(instanceId: string, ctx: LethalContext): void;
}

export interface EffectSystem {
  canReceive(instanceId: string, effect: string, magnitude?: number): string | null;
  preview(input: SingleTargetEffectInput): number;
  applyEffect(input: EffectInput): EffectResult[];
}

const DEFAULT_DRAIN_STAT = "damage";

/**
 * Resolve direct or area resource effects through caller-owned stat pools,
 * including ordered absorption, restoration, modifiers, and lethal context.
 *
 * @capability status-effects commit direct or area effects through caller-owned stat pools with ordered spillover and lethal results
 */
export function createEffectSystem(deps: EffectSystemDeps): EffectSystem {
  const statPools: StatPoolAccess = deps.statPools ?? {
    get(instanceId, statId) {
      return deps.resolveStats?.(instanceId)?.[statId] ?? null;
    },
    set(instanceId, statId, next) {
      const stats = deps.resolveStats?.(instanceId);
      if (stats === undefined) return false;
      stats[statId] = next;
      return true;
    },
  };

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

  function canReceive(instanceId: string, effect: string, magnitude?: number): string | null {
    const rule = resolveRule(instanceId, effect);
    if (rule === null) return "not-receivable";
    if (deps.statPools === undefined && deps.resolveStats?.(instanceId) === undefined) return "unknown-instance";
    const restorative = magnitude !== undefined && magnitude < 0;
    const anyPoolHasHeadroom = rule.order.some((statId) => {
      const stat = statPools.get(instanceId, statId);
      if (stat === null) return false;
      return restorative ? stat.current < stat.max : stat.current > stat.min;
    });
    if (!anyPoolHasHeadroom) return "pools-depleted";
    return null;
  }

  function drainPools(
    instanceId: string,
    effect: string,
    rule: ReceiveRule,
    drainMagnitude: number,
  ): EffectResult {
    const applied: AppliedPoolDelta[] = [];
    const lastStatId = rule.order[rule.order.length - 1];
    let remaining = drainMagnitude;
    let lethal = false;
    for (const statId of rule.order) {
      if (remaining === 0) break;
      const result = applyStatPoolDelta(statPools, instanceId, statId, -remaining);
      if (result.status === "rejected") continue;
      const delta = result.applied;
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
    const rule = resolveRule(instanceId, effect);
    if (rule === null) return null;
    const drainMagnitude = modifiedDrainMagnitude(baseDrainMagnitude(effect, via) * scale, rule);
    if (canReceive(instanceId, effect, drainMagnitude) !== null) return null;
    const result = drainPools(instanceId, effect, rule, drainMagnitude);
    if (result.lethal) {
      // Capture identity before onLethal, which runs the death system and despawns the target.
      const slain = deps.resolveSlainIdentity?.(instanceId);
      if (slain !== null && slain !== undefined) result.slain = slain;
      deps.onLethal?.(instanceId, { from, via, effect });
    }
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
      const results: EffectResult[] = [];
      for (const target of resolveAreaTargets(deps.spatial, input)) {
        const result = applyTo(target.instanceId, input.effect, input.via, input.from, target.scale);
        if (result !== null) results.push(result);
      }
      return results;
    },
  };
}
