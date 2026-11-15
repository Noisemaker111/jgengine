/**
 * A night's orders as plain data: what waits on the board, what rides in the bag, how each box cools
 * and soaks, and what the customer pays. No scene, no clock of its own: the shift runtime feeds it
 * seconds, speeds and water, and this module answers with numbers the HUD and the receipt show.
 */
import { CUSTOMERS, customerById, LIGHTHOUSE_KEEPER, pizzaById, type Customer } from "./menu";
import { FLOOR_TIP, type DropFloor } from "../tide/tide";

export interface Order {
  /** Unique within a save: `o<serial>`. */
  id: string;
  customerId: string;
  pizzaId: string;
  /** 0–100: 100 is straight out of the oven. */
  heat: number;
  /** 0–100: how waterlogged the box is. */
  soak: number;
  /** Seconds the box has been on the road. */
  age: number;
  /** Seconds the customer counts as fast for this drop. */
  par: number;
  /** What the caller asked for on top: it bends the rules of this one box. */
  mod?: OrderMod;
  /** The catering booking this box belongs to (`regulars.ts`), if any. */
  catering?: string;
}

/**
 * A caller's extra request. Rush halves the par time and doubles the speed bonus; extra hot raises the
 * cold limit by twenty degrees and pays 30% more for meeting it; keep it dry counts every drop of soak
 * twice and pays 25% more for a dry box.
 */
export type OrderMod = "rush" | "extra_hot" | "keep_dry";

export const ORDER_MODS: Readonly<Record<OrderMod, { label: string; tip: number }>> = {
  rush: { label: "Rush", tip: 0.4 },
  extra_hot: { label: "Extra hot", tip: 0.3 },
  keep_dry: { label: "Keep it dry", tip: 0.25 },
};

/** The request a call carries, from a seeded roll: none for most calls, more often as reputation grows. */
export function rollMod(roll: number, rep: number): OrderMod | undefined {
  const chance = rep <= 0 ? 0 : Math.min(0.55, 0.15 + rep * 0.08);
  if (roll >= chance) return undefined;
  const pick = roll / chance;
  return pick < 0.34 ? "rush" : pick < 0.67 ? "extra_hot" : "keep_dry";
}

/** The oven, the bag and the toppings that shape every box this shift. */
export interface Kitchen {
  /** Heat a box leaves the oven at. */
  ovenHeat: number;
  /** Multiplier on the cooling rate: a better bag is lower. */
  bagCooling: number;
  /** Multiplier on every tip: better toppings, bigger tips. */
  toppingTips: number;
}

/** Heat lost per second in a stock bag on the street. */
export const BASE_COOLING = 0.55;
/** A blimp's altitude chills a box this much faster. */
export const ALTITUDE_COOLING = 1.45;
/** Ride speed (m/s) the par time assumes, plus a fixed allowance for the stairs. */
const PAR_SPEED = 8.5;
const PAR_ALLOWANCE = 25;

export function parSeconds(distance: number): number {
  return Math.round(distance / PAR_SPEED + PAR_ALLOWANCE);
}

/** One step of a box on the road: it cools, and water soaks into it. */
export function ageOrder(order: Order, dt: number, input: { kitchen: Kitchen; soakPerSecond: number; altitude: boolean }): Order {
  const step = Math.max(0, dt);
  const soakScale = order.mod === "keep_dry" ? 2 : 1;
  const cooling = BASE_COOLING * input.kitchen.bagCooling * (input.altitude ? ALTITUDE_COOLING : 1);
  return {
    ...order,
    age: order.age + step,
    heat: Math.max(0, order.heat - cooling * step),
    soak: Math.min(100, order.soak + Math.max(0, input.soakPerSecond) * soakScale * step),
  };
}

export interface TipLine {
  label: string;
  amount: number;
}

export interface Settlement {
  price: number;
  tip: number;
  total: number;
  lines: TipLine[];
  /** How the customer felt, for their thank-you line. */
  verdict: "great" | "fine" | "bad";
}

/** Extra tip per extra box in the bag when it lands: stacking pays, if you can keep them hot. */
export const STACK_BONUS = 0.15;

/**
 * What a delivered box pays: the menu price always, and a tip that is the customer's own perfect tip
 * scaled by heat, dryness and speed, plus the floor they came down from and the stack it rode in.
 */
export function settleOrder(order: Order, input: { kitchen: Kitchen; floor: DropFloor; stack: number }): Settlement {
  const customer = customerById(order.customerId);
  const pizza = pizzaById(order.pizzaId);
  const price = pizza?.price ?? 15;
  const perfect = price * 0.8 * (customer?.tipMultiplier ?? 1) * input.kitchen.toppingTips;
  const cold = order.heat < coldLimitOf(order);
  const heat = cold ? 0 : Math.pow(order.heat / 100, 1.2);
  const dry = 1 - order.soak / 100;
  const late = Math.max(0, order.age - order.par);
  const fastBonus = order.mod === "rush" ? 1.5 : 1.25;
  const speed = order.age <= order.par ? fastBonus : Math.max(0.5, 1.25 - late / 60);
  const base = perfect * heat * dry * speed;
  const floor = base * FLOOR_TIP[input.floor];
  const stack = base * STACK_BONUS * Math.max(0, input.stack - 1);
  const lines: TipLine[] = [{ label: pizza?.label ?? "Pizza", amount: price }];
  const push = (label: string, amount: number) => {
    const rounded = Math.round(amount);
    if (rounded !== 0) lines.push({ label, amount: rounded });
  };
  push(cold ? "Too cold to tip" : `Tip · ${Math.round(order.heat)}° hot`, base);
  if (input.floor !== "door") push(input.floor === "rooftop" ? "Rooftop basket" : "Balcony drop", floor);
  // The request pays only when it was met: on time for a rush, hot enough, dry enough.
  const met = order.mod === "rush" ? order.age <= order.par : order.mod === "extra_hot" ? !cold : order.mod === "keep_dry" ? order.soak < 15 : false;
  if (order.mod !== undefined && met) push(ORDER_MODS[order.mod].label, base * ORDER_MODS[order.mod].tip);
  if (input.stack > 1) push(`Stack of ${input.stack}`, stack);
  const tip = lines.slice(1).reduce((sum, line) => sum + line.amount, 0);
  const verdict = cold || order.soak > 60 ? "bad" : order.heat >= 70 && order.soak < 20 && order.age <= order.par ? "great" : "fine";
  return { price, tip, total: price + tip, lines, verdict };
}

/** The heat below which this box's customer pays no tip: their own limit, raised for an extra-hot order. */
export function coldLimitOf(order: Order): number {
  return (customerById(order.customerId)?.coldLimit ?? 25) + (order.mod === "extra_hot" ? 20 : 0);
}

/** The hottest box in the bag: the one a rival rider grabs. */
export function hottest(orders: readonly Order[]): Order | undefined {
  let best: Order | undefined;
  for (const order of orders) if (best === undefined || order.heat > best.heat) best = order;
  return best;
}

/** Who may call right now: reputation and the hour gate them, and nobody calls twice at once. */
export function callableCustomers(input: { rep: number; hour: number; busy: ReadonlySet<string> }): Customer[] {
  return CUSTOMERS.filter((customer) => customer.minRep <= input.rep && input.hour >= customer.fromHour && !input.busy.has(customer.id));
}

/**
 * The next caller, picked from a seeded roll: Ida first whenever she is free (she always calls, and
 * always from the far end of the map), otherwise any callable customer.
 */
export function nextCaller(input: { rep: number; hour: number; busy: ReadonlySet<string>; roll: number; idaDue: boolean }): Customer | null {
  const pool = callableCustomers(input);
  if (pool.length === 0) return null;
  const ida = pool.find((customer) => customer.id === LIGHTHOUSE_KEEPER);
  if (ida !== undefined && input.idaDue) return ida;
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(0.9999, input.roll)) * pool.length));
  return pool[index] ?? null;
}

/** Reputation stars (0–5) from the career's good deliveries. */
export const REP_THRESHOLDS = [0, 4, 10, 18, 30, 45] as const;

export function repStars(goodDeliveries: number): number {
  let stars = 0;
  REP_THRESHOLDS.forEach((needed, index) => {
    if (goodDeliveries >= needed) stars = index;
  });
  return stars;
}
