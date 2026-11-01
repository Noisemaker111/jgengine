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
  capacity: number;
  runningCost: number;
}

export const FURNITURE: FurnitureDef[] = [
  {
    id: "nutrient_font",
    capacity: 2,
    runningCost: 3,
    name: "Nutrient Font",
    role: "hunger",
    cost: 120,
    satisfyPerSecond: 12,
    color: "#ffb347",
    footprint: { w: 2, d: 2 },
    height: 1.4,
    useRadius: 2.2,
    blurb: "One pantry ration becomes a full meal. Two household members can eat together.",
  },
  {
    id: "sleep_pod",
    capacity: 2,
    runningCost: 3,
    name: "Torpor Pod",
    role: "energy",
    cost: 160,
    satisfyPerSecond: 10,
    color: "#7ec8ff",
    footprint: { w: 2.4, d: 3 },
    height: 1.1,
    useRadius: 2.4,
    blurb: "A gel cradle that syncs to any body plan for deep torpor.",
  },
  {
    id: "chat_ring",
    capacity: 4,
    runningCost: 2,
    name: "Bond Ring",
    role: "social",
    cost: 140,
    satisfyPerSecond: 6,
    color: "#ff8fb0",
    footprint: { w: 3.2, d: 3.2 },
    height: 0.7,
    useRadius: 3,
    blurb: "Trade signals with a companion to build trust. Alone, it only eases loneliness.",
  },
  {
    id: "holo_arcade",
    capacity: 2,
    runningCost: 4,
    name: "Holo Arcade",
    role: "fun",
    cost: 180,
    satisfyPerSecond: 9,
    color: "#b98cff",
    footprint: { w: 2, d: 2 },
    height: 1.8,
    useRadius: 2.2,
    blurb: "Projects tactile light games tuned to each mood.",
  },
  {
    id: "bloom_planter",
    capacity: 2,
    runningCost: 1,
    name: "Bloom Planter",
    role: "fun",
    cost: 70,
    satisfyPerSecond: 5,
    color: "#63d6a3",
    footprint: { w: 1.6, d: 1.6 },
    height: 1.3,
    useRadius: 2,
    blurb: "A 20-second Bloom shift yields four rations and 48 credits. Friends tending together harvest more.",
  },
  {
    id: "work_console",
    capacity: 1,
    runningCost: 4,
    name: "Yield Console",
    role: "work",
    cost: 220,
    satisfyPerSecond: 0,
    color: "#ffe08a",
    footprint: { w: 2.4, d: 1.6 },
    height: 1.3,
    useRadius: 2.2,
    blurb: "One worker at a time. A full Yield shift earns 100 credits; tired workers must recover.",
  },
];

export const FURNITURE_BY_ID: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE.map((def) => [def.id, def]),
);

export const WORK_EARN_PER_SECOND = 5;

export interface DecorDef {
  id: string;
  color: string;
  height: number;
  /** Uniform scale for flat pieces (rugs) whose height is not what sizes them. */
  scale?: number;
  /** Glow of the piece, 0 when it casts none. */
  glow?: number;
}

export const DECOR: DecorDef[] = [
  { id: "decor_spire", color: "#fff0d6", height: 4.2 },
  { id: "decor_boulder", color: "#8f7bb5", height: 1.2 },
  { id: "decor_frond", color: "#9fe0c4", height: 2.6 },
  { id: "decor_frond_tan", color: "#f6a6cf", height: 2.2 },
  { id: "decor_crystal", color: "#9fe0c4", height: 1.6, glow: 0.16 },
  { id: "decor_mushroom_pink", color: "#f6a6cf", height: 1.5, glow: 0.12 },
  { id: "decor_mushroom_mint", color: "#9fe0c4", height: 1.2, glow: 0.1 },
  { id: "decor_bush_mint", color: "#9fe0c4", height: 1.3 },
  { id: "decor_bloom_pink", color: "#f6a6cf", height: 0.7, glow: 0.08 },
  { id: "decor_tuft_mint", color: "#9fe0c4", height: 0.8 },
  { id: "decor_pebble_lilac", color: "#8f7bb5", height: 0.5 },
  { id: "decor_rug_butter", color: "#ffeab0", height: 0.05, scale: 1.5 },
  { id: "decor_rug_pink", color: "#ffd0e6", height: 0.05, scale: 1.5 },
  { id: "decor_rug_mint", color: "#cff3e2", height: 0.05, scale: 1.6 },
  { id: "decor_lamp", color: "#ffd98a", height: 2.1, glow: 0.5 },
  { id: "decor_lamp_table", color: "#ffd98a", height: 0.9, glow: 0.5 },
  { id: "decor_shelf", color: "#f6a6cf", height: 1.9 },
  { id: "decor_cabinet", color: "#fff0d6", height: 1.2 },
  { id: "decor_armchair", color: "#9fe0c4", height: 1.1 },
  { id: "decor_picture", color: "#ffd98a", height: 0.9 },
  { id: "decor_cactus", color: "#9fe0c4", height: 0.9 },
  { id: "decor_stool", color: "#f6a6cf", height: 0.7 },
  { id: "decor_books", color: "#fff0d6", height: 0.4 },
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
