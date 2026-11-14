/**
 * A whole career played on paper: a competent rider working shift after shift with the game's own
 * numbers (callers, menu, ovens, bags, toppings, tips, the tide, the quota, the story's chapter cash and
 * the note) until the shop is saved. No scene: travel is distance over a vehicle's working speed, a box
 * cools while it rides, and each night closes against MegaSlice's quota. `career.test.ts` asserts the
 * pacing; the numbers it prints are the balance sheet the plan quotes.
 */
import { findEditorMarker } from "@jgengine/core/editor/index";
import { editorLayers } from "../../editorLayers";
import { DAY_SECONDS } from "../clock";
import { VEHICLES } from "../entities/vehicles/catalog";
import { districtAt } from "../world/districts";
import { CANAL_DEPTH, districtDepth, dropFloor, SHIFT_END_HOUR, SHIFT_START_HOUR, tideLevelAt } from "../tide/tide";
import { customerById } from "./menu";
import { ageOrder, nextCaller, parSeconds, repStars, settleOrder, type Order } from "./orders";
import { buyUpgrade, callInterval, closeShift, freshPizzeria, kitchenOf, nextTier, ovenCapacity, payDebt, type PizzeriaState, type UpgradeKind } from "./pizzeria";
import { BOARD_SIZE, CALL_PATIENCE } from "./shift";

const OVEN = (() => {
  const marker = findEditorMarker(editorLayers, "pizzeria_oven")!;
  return [marker.position.x, marker.position.z] as const;
})();

function spotOf(customerId: string): readonly [number, number] {
  const marker = findEditorMarker(editorLayers, customerById(customerId)!.marker)!;
  return [marker.position.x, marker.position.z];
}

/** Working speeds through real streets (corners, traffic, docks), m/s. */
const SPEED = { scooter: 13, trike: 11, jetski: 15, blimp: 20 } as const;
/** Seconds at the oven window and at each door. */
const HANDLING = 12;
/** Extra seconds to reach a swap dock and change vehicles when the route floods. */
const SWAP_DETOUR = 35;
/** Cash the rider keeps in hand for tows and gear. */
const RESERVE = 150;

/** Chapter cash the story pays (src/game/city.ts), in the order a career earns it. */
const CHAPTER_CASH = [
  { id: "welcome", cash: 150 },
  { id: "learn_water", cash: 300 },
  { id: "crust_war", cash: 500 },
  { id: "festival_night", cash: 900 },
  { id: "riptide_run", cash: 700 },
  { id: "storm_surge", cash: 1200 },
  { id: "megaslice_man", cash: 0 },
  { id: "blackout", cash: 1500 },
] as const;

export interface CareerNight {
  night: number;
  delivered: number;
  takings: number;
  quota: number;
  quotaMet: boolean;
  bought: string[];
  paid: number;
  debt: number;
  rep: number;
}

export interface CareerResult {
  nights: CareerNight[];
  savedOn: number | null;
  totalTakings: number;
  /** Story chapters cleared before Save Vell's (of eight). */
  chapters: number;
  foreclosures: number;
}

interface Call {
  customerId: string;
  pizzas: readonly string[];
  calledAt: number;
}

/** Seconds of the shift, in game seconds (a shift is six game hours). */
const SHIFT_SECONDS = ((SHIFT_END_HOUR - SHIFT_START_HOUR) / 24) * DAY_SECONDS;

function roll(n: number): number {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Seconds for one leg on the fastest thing the rider owns, including a swap-dock detour when it floods. */
function legSeconds(distance: number, depth: number, owned: ReadonlySet<string>, kingRooftop: boolean, waterOnly: boolean): number {
  if (kingRooftop) return owned.has("air_helicopter") ? distance / SPEED.blimp : distance / SPEED.jetski + (owned.has("car_sport") ? 0 : SWAP_DETOUR);
  if (!waterOnly && depth < CANAL_DEPTH) return distance / (owned.has("car_muscle") ? SPEED.trike : SPEED.scooter);
  // Wheels drown: the rider's own jet-ski, else the swap dock's.
  return distance / SPEED.jetski + (owned.has("car_sport") ? 0 : SWAP_DETOUR);
}

/**
 * Play shifts until the note is paid (or `maxNights`), with a buying policy: the kitchen first (ovens,
 * bags, toppings), the family's jet-ski once the tide work starts, then everything into the note.
 * Calls ring on the oven's interval all shift long, whether the rider is at the window or out on a run;
 * the board holds `BOARD_SIZE` and a caller hangs up after `CALL_PATIENCE`. One chapter lands per night
 * once its precondition holds (the crust war needs a second oven to stack, the MegaSlice chapter a
 * $3,000 payment) and pays its cash. `pace` scales the rider: 1 is steady, 0.7 a rider still learning the
 * streets (slower legs, longer at each door).
 */
export function playCareer(maxNights = 60, pace = 1): CareerResult {
  let shop: PizzeriaState = freshPizzeria();
  let cash = 250;
  const owned = new Set<string>(["car_compact"]);
  const nights: CareerNight[] = [];
  let serial = 0;
  let totalTakings = 0;
  let chapter = 0;
  for (let night = 1; night <= maxNights && !shop.saved; night += 1) {
    const kitchen = kitchenOf(shop);
    const capacity = ovenCapacity(shop);
    const interval = callInterval(shop);
    let t = 0;
    let takings = 0;
    let delivered = 0;
    let idaDue = true;
    let nextCallAt = interval * 0.5;
    let board: Call[] = [];
    const hourAt = (at: number) => SHIFT_START_HOUR + (Math.min(at, SHIFT_SECONDS) / SHIFT_SECONDS) * (SHIFT_END_HOUR - SHIFT_START_HOUR);
    /** Ring the phone up to time `until`; callers who waited too long hang up. */
    const ring = (until: number) => {
      while (nextCallAt <= until && nextCallAt < SHIFT_SECONDS) {
        const at = nextCallAt;
        board = board.filter((call) => at - call.calledAt <= CALL_PATIENCE);
        if (board.length < BOARD_SIZE) {
          serial += 1;
          const caller = nextCaller({ rep: repStars(shop.goodDeliveries), hour: hourAt(at), busy: new Set(board.map((call) => call.customerId)), roll: roll(serial), idaDue });
          if (caller !== null) {
            if (caller.id === "ida_faro") idaDue = false;
            board.push({ customerId: caller.id, pizzas: caller.pizzas, calledAt: at });
          }
        }
        nextCallAt += interval;
      }
      board = board.filter((call) => until - call.calledAt <= CALL_PATIENCE);
    };
    while (t < SHIFT_SECONDS) {
      ring(t);
      if (board.length === 0) {
        if (nextCallAt >= SHIFT_SECONDS) break;
        t = nextCallAt;
        continue;
      }
      // Load the oldest calls that fit the bag.
      const loaded: { customerId: string; pizzaId: string }[] = [];
      while (board.length > 0 && loaded.length < capacity) {
        const call = board[0]!;
        const room = capacity - loaded.length;
        for (const pizzaId of call.pizzas.slice(0, room)) loaded.push({ customerId: call.customerId, pizzaId });
        if (call.pizzas.length <= room) board.shift();
        else board[0] = { ...call, pizzas: call.pizzas.slice(room) };
      }
      t += HANDLING;
      const stack = loaded.length;
      const doors = [...new Set(loaded.map((box) => box.customerId))];
      let from: readonly [number, number] = OVEN;
      let age = 0;
      while (doors.length > 0) {
        // Nearest door first.
        const here = from;
        doors.sort((a, b) => Math.hypot(spotOf(a)[0] - here[0], spotOf(a)[1] - here[1]) - Math.hypot(spotOf(b)[0] - here[0], spotOf(b)[1] - here[1]));
        const customerId = doors.shift()!;
        const spot = spotOf(customerId);
        const level = tideLevelAt(hourAt(t));
        const depth = districtDepth(districtAt(spot[0], spot[1])?.id ?? null, level);
        const floor = dropFloor(depth);
        const leg = legSeconds(Math.hypot(spot[0] - from[0], spot[1] - from[1]), depth, owned, level >= 1.65 && floor === "rooftop", customerById(customerId)?.waterOnly === true);
        const spent = (leg + HANDLING) / pace;
        age += spent;
        t += spent;
        for (const box of loaded.filter((b) => b.customerId === customerId)) {
          const par = parSeconds(Math.hypot(spot[0] - OVEN[0], spot[1] - OVEN[1]));
          const fresh: Order = { id: `c${serial}`, customerId, pizzaId: box.pizzaId, heat: kitchen.ovenHeat, soak: 0, age: 0, par };
          const order = ageOrder(fresh, age, { kitchen, soakPerSecond: depth > 0 && depth < CANAL_DEPTH ? 0.15 : 0, altitude: false });
          const settled = settleOrder(order, { kitchen, floor, stack });
          takings += settled.total;
          delivered += 1;
          shop = { ...shop, deliveries: shop.deliveries + 1, goodDeliveries: shop.goodDeliveries + (settled.verdict === "bad" ? 0 : 1) };
        }
        from = spot;
      }
      const flooded = districtDepth(districtAt(from[0], from[1])?.id ?? null, tideLevelAt(hourAt(t))) >= CANAL_DEPTH;
      t += Math.hypot(from[0] - OVEN[0], from[1] - OVEN[1]) / (flooded ? SPEED.jetski : SPEED.scooter) / pace;
    }
    cash += takings;
    totalTakings += takings;
    const close = closeShift(shop, takings);
    shop = close.state;
    const bought: string[] = [];
    // The night's chapter, if its precondition holds.
    const next = CHAPTER_CASH[chapter];
    if (next !== undefined && (next.id !== "crust_war" || shop.oven >= 2) && (next.id !== "megaslice_man" || (shop.paid ?? 0) >= 3000)) {
      cash += next.cash;
      chapter += 1;
      bought.push(`${next.id} +$${next.cash}`);
    }
    // Spend: the kitchen first, then the jet-ski, then the note.
    const plan: (UpgradeKind | string)[] = ["oven", "bag", "toppings", "car_sport", "oven", "toppings", "bag"];
    for (const item of plan) {
      if (item === "oven" || item === "bag" || item === "toppings") {
        const tier = nextTier(shop, item);
        if (tier !== null && tier.tier <= 3 && cash - tier.cost >= RESERVE) {
          cash -= tier.cost;
          shop = buyUpgrade(shop, item);
          bought.push(`${item} ${tier.tier}`);
        }
      } else if (!owned.has(item)) {
        const price = VEHICLES.find((v) => v.id === item)?.price ?? Infinity;
        if (cash - price >= RESERVE) {
          cash -= price;
          owned.add(item);
          bought.push(item);
        }
      }
    }
    let paid = 0;
    if (shop.oven >= 3 && cash > RESERVE) {
      paid = Math.min(shop.debt, cash - RESERVE);
      shop = payDebt(shop, paid);
      cash -= paid;
    }
    nights.push({ night, delivered, takings: Math.round(takings), quota: close.quota, quotaMet: close.metQuota, bought, paid: Math.round(paid), debt: shop.debt, rep: repStars(shop.goodDeliveries) });
  }
  return { nights, savedOn: shop.saved ? nights.length : null, totalTakings: Math.round(totalTakings), chapters: chapter, foreclosures: shop.foreclosures };
}
