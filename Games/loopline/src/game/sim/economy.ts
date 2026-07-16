import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { balance, charge } from "@jgengine/core/economy/wallet";

import { CASH, MILESTONES } from "../catalog";
import { buildableDef } from "../objects/catalog";
import { pushToast, session } from "../session";
import { computeMetrics, ratingTarget, type ParkMetrics } from "./rating";
import { placedList } from "../build/placement";

const BANKRUPT_LIMIT = 3;

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
  if (total > 0) {
    const charged = charge(session.wallet, CASH, total, { overdraft: true });
    if (charged.status === "ok") session.wallet = charged.state;
  }
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

  if (balance(session.wallet, CASH) < 0) {
    session.bankruptDays += 1;
    if (session.bankruptDays >= BANKRUPT_LIMIT) {
      session.gameOver = true;
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
