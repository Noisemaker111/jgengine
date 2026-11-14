import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

/**
 * Two short-lived conditions junk puts on an appliance: **chilled** (soaked in extinguisher foam:
 * moves slower) and **dazzled** (a face full of glitter: attacks come slower). Game-local because
 * this game is the only adopter of a timed move/attack scale on an enemy; the enemy step reads them.
 */
interface SoakState {
  chillUntil: Map<string, number>;
  dazzleUntil: Map<string, number>;
}

const soakOf = perContext((): SoakState => ({ chillUntil: new Map(), dazzleUntil: new Map() }));

export const CHILL_MS = 2200;
export const CHILL_SPEED = 0.5;
export const DAZZLE_MS = 2500;
export const DAZZLE_INTERVAL = 1.6;

const now = (ctx: GameContext) => ctx.time.now() * 1000;

export function chill(ctx: GameContext, targetId: string, ms = CHILL_MS): void {
  soakOf(ctx).chillUntil.set(targetId, now(ctx) + ms);
}

export function dazzle(ctx: GameContext, targetId: string, ms = DAZZLE_MS): void {
  soakOf(ctx).dazzleUntil.set(targetId, now(ctx) + ms);
}

export function isChilled(ctx: GameContext, targetId: string): boolean {
  return now(ctx) < (soakOf(ctx).chillUntil.get(targetId) ?? 0);
}

export function isDazzled(ctx: GameContext, targetId: string): boolean {
  return now(ctx) < (soakOf(ctx).dazzleUntil.get(targetId) ?? 0);
}

/** Walk-speed multiplier for an enemy right now. */
export function soakSpeedScale(ctx: GameContext, enemyId: string): number {
  return isChilled(ctx, enemyId) ? CHILL_SPEED : 1;
}

/** Attack-interval multiplier for an enemy right now. */
export function soakIntervalScale(ctx: GameContext, enemyId: string): number {
  return isDazzled(ctx, enemyId) ? DAZZLE_INTERVAL : 1;
}
