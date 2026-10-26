import type { GameContext } from "../../runtime/gameContext";
import { resolveAreaTargets, type AreaTargetInput } from "../effects";
import type { DamageRuntime, DamageRuntimeHitInput, DamageRuntimeResolution } from "./damageRuntime";

/** One blow to land: a {@link DamageRuntime} hit plus who struck it and what the kill feed credits. */
export interface LandDamageInput extends DamageRuntimeHitInput {
  /** The attacker the world's `damage` effect is sent from. */
  source: string;
  /** Item the effect credits (a gun id for the kill feed); omitted sends none. */
  item?: string;
  /** Round the resolved number before it lands, so a chart with fractional multipliers deals whole points. Default `false`. */
  round?: boolean;
}

/** What one landed blow did: the runtime's full resolution and the amount the world received. */
export interface LandedDamage {
  resolution: DamageRuntimeResolution;
  amount: number;
}

/**
 * Resolve one blow through a damage runtime and land it through the world's `damage` effect, so stat
 * pool absorption, spillover, death and the kill feed stay the engine's. A zero result lands nothing.
 * The target must already carry a profile (`runtime.registerTarget`); an unprofiled one throws, so a
 * hit on something nobody wired fails loudly instead of dealing its base number.
 *
 * @capability land-damage resolve a hit through a damage chart and apply it to the world as one damage effect
 */
export function landDamage(ctx: GameContext, runtime: DamageRuntime, input: LandDamageInput): LandedDamage {
  const { item, round, ...hit } = input;
  const resolution = runtime.hit(hit);
  const amount = round === true ? Math.round(resolution.damage) : resolution.damage;
  if (amount > 0) {
    ctx.scene.entity.effect({
      from: input.source,
      to: input.target,
      effect: "damage",
      via: item === undefined ? { amount } : { amount, item },
    });
  }
  return { resolution, amount };
}

/** One area payload: every body inside `radius` of `at` takes its share of `base`. */
export interface LandAreaDamageInput {
  source: string;
  at: readonly [number, number, number];
  radius: number;
  type: string;
  base: number;
  /** Share by distance; `"linear"` fades to zero at the rim. Default `"linear"`. */
  falloff?: AreaTargetInput["falloff"];
  item?: string;
  round?: boolean;
}

/**
 * Land an area payload: select bodies with the shared area query (radius, falloff, the world's
 * `canReceive("damage")` gate), then land each share through {@link landDamage}. `prepare` runs per
 * selected body before its hit and returns false to skip one (an unprofiled kind), which is where a
 * game registers a profile lazily.
 *
 * @capability land-area-damage radius damage with falloff resolved through a damage chart per body
 */
export function landAreaDamage(
  ctx: GameContext,
  runtime: DamageRuntime,
  input: LandAreaDamageInput,
  prepare: (instanceId: string) => boolean = (instanceId) => runtime.target(instanceId) !== null,
): LandedDamage[] {
  const entity = ctx.scene.entity;
  // A point source has no entity to cast from, so the blast is the open-field default: no wall blocks it.
  const spatial = {
    inRadius: (center: readonly [number, number, number], radius: number) => entity.inRadius(center, radius),
    hasLineOfSight: () => true,
    positionOf: (instanceId: string) => entity.get(instanceId)?.position,
  };
  const targets = resolveAreaTargets(
    spatial,
    { at: input.at, radius: input.radius, falloff: input.falloff ?? "linear" },
    (instanceId) => entity.canReceive(instanceId, "damage") === null,
  );
  const landed: LandedDamage[] = [];
  for (const target of targets) {
    if (!prepare(target.instanceId)) continue;
    landed.push(
      landDamage(ctx, runtime, {
        source: input.source,
        target: target.instanceId,
        type: input.type,
        base: input.base * target.scale,
        position: input.at,
        ...(input.item === undefined ? {} : { item: input.item }),
        ...(input.round === undefined ? {} : { round: input.round }),
      }),
    );
  }
  return landed;
}
