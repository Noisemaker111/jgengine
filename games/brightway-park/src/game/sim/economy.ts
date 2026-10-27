import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { BOOK_LINES, MONTH_DAYS, monthLabel, parkDate } from "../books";
import { LOAN, linesNet, monthLine, park, reportLine, type ParkMetrics } from "../park";
import { syncAmbience } from "../audio";
import { closeParkDay } from "../daySession";
import { milestonesCrossed } from "../milestones";
import { ratingTarget } from "./rating";

/**
 * The park's day and month, on the world. Money moves continuously (the `upkeep_*` flows and the
 * `pay_*` ripples), so midnight only restocks the stalls (their `restock_*` action) and files the
 * day's takings. Every `MONTH_DAYS` days the month closes: the loan's interest (the `interest`
 * ripple), the month's report, and the till's check.
 */

/** Month-ends in a row in the red that close the park. */
export const RED_MONTH_LIMIT = 2;

/** Close the day at midnight: restock, the day's summary, and the month's close when it ends. */
export function closeDay(ctx: GameContext): void {
  const w = park.of(ctx);
  if (w.fact("park.game_over") === true) return;
  for (const instance of w.instances()) {
    const restock = `restock_${instance.kind}`;
    if (w.def.actions?.[restock] !== undefined && w.num(`${instance.id}.sold`) > 0 && w.canAct(restock, instance.id) === null) {
      w.act(restock, instance.id);
    }
  }

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
  });

  // The day's boundary is the session loop's: closing it republishes the day number.
  closeParkDay(ctx);
  const day = w.num("park.day");
  if ((day - 1) % MONTH_DAYS === 0) closeMonth(ctx, parkDate(day - 1).monthIndex);
  else if (w.num("park.cash") < 0) {
    const left = MONTH_DAYS - parkDate(day).dayOfMonth + 1;
    ctx.game.notices.push({ text: `In the red: ${left} day${left === 1 ? "" : "s"} to the month's books`, tone: "warn" });
  }
}

/**
 * Close a month: charge the loan's interest, file every line of the books as `report.*` (with
 * building and land as what is left of the till's change), start the next month's lines at zero,
 * and count a month that ends in the red. The second in a row closes the park.
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
    ctx.game.notices.push({ text: `${name} closed: ${profit < 0 ? "lost" : "made"} $${Math.abs(Math.round(profit)).toLocaleString()}${interest > 0 ? ` after $${interest} loan interest` : ""}`, tone: profit < 0 ? "warn" : "success" });
    return;
  }
  w.change({ "park.red_months": 1 });
  const red = w.num("park.red_months");
  if (red < RED_MONTH_LIMIT) {
    ctx.game.notices.push({ text: `${name} closed in the red. Another red month closes the park: borrow, cut costs or raise prices.`, tone: "warn" });
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
 * How fast the rating follows the park, per second: about a minute and a half to close two thirds of
 * the gap, so a change shows over the rest of the day rather than in seconds.
 */
export const RATING_EASE = 0.012;

/** The rating eases toward its target; its best-ever value is `park.peak`, and each award crossed pays once. */
export function tickRating(ctx: GameContext, dt: number, metrics: ParkMetrics): void {
  const w = park.of(ctx);
  // The crowd the rating judges: today's visitors, or the guests still inside across midnight.
  const crowd = Math.max(w.num("park.guests_today"), w.num("park.guests"));
  const target = ratingTarget(metrics, w.num("park.mood"), crowd, w.num("park.litter"), w.num("park.complaints"));
  const before = w.num("park.rating");
  const rating = before + (target - before) * (1 - Math.exp(-dt * RATING_EASE));
  w.set("park.rating", rating);
  const peak = w.num("park.peak");
  if (rating <= peak) return;
  w.set("park.peak", rating);
  for (const milestone of milestonesCrossed(peak, rating)) {
    w.emit({ kind: "award", scale: milestone.prize });
    ctx.game.notices.push({ text: `Award! ${milestone.label} — $${milestone.prize.toLocaleString()} prize`, tone: "success" });
    ctx.game.audio.play("milestone");
  }
}
