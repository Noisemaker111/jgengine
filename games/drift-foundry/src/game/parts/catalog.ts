import { DEFAULT_GRIP_CURVE, type GripCurve } from "@jgengine/core/physics/vehicleBody";
import type { VehiclePart } from "@jgengine/core/physics/vehicleParts";

export type PartSlotId = "engine" | "front" | "wheels" | "frame";
export type PartIconId =
  | "salvage_v6"
  | "truck_engine"
  | "ev_conversion"
  | "plow_blade"
  | "hood_plate"
  | "fan_blade_vanes"
  | "coil_springs"
  | "steel_rims"
  | "monster_treads"
  | "scrap_frame"
  | "roll_cage"
  | "armor_plating";

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
 * A salvage part is a `VehiclePart` (id, slot, handling effects, optional tire compound) plus the
 * radio/blurb copy and the route grants that make the plow-and-jump gauntlet work.
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

/** Treaded compound: peak grip holds out to a wider slip angle and bites harder once sliding. */
const MONSTER_TREAD_CURVE: GripCurve = {
  points: [
    [0, 1],
    [0.3, 1],
    [0.6, 0.88],
    [1, 0.64],
  ],
};

export const PARTS: readonly DriftFoundryPartDef[] = [
  {
    id: "salvage_v6",
    slot: "engine",
    slotLabel: "ENGINE",
    label: "Salvage V6",
    radioLine: "SALVAGE SIX BOLTED — SHE'S BREATHING FIRE",
    blurb: "A balanced yard-find inline six. Reliable pull, nothing fancy.",
    effects: { topSpeed: { add: 4.5 }, engineAccel: { add: 4 }, turnRate: { add: -0.1 } },
  },
  {
    id: "truck_engine",
    slot: "engine",
    slotLabel: "ENGINE",
    label: "Truck Engine",
    radioLine: "TRUCK ENGINE BOLTED — HOLD HER STRAIGHT!",
    blurb: "Diesel brute out of a wrecked flatbed. Huge top end, fishtails hard.",
    effects: { topSpeed: { add: 9.5 }, engineAccel: { add: 7 }, turnRate: { add: -0.7 } },
  },
  {
    id: "ev_conversion",
    slot: "engine",
    slotLabel: "ENGINE",
    label: "EV Conversion",
    radioLine: "EV SWAP BOLTED — QUIET BUT QUICK",
    blurb: "Scavenged battery motor. Snappy off the line, gentle on the wheel.",
    effects: { topSpeed: { add: 3 }, engineAccel: { add: 6 }, turnRate: { add: 0.5 } },
  },
  {
    id: "plow_blade",
    slot: "front",
    slotLabel: "FRONT",
    label: "Plow Blade",
    radioLine: "PLOW BLADE BOLTED — CLEAR A LANE!",
    blurb: "A bent dozer blade welded to the nose. Punches through light fences.",
    effects: { topSpeed: { add: -1 }, turnRate: { add: -0.2 } },
    grants: { plow: 1 },
  },
  {
    id: "hood_plate",
    slot: "front",
    slotLabel: "FRONT",
    label: "Hood Plate",
    radioLine: "HOOD PLATE BOLTED — LOOKING SHARP",
    blurb: "A flat scavenged hood, tuned for airflow. Cleans up the handling.",
    effects: { topSpeed: { add: 0.5 }, turnRate: { add: 0.3 } },
  },
  {
    id: "fan_blade_vanes",
    slot: "front",
    slotLabel: "FRONT",
    label: "Fan Blade Vanes",
    radioLine: "FAN VANES BOLTED — SLICING THE AIR",
    blurb: "Industrial fan blades splayed as a splitter. Light, twitchy, quick to turn.",
    effects: { topSpeed: { add: 1 }, turnRate: { add: 0.6 } },
  },
  {
    id: "coil_springs",
    slot: "wheels",
    slotLabel: "WHEELS",
    label: "Coil Springs",
    radioLine: "COIL SPRINGS BOLTED — SEND IT OVER THE TOP",
    blurb: "Stacked garage-door springs on the axles. Real air, real distance.",
    effects: { topSpeed: { add: -0.5 }, engineAccel: { add: -0.5 }, turnRate: { add: 0.1 } },
    grants: { jumpPower: 9 },
  },
  {
    id: "steel_rims",
    slot: "wheels",
    slotLabel: "WHEELS",
    label: "Steel Rims",
    radioLine: "STEEL RIMS BOLTED — ROLLING TRUE",
    blurb: "Plain scrap-yard rims. Nothing special, nothing wrong with them.",
    effects: { turnRate: { add: 0.2 } },
    gripCurve: DEFAULT_GRIP_CURVE,
  },
  {
    id: "monster_treads",
    slot: "wheels",
    slotLabel: "WHEELS",
    label: "Monster Treads",
    radioLine: "MONSTER TREADS BOLTED — GRIP FOR DAYS",
    blurb: "Off a crushed dump truck. Huge grip, drags on the top speed.",
    effects: { topSpeed: { add: -2 }, turnRate: { add: 1 }, gripStrength: { scale: 1.15 } },
    gripCurve: MONSTER_TREAD_CURVE,
  },
  {
    id: "scrap_frame",
    slot: "frame",
    slotLabel: "FRAME",
    label: "Scrap Frame",
    radioLine: "SCRAP FRAME BOLTED — STILL HOLDING TOGETHER",
    blurb: "Whatever rails were lying around, welded straight-ish.",
    effects: { turnRate: { add: 0.2 } },
  },
  {
    id: "roll_cage",
    slot: "frame",
    slotLabel: "FRAME",
    label: "Roll Cage",
    radioLine: "ROLL CAGE BOLTED — TIGHTENED RIGHT UP",
    blurb: "A braced tube cage. Stiffens the chassis, sharpens the turn-in.",
    effects: { topSpeed: { add: -0.3 }, turnRate: { add: 0.5 } },
    grants: { armor: 1 },
  },
  {
    id: "armor_plating",
    slot: "frame",
    slotLabel: "FRAME",
    label: "Armor Plating",
    radioLine: "ARMOR PLATING BOLTED — GOOD LUCK, COMPACTOR",
    blurb: "Bolted-on container steel. Heavy, but it'll eat a crusher clip for you.",
    effects: { topSpeed: { add: -1.5 }, engineAccel: { add: -1 }, turnRate: { add: -0.4 } },
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
