import type { VehiclePart } from "@jgengine/core/physics/vehicleParts";

import { HEAVY_KG, type GoodsDef, type PowerUpDef, type ShelfItem } from "./goods";

/**
 * The basket: what the run has grabbed off the shelves. It is plain data - the goods in order, the
 * power-ups waiting in the child seat - and the handling it implies is derived, never stored, so a
 * reload or a dropped item recomposes the same cart.
 */
export interface Basket {
  goods: readonly GoodsDef[];
  /** Power-ups in the child seat, oldest first; using one fires the oldest. */
  powerUps: readonly PowerUpDef[];
}

/** Power-ups the child seat holds at once. */
export const POWER_UP_SLOTS = 2;

export const EMPTY_BASKET: Basket = { goods: [], powerUps: [] };

export type GrabResult =
  | { status: "added"; basket: Basket; item: ShelfItem; dropped: ShelfItem | null }
  | { status: "full"; basket: Basket };

/**
 * Put a shelf item in the basket. Goods past the chassis capacity bump the oldest item out of the
 * back (the PA calls what fell); a third power-up bumps the oldest one. Nothing is ever refused, so
 * driving into a shelf always does something.
 */
export function grab(basket: Basket, item: ShelfItem, capacity: number): GrabResult {
  if (item.kind === "power") {
    const powerUps = [...basket.powerUps, item];
    const dropped = powerUps.length > POWER_UP_SLOTS ? powerUps.shift()! : null;
    return { status: "added", basket: { ...basket, powerUps }, item, dropped };
  }
  if (capacity <= 0) return { status: "full", basket };
  const goods = [...basket.goods, item];
  const dropped = goods.length > capacity ? goods.shift()! : null;
  return { status: "added", basket: { ...basket, goods }, item, dropped };
}

/** Take the oldest power-up out of the child seat. */
export function usePowerUp(basket: Basket): { basket: Basket; used: PowerUpDef | null } {
  if (basket.powerUps.length === 0) return { basket, used: null };
  const [used, ...rest] = basket.powerUps;
  return { basket: { ...basket, powerUps: rest }, used: used! };
}

export function basketWeight(basket: Basket): number {
  return basket.goods.reduce((sum, item) => sum + item.weight, 0) + basket.powerUps.reduce((sum, item) => sum + item.weight, 0);
}

/** What the self-checkout rings up: every item still in the basket, power-ups unused included. */
export function basketValue(basket: Basket): number {
  return basket.goods.reduce((sum, item) => sum + item.price, 0) + basket.powerUps.reduce((sum, item) => sum + item.price, 0);
}

export type LoadFeel = "empty" | "twitchy" | "balanced" | "heavy" | "loaded";

export interface LoadReading {
  weight: number;
  /** Heavy goods' kilograms: the momentum share. */
  heavyKg: number;
  lightCount: number;
  /** 0..1 how much the light goods are making the cart twitchy. */
  twitch: number;
  /** 0..1 how much the weight is settling the cart. */
  momentum: number;
  feel: LoadFeel;
}

/** Kilograms of load where the momentum effect is fully on. */
const FULL_MOMENTUM_KG = 30;
/** Light items that make an otherwise empty cart fully twitchy. */
const FULL_TWITCH_ITEMS = 5;
/** Load over which light goods stop mattering: a watermelon calms a basket of chips. */
const TWITCH_FADE_KG = 12;

export function loadReading(basket: Basket): LoadReading {
  const weight = basketWeight(basket);
  const heavyKg = basket.goods.filter((item) => item.weight >= HEAVY_KG).reduce((sum, item) => sum + item.weight, 0);
  const lightCount = basket.goods.filter((item) => item.heft === "light").length;
  const momentum = Math.min(1, weight / FULL_MOMENTUM_KG);
  const twitch = Math.min(1, lightCount / FULL_TWITCH_ITEMS) * Math.max(0, 1 - weight / TWITCH_FADE_KG);
  const feel: LoadFeel = weight === 0 ? "empty" : twitch >= 0.35 ? "twitchy" : momentum >= 0.85 ? "loaded" : momentum >= 0.4 ? "heavy" : "balanced";
  return { weight, heavyKg, lightCount, twitch, momentum, feel };
}

/**
 * The basket as a handling part, composed last. Momentum (weight) adds top speed, grip and stability
 * but takes acceleration and turn rate; twitch (a light, rattling basket) adds turn rate and drift
 * and takes grip. Exaggerated on purpose: a full basket must feel like a different cart.
 */
export function loadPart(basket: Basket): VehiclePart | null {
  const load = loadReading(basket);
  if (load.weight === 0) return null;
  const m = load.momentum;
  const t = load.twitch;
  return {
    id: "basket_load",
    slot: "load",
    effects: {
      topSpeed: { add: 2.4 * m },
      accel: { scale: 1 - 0.38 * m },
      turnRate: { add: -0.55 * m + 0.7 * t },
      grip: { scale: (1 + 0.22 * m) * (1 - 0.16 * t) },
      drift: { add: 0.25 * t - 0.1 * m },
      weight: { add: load.weight },
    },
  };
}
