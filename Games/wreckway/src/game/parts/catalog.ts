import type { ModularItemDef, PartDef } from "@jgengine/core/item/modularItem";

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

export interface WreckwayPartDef extends PartDef {
  id: PartIconId;
  category: PartSlotId;
  slotLabel: string;
  label: string;
  radioLine: string;
  blurb: string;
  stats: {
    topSpeed: number;
    engineAccel: number;
    turnRate: number;
    jumpPower: number;
    plow: number;
    armor: number;
  };
}

export const KART_ITEM_ID = "kart_chassis";

export const KART_DEF: ModularItemDef = {
  id: KART_ITEM_ID,
  baseStats: { topSpeed: 6.5, engineAccel: 9, turnRate: 1.7, jumpPower: 0, plow: 0, armor: 0 },
  slots: [
    { id: "engine", accepts: "engine" },
    { id: "front", accepts: "front" },
    { id: "wheels", accepts: "wheels" },
    { id: "frame", accepts: "frame" },
  ],
};

export const PARTS: readonly WreckwayPartDef[] = [
  {
    id: "salvage_v6",
    category: "engine",
    slotLabel: "ENGINE",
    label: "Salvage V6",
    radioLine: "SALVAGE SIX BOLTED — SHE'S BREATHING FIRE",
    blurb: "A balanced yard-find inline six. Reliable pull, nothing fancy.",
    stats: { topSpeed: 4.5, engineAccel: 4, turnRate: -0.1, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "truck_engine",
    category: "engine",
    slotLabel: "ENGINE",
    label: "Truck Engine",
    radioLine: "TRUCK ENGINE BOLTED — HOLD HER STRAIGHT!",
    blurb: "Diesel brute out of a wrecked flatbed. Huge top end, fishtails hard.",
    stats: { topSpeed: 9.5, engineAccel: 7, turnRate: -0.7, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "ev_conversion",
    category: "engine",
    slotLabel: "ENGINE",
    label: "EV Conversion",
    radioLine: "EV SWAP BOLTED — QUIET BUT QUICK",
    blurb: "Scavenged battery motor. Snappy off the line, gentle on the wheel.",
    stats: { topSpeed: 3, engineAccel: 6, turnRate: 0.5, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "plow_blade",
    category: "front",
    slotLabel: "FRONT",
    label: "Plow Blade",
    radioLine: "PLOW BLADE BOLTED — CLEAR A LANE!",
    blurb: "A bent dozer blade welded to the nose. Punches through light fences.",
    stats: { topSpeed: -1, engineAccel: 0, turnRate: -0.2, jumpPower: 0, plow: 1, armor: 0 },
  },
  {
    id: "hood_plate",
    category: "front",
    slotLabel: "FRONT",
    label: "Hood Plate",
    radioLine: "HOOD PLATE BOLTED — LOOKING SHARP",
    blurb: "A flat scavenged hood, tuned for airflow. Cleans up the handling.",
    stats: { topSpeed: 0.5, engineAccel: 0, turnRate: 0.3, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "fan_blade_vanes",
    category: "front",
    slotLabel: "FRONT",
    label: "Fan Blade Vanes",
    radioLine: "FAN VANES BOLTED — SLICING THE AIR",
    blurb: "Industrial fan blades splayed as a splitter. Light, twitchy, quick to turn.",
    stats: { topSpeed: 1, engineAccel: 0, turnRate: 0.6, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "coil_springs",
    category: "wheels",
    slotLabel: "WHEELS",
    label: "Coil Springs",
    radioLine: "COIL SPRINGS BOLTED — SEND IT OVER THE TOP",
    blurb: "Stacked garage-door springs on the axles. Real air, real distance.",
    stats: { topSpeed: -0.5, engineAccel: -0.5, turnRate: 0.1, jumpPower: 9, plow: 0, armor: 0 },
  },
  {
    id: "steel_rims",
    category: "wheels",
    slotLabel: "WHEELS",
    label: "Steel Rims",
    radioLine: "STEEL RIMS BOLTED — ROLLING TRUE",
    blurb: "Plain scrap-yard rims. Nothing special, nothing wrong with them.",
    stats: { topSpeed: 0, engineAccel: 0, turnRate: 0.2, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "monster_treads",
    category: "wheels",
    slotLabel: "WHEELS",
    label: "Monster Treads",
    radioLine: "MONSTER TREADS BOLTED — GRIP FOR DAYS",
    blurb: "Off a crushed dump truck. Huge grip, drags on the top speed.",
    stats: { topSpeed: -2, engineAccel: 0, turnRate: 1, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "scrap_frame",
    category: "frame",
    slotLabel: "FRAME",
    label: "Scrap Frame",
    radioLine: "SCRAP FRAME BOLTED — STILL HOLDING TOGETHER",
    blurb: "Whatever rails were lying around, welded straight-ish.",
    stats: { topSpeed: 0, engineAccel: 0, turnRate: 0.2, jumpPower: 0, plow: 0, armor: 0 },
  },
  {
    id: "roll_cage",
    category: "frame",
    slotLabel: "FRAME",
    label: "Roll Cage",
    radioLine: "ROLL CAGE BOLTED — TIGHTENED RIGHT UP",
    blurb: "A braced tube cage. Stiffens the chassis, sharpens the turn-in.",
    stats: { topSpeed: -0.3, engineAccel: 0, turnRate: 0.5, jumpPower: 0, plow: 0, armor: 1 },
  },
  {
    id: "armor_plating",
    category: "frame",
    slotLabel: "FRAME",
    label: "Armor Plating",
    radioLine: "ARMOR PLATING BOLTED — GOOD LUCK, COMPACTOR",
    blurb: "Bolted-on container steel. Heavy, but it'll eat a crusher clip for you.",
    stats: { topSpeed: -1.5, engineAccel: -1, turnRate: -0.4, jumpPower: 0, plow: 0, armor: 1 },
  },
];

export function partById(id: string): WreckwayPartDef | null {
  return PARTS.find((part) => part.id === id) ?? null;
}

export function partsInSlot(slot: PartSlotId): readonly WreckwayPartDef[] {
  return PARTS.filter((part) => part.category === slot);
}

export const PART_SLOTS: readonly PartSlotId[] = ["engine", "front", "wheels", "frame"];
