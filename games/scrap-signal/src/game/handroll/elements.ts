import { createDotField, type DotField } from "@jgengine/core/combat/dotField";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { bonus } from "../characters";
import type { GunDef } from "./guns";

export { isFluxed, FLUX_DAMAGE_MULT } from "../combat/hitModel";

/**
 * A proc's burn/shock/corrode instance deals one tick every {@link DOT_INTERVAL_MS}. The old local
 * loop removed a proc at 4 s before its 4 s tick, so it dealt 7 ticks over 3.5 s; the shared
 * `dotField` schedules those same 7 ticks, and the duration below is the window that actually deals
 * damage rather than the longer lifetime that only guarded the untaken tick.
 */
export const DOT_INTERVAL_MS = 500;
export const DOT_DURATION_MS = DOT_INTERVAL_MS * 7;

interface DotRecord {
  targetId: string;
  fromId: string;
}

interface DotRuntime {
  field: DotField;
  records: Map<string, DotRecord>;
  seq: number;
}

/** Per-session damage-over-time instances, reclaimed with the context. */
const dotsOf = perContext((): DotRuntime => ({ field: createDotField(), records: new Map(), seq: 0 }));

/** Per-tick damage a proc deals: half the gun's element DPS, scaled by the DoT talent. */
export function dotTickDamage(gun: GunDef): number {
  const dps = Math.round(gun.elementDps * (1 + bonus("dotDamage")));
  return Math.max(1, Math.round(dps / 2));
}

/** Queue one independent DoT instance for a proc. Each proc keeps its own timer, as the old array did. */
export function applyDot(ctx: GameContext, gun: GunDef, fromId: string, targetId: string): void {
  const dots = dotsOf(ctx);
  dots.seq += 1;
  const id = `${targetId}#${dots.seq}`;
  dots.records.set(id, { targetId, fromId });
  dots.field.apply(id, {
    damagePerTick: dotTickDamage(gun),
    intervalMs: DOT_INTERVAL_MS,
    durationMs: DOT_DURATION_MS,
    status: gun.element,
  });
}

export function activeDotCount(ctx: GameContext): number {
  return dotsOf(ctx).records.size;
}

/**
 * The elemental proc roll and its effect. Flux is applied by the damage model itself (it rides the
 * hit's status list so the roll keeps its place in the stream); the other elements queue a DoT here.
 */
export function applyElementalProc(
  ctx: GameContext,
  rng: () => number,
  gun: GunDef,
  fromId: string,
  targetId: string,
): void {
  if (gun.element === "none" || gun.element === "explosive" || gun.element === "flux") return;
  if (rng() >= gun.elementChance + bonus("elementChance")) return;
  applyDot(ctx, gun, fromId, targetId);
}

/** Advance every live DoT and route each due tick through the shared effect pipeline. */
export function tickDots(ctx: GameContext, dtSeconds: number): void {
  const dots = dotsOf(ctx);
  for (const tick of dots.field.tick(dtSeconds)) {
    const record = dots.records.get(tick.id);
    if (record === undefined) continue;
    if (ctx.scene.entity.get(record.targetId) === null) {
      dots.field.cancel(tick.id);
      dots.records.delete(tick.id);
      continue;
    }
    if (tick.damage > 0) {
      ctx.scene.entity.effect({
        from: record.fromId,
        to: record.targetId,
        effect: "damage",
        via: { amount: Math.max(1, Math.round(tick.damage)) },
      });
    }
    if (tick.expired) dots.records.delete(tick.id);
  }
}

