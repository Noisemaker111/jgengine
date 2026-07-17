import { findEditorCatalogEntry, type EditorDocument } from "@jgengine/core/editor/index";
import type { AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";

export interface SlowSpec {
  factor: number;
  durationMs: number;
}

export interface TowerDef {
  id: string;
  label: string;
  description: string;
  cost: number;
  /** Seconds a placed tower spends under construction before it becomes active. Omitted = instant. */
  buildSeconds?: number;
  range: number;
  damage: number;
  fireRateHz: number;
  splashRadius: number;
  slow?: SlowSpec;
  targeting: AutoTargetPolicy;
  boltColor: string;
  icon: "bow" | "bomb" | "frost";
  color: string;
  trim: string;
}

export const TOWER_CATALOG: Record<string, TowerDef> = {
  tower_archer: {
    id: "tower_archer",
    label: "Archer Post",
    description: "Fast single-target shots, long range.",
    cost: 50,
    range: 7,
    damage: 8,
    fireRateHz: 2,
    splashRadius: 0,
    targeting: "first",
    boltColor: "#f4d35e",
    icon: "bow",
    color: "#8a5a34",
    trim: "#4c3018",
  },
  tower_cannon: {
    id: "tower_cannon",
    label: "Cannon Redoubt",
    description: "Slow, heavy splash damage.",
    cost: 90,
    range: 5.5,
    damage: 26,
    fireRateHz: 0.7,
    splashRadius: 2.2,
    targeting: "first",
    boltColor: "#e0763a",
    icon: "bomb",
    color: "#5b5b62",
    trim: "#2c2c31",
  },
  tower_frost: {
    id: "tower_frost",
    label: "Frost Spire",
    description: "Chills raiders, slowing their advance.",
    cost: 70,
    range: 6,
    damage: 4,
    fireRateHz: 1.2,
    splashRadius: 0,
    slow: { factor: 0.45, durationMs: 1600 },
    targeting: "first",
    boltColor: "#7fd8e8",
    icon: "frost",
    color: "#3d6b82",
    trim: "#1f3b48",
  },
};

export const TOWER_IDS: readonly string[] = Object.keys(TOWER_CATALOG);

function num(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Resolves a tower definition, overlaying in-editor catalog edits from the scene document when present
 * (`document.catalogs` / `findEditorCatalogEntry`).
 */
export function towerDef(id: string, document?: EditorDocument): TowerDef {
  const def = TOWER_CATALOG[id];
  if (def === undefined) throw new Error(`tower-guard: unknown tower id "${id}"`);
  if (document === undefined) return def;
  const entry = findEditorCatalogEntry(document, "towers", id);
  if (entry?.meta === undefined) return def;
  return {
    ...def,
    cost: num(entry.meta, "cost", def.cost),
    range: num(entry.meta, "range", def.range),
    damage: num(entry.meta, "damage", def.damage),
    fireRateHz: num(entry.meta, "fireRateHz", def.fireRateHz),
    splashRadius: num(entry.meta, "splashRadius", def.splashRadius),
  };
}
