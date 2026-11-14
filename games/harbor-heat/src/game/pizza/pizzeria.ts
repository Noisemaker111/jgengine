/**
 * Vell's Pizzeria, the family shop: what the tips buy and what is at stake. Plain data and pure
 * functions; the shift runtime keeps the numbers in a store and the counter board spends them.
 *
 * The family owes the bank, and MegaSlice bought the note. Every night the chain leans harder unless
 * the shift brings in the night's quota; pay the note off and the shop is saved.
 */
import type { Kitchen } from "./orders";

export type UpgradeKind = "oven" | "toppings" | "bag";

export interface UpgradeTier {
  label: string;
  /** Price of buying this tier; tier 1 is what the shop starts with. */
  cost: number;
}

export interface UpgradeTrack {
  kind: UpgradeKind;
  label: string;
  /** What each step does, for the board. */
  blurb: string;
  tiers: readonly UpgradeTier[];
}

export const UPGRADES: Readonly<Record<UpgradeKind, UpgradeTrack>> = {
  oven: {
    kind: "oven",
    label: "Ovens",
    blurb: "Another oven: one more box per run and orders land faster.",
    tiers: [
      { label: "Nonna's old brick oven", cost: 0 },
      { label: "Second deck oven", cost: 900 },
      { label: "Wood-fired dome", cost: 2400 },
      { label: "Twin conveyor line", cost: 5500 },
    ],
  },
  toppings: {
    kind: "toppings",
    label: "Toppings",
    blurb: "Better toppings: every tip is bigger.",
    tiers: [
      { label: "Tinned and trusty", cost: 0 },
      { label: "Market basil & buffalo", cost: 700 },
      { label: "Truffle & hot honey", cost: 1800 },
      { label: "Nonna's secret sauce", cost: 4500 },
    ],
  },
  bag: {
    kind: "bag",
    label: "Thermal bags",
    blurb: "A better bag: boxes stay hot for longer.",
    tiers: [
      { label: "Cardboard and hope", cost: 0 },
      { label: "Quilted thermal bag", cost: 500 },
      { label: "Heated insulated box", cost: 1500 },
    ],
  },
};

/** Boxes a run can carry and seconds between calls, by oven tier (1-based). */
const OVEN_CAPACITY = [1, 2, 3, 4] as const;
const OVEN_INTERVAL = [30, 24, 19, 15] as const;
const OVEN_HEAT = [92, 95, 98, 100] as const;
const TOPPING_TIPS = [1, 1.25, 1.5, 1.8] as const;
const BAG_COOLING = [1, 0.72, 0.5] as const;

export interface PizzeriaState {
  oven: number;
  toppings: number;
  bag: number;
  /** What the family still owes on the note MegaSlice holds. */
  debt: number;
  /** 0–100: how close MegaSlice is to forcing the sale. */
  pressure: number;
  /** Shifts closed, for the quota and the receipt. */
  shifts: number;
  /** Deliveries that landed hot and dry enough to please: the reputation the stars read. */
  goodDeliveries: number;
  /** All deliveries ever made. */
  deliveries: number;
  /** Times MegaSlice called the note in. */
  foreclosures: number;
  /** The note is paid: the shop is the family's. */
  saved: boolean;
  /** First-time lessons the rider has already been told. */
  hints?: string[];
  /** Career tallies the story chapters read (absent in older saves, read as 0). */
  swaps?: number;
  hullDrops?: number;
  stackDrops?: number;
  shaken?: number;
  upstairsDrops?: number;
  /** Cash paid toward the note, ever. */
  paid?: number;
}

export const STARTING_DEBT = 7000;

export function freshPizzeria(): PizzeriaState {
  return { oven: 1, toppings: 1, bag: 1, debt: STARTING_DEBT, pressure: 20, shifts: 0, goodDeliveries: 0, deliveries: 0, foreclosures: 0, saved: false };
}

export function ovenCapacity(state: PizzeriaState): number {
  return OVEN_CAPACITY[Math.max(0, Math.min(OVEN_CAPACITY.length - 1, state.oven - 1))]!;
}

export function callInterval(state: PizzeriaState): number {
  return OVEN_INTERVAL[Math.max(0, Math.min(OVEN_INTERVAL.length - 1, state.oven - 1))]!;
}

export function kitchenOf(state: PizzeriaState): Kitchen {
  return {
    ovenHeat: OVEN_HEAT[Math.max(0, Math.min(OVEN_HEAT.length - 1, state.oven - 1))]!,
    toppingTips: TOPPING_TIPS[Math.max(0, Math.min(TOPPING_TIPS.length - 1, state.toppings - 1))]!,
    bagCooling: BAG_COOLING[Math.max(0, Math.min(BAG_COOLING.length - 1, state.bag - 1))]!,
  };
}

/** The next tier on a track and its price, or null at the top. */
export function nextTier(state: PizzeriaState, kind: UpgradeKind): { tier: number; label: string; cost: number } | null {
  const track = UPGRADES[kind];
  const tier = state[kind] + 1;
  const def = track.tiers[tier - 1];
  return def === undefined ? null : { tier, label: def.label, cost: def.cost };
}

export function buyUpgrade(state: PizzeriaState, kind: UpgradeKind): PizzeriaState {
  const next = nextTier(state, kind);
  if (next === null) return state;
  return { ...state, [kind]: next.tier };
}

/** Pay toward the note; the shop is saved when it reaches zero. */
export function payDebt(state: PizzeriaState, amount: number): PizzeriaState {
  const paid = Math.max(0, Math.min(state.debt, Math.floor(amount)));
  const debt = state.debt - paid;
  return { ...state, debt, paid: (state.paid ?? 0) + paid, saved: state.saved || debt === 0, pressure: debt === 0 ? 0 : Math.max(0, state.pressure - Math.floor(paid / 250)) };
}

/**
 * The takings a shift must bring in to keep MegaSlice back. It climbs with each night worked, and its
 * ceiling rises with the kitchen: the bigger the shop, the more the chain expects it to make.
 */
export function nightlyQuota(state: PizzeriaState): number {
  return Math.min(QUOTA_CEILING_BASE + QUOTA_CEILING_PER_OVEN * (state.oven - 1), QUOTA_START + state.shifts * QUOTA_STEP);
}

/** The first night's quota, its nightly climb, and the ceiling for each oven tier past the first. */
export const QUOTA_START = 140;
export const QUOTA_STEP = 25;
export const QUOTA_CEILING_BASE = 190;
export const QUOTA_CEILING_PER_OVEN = 120;

export interface ShiftClose {
  state: PizzeriaState;
  quota: number;
  metQuota: boolean;
  /** MegaSlice called the note in tonight: the debt grows and the pressure resets. */
  foreclosed: boolean;
  headline: string;
}

/** Penalty MegaSlice adds to the note when it calls it in. */
export const FORECLOSURE_FEE = 1500;

/** Close a shift: meet the quota and MegaSlice backs off; miss it and they lean in. */
export function closeShift(state: PizzeriaState, takings: number): ShiftClose {
  const quota = nightlyQuota(state);
  const metQuota = takings >= quota;
  let pressure = state.saved ? 0 : Math.max(0, Math.min(100, state.pressure + (metQuota ? -12 : 18)));
  let debt = state.debt;
  let foreclosures = state.foreclosures;
  const foreclosed = !state.saved && pressure >= 100;
  if (foreclosed) {
    debt += FORECLOSURE_FEE;
    pressure = 55;
    foreclosures += 1;
  }
  const next: PizzeriaState = { ...state, shifts: state.shifts + 1, pressure, debt, foreclosures };
  const headline = state.saved
    ? "The shop is the family's. Every tip is yours now."
    : foreclosed
      ? `MegaSlice called the note in. +$${FORECLOSURE_FEE} on the debt.`
      : metQuota
        ? "Quota made. MegaSlice's man left without a word."
        : "Short of quota. MegaSlice's man left his card on the counter.";
  return { state: next, quota, metQuota, foreclosed, headline };
}
