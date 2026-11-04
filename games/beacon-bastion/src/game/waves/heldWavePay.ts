import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { keep, runEnded } from "../keep";
import { session } from "../session";

/**
 * What holding a wave pays, on top of kill bounty. Once a wave has fully arrived and the road is clear,
 * the garrison draws its wages for every wave since the last pay, the purse earns interest on what it
 * held, and walls that took no leak earn a bonus. Interest is the reason to bank gold instead of
 * spending it all, and the clear road is the reason to hold a wave rather than call the next one early.
 */
export const HELD_PAY_RULE = {
  /** Wages for wave `n` are `base + perWave × n`. */
  wageBase: 10,
  wagePerWave: 2,
  /** Share of the held purse paid as interest, and the most one pay may add. */
  interestRate: 0.1,
  interestMax: 20,
  /** Paid when no raider broke through since the last pay. */
  flawless: 10,
} as const;

export interface HeldPay {
  wages: number;
  interest: number;
  flawless: number;
  total: number;
}

/** The pay for waves `fromWave..toWave` (inclusive) held with `gold` in the purse and `leaks` lives lost. */
export function heldPay(fromWave: number, toWave: number, gold: number, leaks: number): HeldPay {
  let wages = 0;
  for (let wave = Math.max(1, fromWave); wave <= toWave; wave += 1) wages += HELD_PAY_RULE.wageBase + HELD_PAY_RULE.wagePerWave * wave;
  const interest = interestOn(gold);
  const flawless = leaks === 0 ? HELD_PAY_RULE.flawless : 0;
  return { wages, interest, flawless, total: wages + interest + flawless };
}

/** The interest a purse of `gold` earns at the next pay. */
export function interestOn(gold: number): number {
  return Math.min(HELD_PAY_RULE.interestMax, Math.floor(Math.max(0, gold) * HELD_PAY_RULE.interestRate));
}

/** One line for the notice a held wave raises. */
export function heldPayLine(wave: number, pay: HeldPay): string {
  const parts = [`${pay.wages} wages`, `${pay.interest} interest`];
  if (pay.flawless > 0) parts.push(`${pay.flawless} for whole walls`);
  return `Wave ${wave} held: +${pay.total} gold (${parts.join(", ")})`;
}

/**
 * Keep the road's state on the keep and pay a held wave: `keep.field_clear` opens wall repairs, and the
 * first clear road after a wave arrives pays every wave since the last pay.
 */
export function tickHeldPay(ctx: GameContext): void {
  const world = keep.of(ctx);
  if (runEnded(world)) return;
  const clear = world.fact("keep.wave_ready") === true && session.creeps.size === 0;
  if ((world.fact("keep.field_clear") === true) !== clear) world.set("keep.field_clear", clear);
  if (!clear || world.fact("keep.wave_started") !== true) return;
  const wave = session.encounter.view().wave;
  const paid = world.num("keep.paid_wave");
  if (wave <= paid) return;
  const pay = heldPay(paid + 1, wave, world.num("keep.gold"), world.num("keep.wave_leaks"));
  world.set("keep.paid_wave", wave);
  world.set("keep.wave_leaks", 0);
  keep.emit(ctx, { kind: "held_pay", scale: pay.total });
  ctx.game.notices.push({ text: heldPayLine(wave, pay), ttlMs: 4500 });
  ctx.game.audio.play("upgrade");
}
