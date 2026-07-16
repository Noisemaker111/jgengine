import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";
import type { NeedId } from "../needs/needs";

export type FurnitureRole = NeedId | "work";

export interface FurnitureDef {
  id: string;
  name: string;
  role: FurnitureRole;
  cost: number;
  satisfyPerSecond: number;
  color: string;
  footprint: { w: number; d: number };
  height: number;
  useRadius: number;
  blurb: string;
}

export const FURNITURE: FurnitureDef[] = [
  {
    id: "nutrient_font",
    name: "Nutrient Font",
    role: "hunger",
    cost: 120,
    satisfyPerSecond: 22,
    color: "#ffb347",
    footprint: { w: 2, d: 2 },
    height: 1.4,
    useRadius: 2.2,
    blurb: "Draws a warm broth from the habitat's mineral core.",
  },
  {
    id: "sleep_pod",
    name: "Torpor Pod",
    role: "energy",
    cost: 160,
    satisfyPerSecond: 20,
    color: "#7ec8ff",
    footprint: { w: 2.4, d: 3 },
    height: 1.1,
    useRadius: 2.4,
    blurb: "A gel cradle that syncs to any body plan for deep torpor.",
  },
  {
    id: "chat_ring",
    name: "Bond Ring",
    role: "social",
    cost: 140,
    satisfyPerSecond: 16,
    color: "#ff8fb0",
    footprint: { w: 3.2, d: 3.2 },
    height: 0.7,
    useRadius: 3,
    blurb: "A sunken circle where household members trade signals.",
  },
  {
    id: "holo_arcade",
    name: "Holo Arcade",
    role: "fun",
    cost: 180,
    satisfyPerSecond: 21,
    color: "#b98cff",
    footprint: { w: 2, d: 2 },
    height: 1.8,
    useRadius: 2.2,
    blurb: "Projects tactile light games tuned to each mood.",
  },
  {
    id: "bloom_planter",
    name: "Bloom Planter",
    role: "fun",
    cost: 70,
    satisfyPerSecond: 9,
    color: "#63d6a3",
    footprint: { w: 1.6, d: 1.6 },
    height: 1.3,
    useRadius: 2,
    blurb: "Cheap alien flora that lifts spirits just by tending it.",
  },
  {
    id: "work_console",
    name: "Yield Console",
    role: "work",
    cost: 220,
    satisfyPerSecond: 0,
    color: "#ffe08a",
    footprint: { w: 2.4, d: 1.6 },
    height: 1.3,
    useRadius: 2.2,
    blurb: "A career station: work a shift here to earn credits.",
  },
];

export const FURNITURE_BY_ID: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE.map((def) => [def.id, def]),
);

export const WORK_EARN_PER_SECOND = 14;

export interface DecorDef {
  id: string;
  color: string;
  height: number;
}

export const DECOR: DecorDef[] = [
  { id: "decor_spire", color: "#8f7bd6", height: 4.2 },
  { id: "decor_boulder", color: "#6a5f82", height: 1.2 },
  { id: "decor_frond", color: "#63d6a3", height: 2.6 },
  { id: "decor_frond_tan", color: "#e0b866", height: 2.2 },
  { id: "decor_crystal", color: "#8fd6ff", height: 1.6 },
];

export const DECOR_BY_ID: Record<string, DecorDef> = Object.fromEntries(DECOR.map((def) => [def.id, def]));

export type StructureKind = "wall" | "wall_window" | "corner" | "gate";

export interface StructureDef {
  id: string;
  kind: StructureKind;
}

export const STRUCTURE: StructureDef[] = [
  { id: "hab_wall", kind: "wall" },
  { id: "hab_wall_window", kind: "wall_window" },
  { id: "hab_corner", kind: "corner" },
  { id: "hab_gate", kind: "gate" },
];

export const STRUCTURE_BY_ID: Record<string, StructureDef> = Object.fromEntries(
  STRUCTURE.map((def) => [def.id, def]),
);

export const objectEntries: Record<string, GameContextObjectEntry> = Object.fromEntries(
  [...FURNITURE.map((def) => def.id), ...DECOR.map((def) => def.id), ...STRUCTURE.map((def) => def.id)].map((id) => [
    id,
    {} as GameContextObjectEntry,
  ]),
);
