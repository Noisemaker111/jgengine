import {
  computeGameDay,
  DEFAULT_TIME_SCALE,
  sanitizeGameTimeScale,
  SECONDS_PER_GAME_DAY,
} from "@jgengine/core/time/gameClock";
import {
  computeBillDueAt,
  COOLANT_RATE_PER_KW,
  ELECTRICITY_RATE_PER_KW,
} from "@llmville/game/economy/billingRates";
import { cellRentForCount } from "@llmville/game/datacenter/claims";
import { getDailyModifier } from "@llmville/game/economy/dailyMarket";
import type { BillType } from "@llmville/game/economy/events";
import { computeRackHardwareStats } from "@llmville/game/infrastructure/infrastructure";
import {
  rackThermalInputs,
  type RackSnapshot,
} from "@llmville/game/infrastructure/infrastructure";
import {
  getInstalledRackCoolingWaterConsumption,
  getRackCoolerOverheadKw,
} from "@llmville/game/infrastructure/infrastructure";

export const GRACE_PERIOD_DAYS = 5;

export const APR_RATES: Record<BillType, number> = {
  electricity: 0.08,
  water: 0.06,
  rent: 0.12,
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatBillDateLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export interface DailyBillRow {
  billType: BillType;
  billCategory: "daily";
  description: string;
  amount: number;
  dueAt: number;
  gracePeriodDays: number;
  aprRate: number;
  lateFeeAccrued: number;
  isOverdue: boolean;
  billingPeriod: string;
  createdAt: number;
}

export interface DailyBillsInputs {
  now: number;
  createdAt: number;
  gameTimeScale: number | null | undefined;
  lastBilledGameDay: number | undefined;
  racks: readonly RackSnapshot[];
  hasActiveCompute: boolean;
  electricityBillMultiplier: number;
  claimedCellCount: number;
}

export type DailyBillsDecision =
  | { kind: "skip" }
  | { kind: "spawn"; gameDay: number; bills: DailyBillRow[] };

/** Bill once per game day (24 game hours). Skips the creation day and already-billed days. */
export function shouldSpawnDailyBills(args: {
  now: number;
  createdAt: number;
  gameTimeScale: number | null | undefined;
  lastBilledGameDay: number | undefined;
}): boolean {
  const timeScale = args.gameTimeScale ?? DEFAULT_TIME_SCALE;
  const currentGameDay = computeGameDay(args.createdAt, args.now, timeScale);
  const createdGameDay = computeGameDay(args.createdAt, args.createdAt, timeScale);
  return currentGameDay > Math.max(args.lastBilledGameDay ?? -1, createdGameDay);
}

export function computeDailyBills(inputs: DailyBillsInputs): DailyBillsDecision {
  const timeScale = inputs.gameTimeScale ?? DEFAULT_TIME_SCALE;
  const currentGameDay = computeGameDay(inputs.createdAt, inputs.now, timeScale);

  if (!shouldSpawnDailyBills(inputs)) return { kind: "skip" };

  const hw = computeRackHardwareStats(inputs.racks);
  const dueAt = computeBillDueAt(inputs.now, timeScale, GRACE_PERIOD_DAYS);
  const dateLabel = formatBillDateLabel(inputs.now);
  const bills: DailyBillRow[] = [];

  const addBill = (type: BillType, desc: string, amt: number) => {
    let base = amt;
    if (type === "electricity") base *= inputs.electricityBillMultiplier;
    bills.push({
      billType: type,
      billCategory: "daily",
      description: desc,
      amount: Math.max(type === "water" ? 5 : type === "electricity" ? 10 : 1, Math.floor(base)),
      dueAt,
      gracePeriodDays: GRACE_PERIOD_DAYS,
      aprRate: APR_RATES[type],
      lateFeeAccrued: 0,
      isOverdue: false,
      billingPeriod: dateLabel,
      createdAt: inputs.now,
    });
  };

  const coolingInputs = rackThermalInputs(inputs.racks);
  const coolingOverheadKw = getRackCoolerOverheadKw(coolingInputs);
  const kW = hw.totalPowerDrawWatts / 1000 + coolingOverheadKw;
  const dailyModifier = getDailyModifier(new Date(inputs.now));
  if (kW > 0 && inputs.hasActiveCompute) {
    addBill(
      "electricity",
      `${dateLabel} — Grid power for ${hw.totalInstalledGpus} GPU${hw.totalInstalledGpus !== 1 ? "s" : ""} + cooling (${kW.toFixed(1)} kW)`,
      kW * ELECTRICITY_RATE_PER_KW * dailyModifier.electricityMult,
    );
  }

  // Water bill only from cooling units that declare waterConsumption > 0 (bad water tiers + high-demand best tier).
  const waterUnits = getInstalledRackCoolingWaterConsumption(coolingInputs);
  if (waterUnits > 0) addBill("water", `${dateLabel} — Water for ${waterUnits} units of cooling`, waterUnits * COOLANT_RATE_PER_KW);

  if (inputs.claimedCellCount > 0) {
    addBill(
      "rent",
      `${dateLabel} — Datacenter rent for ${inputs.claimedCellCount} cell${inputs.claimedCellCount !== 1 ? "s" : ""}`,
      cellRentForCount(inputs.claimedCellCount),
    );
  }

  return { kind: "spawn", gameDay: currentGameDay, bills };
}

export function computeBillTotalDue(bill: { amount: number; lateFeeAccrued: number }): number {
  return bill.amount + bill.lateFeeAccrued;
}

function gameDayMs(timeScale: number | null | undefined): number {
  return (SECONDS_PER_GAME_DAY * 1000) / sanitizeGameTimeScale(timeScale);
}

export function isBillOverdue(bill: { dueAt: number }, now: number): boolean {
  return now > bill.dueAt;
}

export function gameDaysOverdue(
  bill: { dueAt: number },
  now: number,
  timeScale: number | null | undefined,
): number {
  return Math.max(0, (now - bill.dueAt) / gameDayMs(timeScale));
}

/** Late fees are recomputed from the overdue window, so re-running a pass never double-charges. */
export function computeBillLateFee(
  bill: { amount: number; aprRate: number; dueAt: number },
  now: number,
  timeScale: number | null | undefined,
): number {
  return Math.round(bill.amount * bill.aprRate * gameDaysOverdue(bill, now, timeScale) * 100) / 100;
}

export type BillAutoPayDecision =
  | { kind: "pay"; totalDue: number; lateFeeAccrued: number }
  | { kind: "defer"; totalDue: number; lateFeeAccrued: number }
  | { kind: "liquidate"; totalDue: number; lateFeeAccrued: number }
  | { kind: "insolvent"; totalDue: number; lateFeeAccrued: number };

/**
 * A bill the lab cannot pay is left unpaid and keeps accruing late fees. Past its grace period the lab
 * sells hardware to cover it, and only a debt that outruns every asset it owns is insolvency.
 */
export function decideBillAutoPay(input: {
  bill: { amount: number; aprRate: number; dueAt: number };
  now: number;
  timeScale: number | null | undefined;
  money: number;
  liquidationValue: number;
}): BillAutoPayDecision {
  const lateFeeAccrued = computeBillLateFee(input.bill, input.now, input.timeScale);
  const totalDue = input.bill.amount + lateFeeAccrued;
  if (input.money >= totalDue) return { kind: "pay", totalDue, lateFeeAccrued };
  if (!isBillOverdue(input.bill, input.now)) return { kind: "defer", totalDue, lateFeeAccrued };
  if (input.money + input.liquidationValue >= totalDue) {
    return { kind: "liquidate", totalDue, lateFeeAccrued };
  }
  return { kind: "insolvent", totalDue, lateFeeAccrued };
}

/** Oldest-first; unpayable bills are deferred with late fees, not fatal on their own. */
export function orderBillsForAutoPay<T extends { paidAt?: number; createdAt: number }>(
  bills: readonly T[],
): T[] {
  return bills.filter((bill) => !bill.paidAt).sort((a, b) => a.createdAt - b.createdAt);
}
