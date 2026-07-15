import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";
import type { NeedId } from "../needs/needs";

export type FurnitureShape = "font" | "pod" | "ring" | "arcade" | "bloom" | "console";
export type FurnitureRole = NeedId | "work";

export interface FurnitureDef {
  id: string;
  name: string;
  role: FurnitureRole;
  cost: number;
  satisfyPerSecond: number;
  color: string;
  shape: FurnitureShape;
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
    shape: "font",
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
    shape: "pod",
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
    shape: "ring",
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
    shape: "arcade",
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
    shape: "bloom",
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
    shape: "console",
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

export type DecorShape = "spire" | "boulder" | "frond" | "pad";

export interface DecorDef {
  id: string;
  shape: DecorShape;
  color: string;
  height: number;
}

export const HABITAT_PAD_ID = "habitat_pad";

export const DECOR: DecorDef[] = [
  { id: HABITAT_PAD_ID, shape: "pad", color: "#6b6486", height: 0.16 },
  { id: "decor_spire", shape: "spire", color: "#8f7bd6", height: 4.2 },
  { id: "decor_boulder", shape: "boulder", color: "#6a5f82", height: 1.2 },
  { id: "decor_frond", shape: "frond", color: "#63d6a3", height: 2.6 },
];

export const DECOR_BY_ID: Record<string, DecorDef> = Object.fromEntries(DECOR.map((def) => [def.id, def]));

export const objectEntries: Record<string, GameContextObjectEntry> = Object.fromEntries(
  [...FURNITURE.map((def) => def.id), ...DECOR.map((def) => def.id)].map((id) => [id, {} as GameContextObjectEntry]),
);
