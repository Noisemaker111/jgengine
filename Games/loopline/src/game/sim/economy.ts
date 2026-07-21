import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import {
  advanceLedger,
  balanceOf,
  type ResourceLedger,
  type ResourcePolicy,
} from "@jgengine/core/economy/resourceLedger";

import { DAY_LENGTH, MILESTONES } from "../catalog";
import { buildableDef } from "../objects/catalog";
import { pushToast, session } from "../session";
import { computeMetrics, ratingTarget, type ParkMetrics } from "./rating";
import { placedList } from "../build/placement";

const BANKRUPT_LIMIT = 3;

/** The nominal `daily-upkeep` cycle carries no amount; the real cost is the live park metrics. */
const dailyUpkeepAmount: ResourcePolicy = (txn, ctx) => [
  { ...txn, amount: (ctx.vars.upkeep ?? 0) + (ctx.vars.restock ?? 0) },
];

/**
 * Settle one day's upkeep+restock through the shared scheduled-transaction ledger. The park
 * balance is re-seeded from live `cash` (absorbing the day's ticket/stall/build flows) before the
 * scheduled rule debits it, so the ledger stays authoritative for the recurring charge without
 * changing observable cash.
 */
export function settleDailyUpkeep(
  ledger: ResourceLedger,
  cash: number,
  upkeep: number,
  restock: number,
): { ledger: ResourceLedger; cash: number } {
  const seeded: ResourceLedger = { ...ledger, accounts: { ...ledger.accounts, park: { cash } } };
  const res = advanceLedger(seeded, seeded.nowSeconds + DAY_LENGTH, {
    vars: { upkeep, restock },
    policies: [dailyUpkeepAmount],
  });
  return { ledger: res.ledger, cash: balanceOf(res.ledger, "park", "cash") };
}

export function currentMetrics(): ParkMetrics {
  return computeMetrics(placedList());
}

export function restockCost(): number {
  let cost = 0;
  for (const obj of session.placed.values()) {
    const def = buildableDef(obj.catalogId);
    if (def.stall === undefined) continue;
    cost += (def.stall.stock - obj.stock) * def.stall.restock;
  }
  return cost;
}

function restockStalls(): void {
  for (const obj of session.placed.values()) {
    const def = buildableDef(obj.catalogId);
    if (def.stall !== undefined) obj.stock = def.stall.stock;
  }
}

export function economyDayTick(ctx: GameContext): void {
  const metrics = currentMetrics();
  const restock = restockCost();
  const total = metrics.dailyUpkeep + restock;
  const settled = settleDailyUpkeep(session.ledger, session.cash, metrics.dailyUpkeep, restock);
  session.ledger = settled.ledger;
  session.cash = settled.cash;
  restockStalls();
  session.upkeepYesterday = total;
  session.revenueYesterday = session.revenueToday;
  const net = session.revenueYesterday - total;
  const now = ctx.time.now();
  pushToast(
    `Day ${session.day}: ${net >= 0 ? "+" : ""}${Math.round(net)} net (${session.guestsToday} guests)`,
    net >= 0 ? "good" : "bad",
    now,
  );

  if (session.cash < 0) {
    session.bankruptDays += 1;
    if (session.bankruptDays >= BANKRUPT_LIMIT) {
      session.gameOver = true;
      setGamePhase(ctx, "ended");
      pushToast("Bankrupt! The park has closed for good.", "bad", now);
    } else {
      pushToast(`In the red — ${BANKRUPT_LIMIT - session.bankruptDays} day(s) to recover`, "bad", now);
    }
  } else {
    session.bankruptDays = 0;
  }

  session.day += 1;
  session.guestsToday = 0;
  session.revenueToday = 0;
}

export function tickRating(ctx: GameContext, dt: number, metrics: ParkMetrics): void {
  const target = ratingTarget(metrics, session.happinessAvg, session.guestsToday, session.litter);
  const ease = 1 - Math.exp(-dt * 0.25);
  session.rating += (target - session.rating) * ease;

  session.litter = Math.max(0, session.litter - metrics.cleaning * 0.01 * dt);

  const now = ctx.time.now();
  for (const milestone of MILESTONES) {
    if (session.rating >= milestone.rating && ctx.game.unlocks !== undefined && !ctx.game.unlocks.has(ctx.player.userId, milestone.unlock)) {
      ctx.game.unlocks.grant(ctx.player.userId, milestone.unlock);
      pushToast(`Milestone! Unlocked: ${milestone.label}`, "good", now);
    }
  }
}
