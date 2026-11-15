/**
 * The longer life of the shop beyond one night: regulars who come to love Vell's, the weekend rush,
 * and catering events that send one order to several doors. Plain data and pure functions; the shift
 * runtime (`shift.ts`) reads them when calls land, when boxes are handed over and when a night closes.
 */
import type { Pizza } from "./menu";

// --- Regulars -----------------------------------------------------------------------------------

/** How far a customer has come: each good drop to them counts once. */
export interface LoyaltyTier {
  id: "regular" | "favourite";
  label: string;
  /** Good deliveries to this customer that reach the tier. */
  at: number;
  /** Extra share of the tip they leave once there. */
  tip: number;
}

export const LOYALTY_TIERS: readonly LoyaltyTier[] = [
  { id: "regular", label: "Regular", at: 3, tip: 0.1 },
  { id: "favourite", label: "Favourite", at: 7, tip: 0.2 },
];

/** The tier a customer with `count` good deliveries has reached, or null. */
export function loyaltyTier(count: number): LoyaltyTier | null {
  let reached: LoyaltyTier | null = null;
  for (const tier of LOYALTY_TIERS) if (count >= tier.at) reached = tier;
  return reached;
}

/** The tier this delivery tips a customer into (the count before and after), or null. */
export function loyaltyStep(before: number, after: number): LoyaltyTier | null {
  const was = loyaltyTier(before);
  const now = loyaltyTier(after);
  return now !== null && now.id !== was?.id ? now : null;
}

/**
 * Nonna's secret menu: off the board, made only for a favourite who has earned it. Each favourite
 * orders their own secret pie in place of their usual first box, and it pays like a feast.
 */
export const SECRET_PIZZAS: Readonly<Record<string, Pizza>> = {
  gus: { id: "secret_watchman", label: "The Night Watch (secret)", price: 44 },
  okafor_twins: { id: "secret_twin_stack", label: "Twin Stack (secret)", price: 42 },
  lou_houseboat: { id: "secret_bilge", label: "Bilge Pump Bianca (secret)", price: 46 },
  theo_dj: { id: "secret_bassline", label: "Bassline Diavola (secret)", price: 45 },
  nonna_club: { id: "secret_grandmaster", label: "Grandmaster Quattro (secret)", price: 48 },
  wedding: { id: "secret_first_dance", label: "First Dance Rosa (secret)", price: 55 },
  captain_brine: { id: "secret_depth_charge", label: "Depth Charge (secret)", price: 52 },
  ida_faro: { id: "secret_beacon", label: "The Beacon (secret)", price: 50 },
  kid_pepper: { id: "secret_pocket_money", label: "Pocket Money Pepperoni (secret)", price: 40 },
  mo_bridge: { id: "secret_drawbridge", label: "Drawbridge Calzone (secret)", price: 46 },
  night_nurses: { id: "secret_night_shift", label: "Night Shift Verde (secret)", price: 44 },
  yacht_party: { id: "secret_champagne", label: "Champagne Crust (secret)", price: 58 },
};

/** A favourite's order: their secret pie first, then the rest of their usual. */
export function orderFor(customerId: string, usual: readonly string[], count: number): readonly string[] {
  const secret = SECRET_PIZZAS[customerId];
  if (secret === undefined || loyaltyTier(count)?.id !== "favourite" || usual.length === 0) return usual;
  return [secret.id, ...usual.slice(1)];
}

/** The secret pie with this id, for prices and labels. */
export function secretPizzaById(id: string): Pizza | undefined {
  return Object.values(SECRET_PIZZAS).find((pizza) => pizza.id === id);
}

// --- The weekend rush ---------------------------------------------------------------------------

/** Nights 6 and 7 of every week (the shop's Saturday and Sunday) are the weekend rush. */
export function weekendRush(shiftsWorked: number): boolean {
  return shiftsWorked % 7 >= 5;
}

/** What the weekend rush does: calls ring faster, the crowd tips more, MegaSlice expects more. */
export const WEEKEND = { callScale: 0.7, tipScale: 1.15, quotaScale: 1.2, label: "Weekend rush" } as const;

// --- Catering events ----------------------------------------------------------------------------

/** A catering event: one booking delivered to several doors, with a bonus if every box lands in time. */
export interface CateringEvent {
  id: string;
  label: string;
  /** Doors, in the order the booking lists them (any order delivers). */
  drops: readonly string[];
  /** One box per door. */
  pizza: string;
  /** Paid on the last drop if it lands inside the window. */
  bonus: number;
  /** Game seconds from loading the first box to the last drop. */
  window: number;
}

export const CATERING_EVENTS: readonly CateringEvent[] = [
  { id: "harbour_wedding", label: "Harbourside wedding", drops: ["wedding", "yacht_party", "lou_houseboat"], pizza: "wedding_cake", bonus: 160, window: 300 },
  { id: "night_market", label: "Night-market staff supper", drops: ["okafor_twins", "kid_pepper", "mo_bridge"], pizza: "neon_diavola", bonus: 110, window: 260 },
  { id: "hospital_shift", label: "Hospital shift change", drops: ["night_nurses", "gus", "nonna_club"], pizza: "lighthouse_white", bonus: 130, window: 280 },
];

/** Whether tonight books a catering event, and which: every weekend night, and every fourth night besides. */
export function cateringTonight(shiftsWorked: number): CateringEvent | null {
  if (!weekendRush(shiftsWorked) && shiftsWorked % 4 !== 2) return null;
  return CATERING_EVENTS[shiftsWorked % CATERING_EVENTS.length] ?? null;
}

/** Progress on tonight's booking. */
export interface CateringRun {
  id: string;
  /** Doors still owed a box. */
  remaining: string[];
  /** Game time the first box left the oven, or null before it does. */
  startedAt: number | null;
  done: boolean;
}

/** A drop to `customerId` for a running booking: the doors left, and whether this closes it in time. */
export function cateringDrop(event: CateringEvent, run: CateringRun, customerId: string, now: number): { run: CateringRun; bonus: number } {
  if (run.done || !run.remaining.includes(customerId)) return { run, bonus: 0 };
  const remaining = run.remaining.filter((id) => id !== customerId);
  if (remaining.length > 0) return { run: { ...run, remaining }, bonus: 0 };
  const inTime = run.startedAt !== null && now - run.startedAt <= event.window;
  return { run: { ...run, remaining, done: true }, bonus: inTime ? event.bonus : 0 };
}
