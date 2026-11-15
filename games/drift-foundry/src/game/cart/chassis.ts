import type { VehiclePart } from "@jgengine/core/physics/vehicleParts";

/**
 * The cart under the mods. Every chassis is a handling part composed before the mods and the basket
 * load, so the standard cart is the reference build and the others are trade-offs: the kid-size
 * racer turns in like a go-kart and holds four items, the double-wide flatbed carries a weekly shop
 * and rolls like a barge, the mobility scooter cart never wobbles and never stops.
 */
export type ChassisId = "standard" | "kiddie" | "flatbed" | "scooter";

export interface CartChassis {
  id: ChassisId;
  label: string;
  blurb: string;
  /** Store credit to unlock it at the cart corral; the standard cart is free. */
  price: number;
  /** Items the basket holds before the next grab knocks one out. */
  capacity: number;
  /**
   * How much the squeaky front caster pulls the handle, 0..1 of the standard cart's wobble. The
   * Fixed Squeaky Wheel mod takes it to zero on any chassis.
   */
  wobble: number;
  /** The chassis as a handling part: composed first, before the mods and the load. */
  part: VehiclePart;
  /** Entity kind the loop draws for the player on this chassis. */
  entityKind: string;
}

export const CHASSIS: readonly CartChassis[] = [
  {
    id: "standard",
    label: "Standard Cart",
    blurb: "The one by the door with the squeaky front wheel. Eight items, honest handling.",
    price: 0,
    capacity: 8,
    wobble: 1,
    part: { id: "chassis_standard", slot: "chassis" },
    entityKind: "kart_player_standard",
  },
  {
    id: "kiddie",
    label: "Kid-Size Racer Cart",
    blurb: "The little red race-car cart. Quick to launch, darty to steer, and it holds four items.",
    price: 550,
    capacity: 4,
    wobble: 0.5,
    part: { id: "chassis_kiddie", slot: "chassis", effects: { topSpeed: { add: 1.2 }, accel: { add: 2.5 }, turnRate: { add: 0.5 }, grip: { scale: 0.94 } } },
    entityKind: "kart_player_kiddie",
  },
  {
    id: "flatbed",
    label: "Double-Wide Flatbed",
    blurb: "The lumber-aisle flatbed. Fourteen items, planted in corners, slow to get rolling.",
    price: 650,
    capacity: 14,
    wobble: 0.6,
    part: { id: "chassis_flatbed", slot: "chassis", effects: { topSpeed: { add: -0.8 }, accel: { add: -1.5 }, turnRate: { add: -0.25 }, grip: { scale: 1.12 } } },
    entityKind: "kart_player_flatbed",
  },
  {
    id: "scooter",
    label: "Mobility Scooter Cart",
    blurb: "A motorised scooter with a basket on the front. Top speed for days, never wobbles, six items.",
    price: 660,
    capacity: 6,
    wobble: 0,
    part: { id: "chassis_scooter", slot: "chassis", effects: { topSpeed: { add: 3 }, accel: { add: -0.5 }, turnRate: { add: -0.2 } } },
    entityKind: "kart_player_scooter",
  },
];

export const DEFAULT_CHASSIS: ChassisId = "standard";

export function chassisById(id: string): CartChassis | null {
  return CHASSIS.find((entry) => entry.id === id) ?? null;
}

/** The squeak: a caster that flutters the handle at about 2.3 Hz with a slower drift on top. */
const WOBBLE_STEER = 0.07;

/**
 * Steer added by the squeaky caster at run time `time`, scaled by the chassis and gone once the
 * wheel is fixed. It is a small, zero-mean flutter that grows with speed: you feel it on a long
 * straight, it never decides a corner.
 */
export function wobbleSteer(time: number, speedKmh: number, wobble: number): number {
  if (wobble <= 0 || speedKmh < 4) return 0;
  const speedShare = Math.min(1, speedKmh / 40);
  const flutter = Math.sin(time * 14.5) * 0.7 + Math.sin(time * 5.3 + 1.1) * 0.3;
  return WOBBLE_STEER * wobble * speedShare * flutter;
}
