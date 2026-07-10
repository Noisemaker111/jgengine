import type { SkillCheckConfig } from "@jgengine/core/interaction/skillCheck";
import { roomById } from "../mansion/floorPlan";

export interface TreasureDef {
  id: string;
  name: string;
  roomId: string;
  value: number;
  position: readonly [number, number, number];
  promptRadius: number;
  skillCheck: SkillCheckConfig;
}

export interface SideLootDef {
  id: string;
  name: string;
  roomId: string;
  value: number;
  position: readonly [number, number, number];
  promptRadius: number;
  holdSeconds: number;
}

function treasurePosition(roomId: string, dx: number, dz: number): readonly [number, number, number] {
  const [cx, cz] = roomById(roomId).center;
  return [cx + dx, 0.9, cz + dz];
}

export const TREASURE_DEFS: readonly TreasureDef[] = [
  {
    id: "ormolu_clock",
    name: "The Ormolu Clock",
    roomId: "grand_gallery",
    value: 1800,
    position: treasurePosition("grand_gallery", 2.2, -1.2),
    promptRadius: 1.6,
    skillCheck: { trackWidth: 100, zone: { start: 40, end: 62 }, markerPeriod: 1.6, window: 3.2 },
  },
  {
    id: "first_folio",
    name: "The First Folio",
    roomId: "library",
    value: 2400,
    position: treasurePosition("library", -2.0, 1.6),
    promptRadius: 1.6,
    skillCheck: { trackWidth: 100, zone: { start: 36, end: 56 }, markerPeriod: 1.5, window: 3.4 },
  },
  {
    id: "sable_necklace",
    name: "The Sable Necklace",
    roomId: "vault_antechamber",
    value: 3200,
    position: treasurePosition("vault_antechamber", 0, -2.2),
    promptRadius: 1.6,
    skillCheck: { trackWidth: 100, zone: { start: 44, end: 58 }, markerPeriod: 1.1, window: 3.8 },
  },
  {
    id: "marechals_saber",
    name: "The Marechal's Saber",
    roomId: "trophy_room",
    value: 1500,
    position: treasurePosition("trophy_room", 2.2, 1.6),
    promptRadius: 1.6,
    skillCheck: { trackWidth: 100, zone: { start: 38, end: 60 }, markerPeriod: 1.4, window: 3.0 },
  },
  {
    id: "silver_epergne",
    name: "The Silver Epergne",
    roomId: "pantry",
    value: 900,
    position: treasurePosition("pantry", -1.8, -1.4),
    promptRadius: 1.6,
    skillCheck: { trackWidth: 100, zone: { start: 34, end: 58 }, markerPeriod: 1.7, window: 2.8 },
  },
];

function lootPosition(roomId: string, dx: number, dz: number): readonly [number, number, number] {
  const [cx, cz] = roomById(roomId).center;
  return [cx + dx, 0.8, cz + dz];
}

export const SIDE_LOOT_DEFS: readonly SideLootDef[] = [
  { id: "copper_ladles", name: "Copper Ladle Set", roomId: "kitchen", value: 120, position: lootPosition("kitchen", 2.6, 2.6), promptRadius: 1.4, holdSeconds: 0.6 },
  { id: "jeweled_opener", name: "Jeweled Letter-Opener", roomId: "study", value: 200, position: lootPosition("study", -2.6, -1.2), promptRadius: 1.4, holdSeconds: 0.6 },
  { id: "amber_case", name: "Amber Cigar Case", roomId: "smoking_room", value: 150, position: lootPosition("smoking_room", 1.6, -2.6), promptRadius: 1.4, holdSeconds: 0.6 },
  { id: "crystal_candlestick", name: "Crystal Candlestick", roomId: "ballroom", value: 250, position: lootPosition("ballroom", -2.2, 2.0), promptRadius: 1.4, holdSeconds: 0.6 },
  { id: "bronze_medallion", name: "Bronze Medallion", roomId: "trophy_room", value: 100, position: lootPosition("trophy_room", -2.4, -1.8), promptRadius: 1.4, holdSeconds: 0.6 },
  { id: "porcelain_songbird", name: "Porcelain Songbird", roomId: "conservatory", value: 180, position: lootPosition("conservatory", 2.0, -2.2), promptRadius: 1.4, holdSeconds: 0.6 },
];

export function treasureById(id: string): TreasureDef | undefined {
  return TREASURE_DEFS.find((entry) => entry.id === id);
}

export function sideLootById(id: string): SideLootDef | undefined {
  return SIDE_LOOT_DEFS.find((entry) => entry.id === id);
}

export const TOTAL_TREASURE_VALUE = TREASURE_DEFS.reduce((sum, entry) => sum + entry.value, 0);
export const TOTAL_LOOT_VALUE = SIDE_LOOT_DEFS.reduce((sum, entry) => sum + entry.value, 0);
