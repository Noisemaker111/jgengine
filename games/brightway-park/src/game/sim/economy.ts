import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { BOOK_LINES, MONTH_DAYS, monthLabel, parkDate } from "../books";
import { LOAN, linesNet, monthLine, park, reportLine, type ParkMetrics } from "../park";
import { syncAmbience } from "../audio";
import { closeParkDay } from "../daySession";
import { milestonesCrossed } from "../milestones";
import { ratingTarget } from "./rating";
import { noonExorcism } from "../threats";
import { ecto } from "../ecto";

/**
 * The haunt's night and moon, on the world. Ectoplasm moves continuously (the `upkeep_*` and
 * `seep_*` flows and the `pay_*` ripples), so noon - when the living are gone - only restocks the
 * stalls (their `restock_*` action), lets the exorcist in if the hunters' evidence is full, and
 * files the night's harvest. Every `MONTH_DAYS` nights the moon closes: the Ferryman's interest
 * (the `interest` ripple), the moon's ledger, and the vault's check.
 */

/** Moon-ends in a row with the vault empty that make the haunt fade. */
export const RED_MONTH_LIMIT = 2;

/** Close the night at noon: restock, the exorcist, the night's summary, and the moon's close when it ends. */
export function closeDay(ctx: GameContext): void {
  const w = park.of(ctx);
  if (w.fact("park.game_over") === true) return;
  for (const instance of w.instances()) {
    const restock = `restock_${instance.kind}`;
    if (w.def.actions?.[restock] !== undefined && w.num(`${instance.id}.sold`) > 0 && w.canAct(restock, instance.id) === null) {
      w.act(restock, instance.id);
    }
  }

  noonExorcism(ctx);
  const revenue = w.num("park.revenue_today");
  const spent = w.num("park.spent_today");
  // The day's net shows on the next gate-open banner; no toast for it.
  ctx.game.audio.play("settle");
  w.change({
    "park.revenue_yesterday": revenue - w.num("park.revenue_yesterday"),
    "park.upkeep_yesterday": spent - w.num("park.upkeep_yesterday"),
    "park.revenue_today": -revenue,
    "park.spent_today": -spent,
    "park.guests_today": -w.num("park.guests_today"),
    "park.screams_today": -w.num("park.screams_today"),
    "park.best_chain": -w.num("park.best_chain"),
  });

  // The day's boundary is the session loop's: closing it republishes the day number.
  closeParkDay(ctx);
  const day = w.num("park.day");
  if ((day - 1) % MONTH_DAYS === 0) closeMonth(ctx, parkDate(day - 1).monthIndex);
  else if (w.num("park.cash") < 0) {
    const left = MONTH_DAYS - parkDate(day).dayOfMonth + 1;
    ctx.game.notices.push({ text: `The vault is dry: ${left} night${left === 1 ? "" : "s"} until the moon's ledger closes`, tone: "warn" });
  }
}

/**
 * Close a moon: charge the Ferryman's interest, file every line of the ledger as `report.*` (with
 * building and land as what is left of the vault's change), start the next moon's lines at zero,
 * and count a moon that ends with the vault dry. The second in a row and the haunt fades.
 */
export function closeMonth(ctx: GameContext, monthIndex: number): void {
  const w = park.of(ctx);
  const owed = w.num("park.loan_owed");
  const interest = Math.round(owed * LOAN.monthlyRate);
  if (interest > 0) w.emit({ kind: "interest", scale: interest });

  const cash = w.num("park.cash");
  const profit = cash - w.num("month.cash_start");
  const changes: Record<string, number> = { "month.cash_start": profit };
  // Building and land is what the lines don't explain: placements, removals' refunds and terrain.
  changes["report.building"] = linesNet(w, monthLine) - profit - w.num("report.building");
  for (const line of BOOK_LINES) {
    const amount = w.num(monthLine(line.id));
    changes[reportLine(line.id)] = amount - w.num(reportLine(line.id));
    changes[monthLine(line.id)] = -amount;
  }
  changes["report.profit"] = profit - w.num("report.profit");
  changes["report.month"] = monthIndex - w.num("report.month");
  w.change(changes);

  const name = monthLabel(monthIndex);
  if (cash >= 0) {
    if (w.num("park.red_months") > 0) w.change({ "park.red_months": -w.num("park.red_months") });
    ctx.game.notices.push({ text: `The ledger for ${name} is closed: ${profit < 0 ? "lost" : "gathered"} ${ecto(Math.abs(profit))}${interest > 0 ? ` after ${ecto(interest)} to the Ferryman` : ""}`, tone: profit < 0 ? "warn" : "success" });
    return;
  }
  w.change({ "park.red_months": 1 });
  const red = w.num("park.red_months");
  if (red < RED_MONTH_LIMIT) {
    ctx.game.notices.push({ text: `${name} closed with the vault dry. Another dry moon and the haunt fades: borrow from the Ferryman, cut upkeep or turn the rides up.`, tone: "warn" });
    return;
  }
  w.set("park.game_over", true);
  w.set("park.open", false);
  ctx.time.pause();
  setGamePhase(ctx, "ended");
  syncAmbience(ctx);
  ctx.game.audio.play("bankrupt");
}

/**
 * How fast the rumor follows the park, per second: about a minute and a half to close two thirds of
 * the gap, so a change shows over the rest of the night rather than in seconds.
 */
export const RATING_EASE = 0.012;

/** The rumor eases toward its target; its best-ever value is `park.peak`, and each award crossed pays once. */
export function tickRating(ctx: GameContext, dt: number, metrics: ParkMetrics): void {
  const w = park.of(ctx);
  // The crowd the rating judges: today's visitors, or the guests still inside across midnight.
  const crowd = Math.max(w.num("park.guests_today"), w.num("park.guests"));
  const target = ratingTarget(metrics, w.num("park.mood"), crowd, w.num("park.litter"), w.num("park.complaints"), w.num("park.screams_today"), w.num("park.ghosts"));
  const before = w.num("park.rating");
  const rating = before + (target - before) * (1 - Math.exp(-dt * RATING_EASE));
  w.set("park.rating", rating);
  const peak = w.num("park.peak");
  if (rating <= peak) return;
  w.set("park.peak", rating);
  for (const milestone of milestonesCrossed(peak, rating)) {
    w.emit({ kind: "award", scale: milestone.prize });
    ctx.game.notices.push({ text: `The rumor spreads: ${milestone.label}! ${ecto(milestone.prize)} prize`, tone: "success" });
    ctx.game.audio.play("milestone");
  }
}
