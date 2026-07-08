import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DAY_LENGTH } from "./calendar";
import { record } from "./chronicle";
import { historyRng } from "./rng";
import { settlements } from "./settlements";

const DAILY_DRIFT_FRACTION = 0.006;
const MIN_POPULATION = 20;
const MAX_POPULATION_MULTIPLIER = 8;
const HARVEST_INTERVAL_DAYS = 90;
const HARVEST_SWING_FRACTION = 0.05;

let pools = new Map<string, number>();
let caps = new Map<string, number>();

export function initPools(): void {
  pools = new Map(settlements.map((settlement) => [settlement.id, settlement.population]));
  caps = new Map(settlements.map((settlement) => [settlement.id, settlement.population * MAX_POPULATION_MULTIPLIER]));
}

export function populationOf(settlementId: string): number {
  return pools.get(settlementId) ?? 0;
}

export function totalPopulation(): number {
  let sum = 0;
  for (const value of pools.values()) sum += value;
  return sum;
}

function applyDrift(settlementId: string, delta: number): number {
  const current = pools.get(settlementId) ?? 0;
  const cap = caps.get(settlementId) ?? Number.POSITIVE_INFINITY;
  const next = Math.min(cap, Math.max(MIN_POPULATION, Math.round(current + delta)));
  pools.set(settlementId, next);
  return next;
}

export function tickDailyDrift(): void {
  for (const settlement of settlements) {
    const current = pools.get(settlement.id) ?? settlement.population;
    const drift = (historyRng() - 0.45) * DAILY_DRIFT_FRACTION * current;
    applyDrift(settlement.id, drift);
  }
}

function harvestQuality(yieldFactor: number): string {
  if (yieldFactor < 0.95) return "lean";
  if (yieldFactor > 1.1) return "bountiful";
  return "steady";
}

export function tickHarvest(ctx: GameContext): void {
  for (const settlement of settlements) {
    const current = pools.get(settlement.id) ?? settlement.population;
    const yieldFactor = 0.85 + historyRng() * 0.3;
    applyDrift(settlement.id, (yieldFactor - 1) * HARVEST_SWING_FRACTION * current);
    record(ctx, "harvest", `${settlement.name} brings in a ${harvestQuality(yieldFactor)} harvest.`);
  }
}

export function scheduleSim(ctx: GameContext): void {
  ctx.time.every(DAY_LENGTH, tickDailyDrift);
  ctx.time.every(HARVEST_INTERVAL_DAYS * DAY_LENGTH, () => tickHarvest(ctx));
}
