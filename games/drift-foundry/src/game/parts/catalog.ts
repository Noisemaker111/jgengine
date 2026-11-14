import { DEFAULT_GRIP_CURVE, type GripCurve } from "@jgengine/core/physics/gripCurve";
import type { VehiclePart } from "@jgengine/core/physics/vehicleParts";

export type PartSlotId = "engine" | "front" | "wheels" | "frame";
export type PartIconId =
  | "power_walker"
  | "leaf_blower"
  | "e_assist"
  | "pallet_plow"
  | "noodle_bumper"
  | "sign_spoiler"
  | "spring_casters"
  | "fixed_squeak"
  | "knobby_casters"
  | "wire_basket"
  | "cage_basket"
  | "bin_lid_armor";

/**
 * Route capabilities the barricade gates read. These are the kart's rules, not handling numbers -
 * every handling claim a part makes lives in its inherited `effects`/`gripCurve`, composed by
 * `applyVehicleParts` in `build.ts`.
 */
export interface PartGrants {
  plow?: number;
  jumpPower?: number;
  armor?: number;
}

/**
 * A cart mod is a `VehiclePart` (id, slot, handling effects, optional tire compound) plus the
 * PA/blurb copy and the route grants that make the box-wall-and-pallet-ramp gauntlet work.
 */
export interface DriftFoundryPartDef extends VehiclePart {
  id: PartIconId;
  slot: PartSlotId;
  slotLabel: string;
  label: string;
  radioLine: string;
  blurb: string;
  grants?: PartGrants;
}

/** Knobby compound: peak grip holds out to a wider slip angle and bites harder once sliding. */
const KNOBBY_CURVE: GripCurve = {
  points: [
    [0, 1],
    [0.3, 1],
    [0.6, 0.88],
    [1, 0.64],
  ],
};

export const PARTS: readonly DriftFoundryPartDef[] = [
  {
    id: "power_walker",
    slot: "engine",
    slotLabel: "PUSH",
    label: "Power-Walker Sneakers",
    radioLine: "POWER-WALKER SNEAKERS LACED — ARMS PUMPING",
    blurb: "Mall-walker cushioned soles. Reliable push, nothing fancy.",
    effects: { topSpeed: { add: 4.5 }, accel: { add: 4 }, turnRate: { add: -0.1 } },
  },
  {
    id: "leaf_blower",
    slot: "engine",
    slotLabel: "PUSH",
    label: "Leaf-Blower Thruster",
    radioLine: "LEAF BLOWER ZIP-TIED ON — HOLD HER STRAIGHT!",
    blurb: "A two-stroke garden blower aimed backwards. Huge top end, fishtails hard.",
    effects: { topSpeed: { add: 9.5 }, accel: { add: 7 }, turnRate: { add: -0.7 } },
  },
  {
    id: "e_assist",
    slot: "engine",
    slotLabel: "PUSH",
    label: "E-Assist Hub Motor",
    radioLine: "E-ASSIST HUB HUMMING — QUIET BUT QUICK",
    blurb: "Out of a display e-bike. Snappy off the line, gentle on the handle.",
    effects: { topSpeed: { add: 3 }, accel: { add: 6 }, turnRate: { add: 0.5 } },
  },
  {
    id: "pallet_plow",
    slot: "front",
    slotLabel: "BUMPER",
    label: "Pallet Plow",
    radioLine: "PALLET PLOW STRAPPED ON — CLEAR A LANE!",
    blurb: "A splintered pallet bungeed to the nose. Bursts cardboard display walls.",
    effects: { topSpeed: { add: -1 }, turnRate: { add: -0.2 } },
    grants: { plow: 1 },
  },
  {
    id: "noodle_bumper",
    slot: "front",
    slotLabel: "BUMPER",
    label: "Pool-Noodle Bumper",
    radioLine: "POOL NOODLES TAPED ON — BOING",
    blurb: "Three foam noodles round the nose. Bounces off end-caps, cleans up the handling.",
    effects: { topSpeed: { add: 0.5 }, turnRate: { add: 0.3 } },
  },
  {
    id: "sign_spoiler",
    slot: "front",
    slotLabel: "BUMPER",
    label: "Sale-Sign Spoiler",
    radioLine: "SALE SIGN ON THE NOSE — 50% MORE DOWNFORCE",
    blurb: "A fold-out SALE board splayed as a splitter. Light, twitchy, quick to turn.",
    effects: { topSpeed: { add: 1 }, turnRate: { add: 0.6 } },
  },
  {
    id: "spring_casters",
    slot: "wheels",
    slotLabel: "CASTERS",
    label: "Pogo Casters",
    radioLine: "POGO CASTERS ON — SEND IT OFF THE PALLETS",
    blurb: "Casters on toy-aisle pogo springs. Real air off every ramp.",
    effects: { topSpeed: { add: -0.5 }, accel: { add: -0.5 }, turnRate: { add: 0.1 } },
    grants: { jumpPower: 9 },
  },
  {
    id: "fixed_squeak",
    slot: "wheels",
    slotLabel: "CASTERS",
    label: "Fixed Squeaky Wheel",
    radioLine: "SQUEAKY WHEEL OILED — SHE ROLLS TRUE",
    blurb: "Somebody finally oiled the front-left caster. No more wobble.",
    effects: { turnRate: { add: 0.2 } },
    gripCurve: DEFAULT_GRIP_CURVE,
  },
  {
    id: "knobby_casters",
    slot: "wheels",
    slotLabel: "CASTERS",
    label: "Garden-Cart Knobbies",
    radioLine: "KNOBBY TYRES FITTED — GRIP FOR DAYS",
    blurb: "Fat tyres off a garden-centre wagon. Huge grip, drags on the top speed.",
    effects: { topSpeed: { add: -2 }, turnRate: { add: 1 }, grip: { scale: 1.15 } },
    gripCurve: KNOBBY_CURVE,
  },
  {
    id: "wire_basket",
    slot: "frame",
    slotLabel: "BASKET",
    label: "Welded Wire Basket",
    radioLine: "BASKET RE-WELDED — STILL HOLDING TOGETHER",
    blurb: "The bent basket straightened with zip ties. Sharper turn-in.",
    effects: { turnRate: { add: 0.2 } },
  },
  {
    id: "cage_basket",
    slot: "frame",
    slotLabel: "BASKET",
    label: "Roll-Cage Basket",
    radioLine: "ROLL CAGE OVER THE BASKET — TIGHTENED RIGHT UP",
    blurb: "A braced pet-crate cage over the basket. Stiff, sharp and it takes one shutter clip.",
    effects: { topSpeed: { add: -0.3 }, turnRate: { add: 0.5 } },
    grants: { armor: 1 },
  },
  {
    id: "bin_lid_armor",
    slot: "frame",
    slotLabel: "BASKET",
    label: "Bin-Lid Armor",
    radioLine: "BIN LIDS BOLTED ON — GOOD LUCK, SHUTTERS",
    blurb: "Four steel trash-can lids riveted round the basket. Heavy, but it eats a shutter clip.",
    effects: { topSpeed: { add: -1.5 }, accel: { add: -1 }, turnRate: { add: -0.4 } },
    grants: { armor: 1 },
  },
];

export function partById(id: string): DriftFoundryPartDef | null {
  return PARTS.find((part) => part.id === id) ?? null;
}

export function partsInSlot(slot: PartSlotId): readonly DriftFoundryPartDef[] {
  return PARTS.filter((part) => part.slot === slot);
}

export const PART_SLOTS: readonly PartSlotId[] = ["engine", "front", "wheels", "frame"];
