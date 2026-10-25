import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { GRID } from "../catalog";
import { BUILDABLES } from "../objects/catalog";
import { LOT, sizeOf } from "../lot";

/**
 * The lot's ground: a height level per cell, kept in the world as one fact (`park.land`, a digit per
 * cell, row by row) so it saves, syncs and undoes with everything else. Level 0 is the lawn; each
 * level is {@link LEVEL_HEIGHT} metres up. A structure needs level ground under its whole footprint;
 * paths may climb one level from cell to cell (a ramp).
 */

export const LAND_FACT = "park.land";
export const MAX_LEVEL = 4;
export const LEVEL_HEIGHT = 1.2;
/** What one raise or lower of one cell costs. */
export const LAND_COST = 25;

export const FLAT_LAND = "0".repeat(LOT.cols * LOT.rows);

const indexOf = (col: number, row: number): number => row * LOT.cols + col;
const inside = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < LOT.cols && row < LOT.rows;

function landOf(w: WorldModel): string {
  const value = w.fact(LAND_FACT);
  return typeof value === "string" && value.length === FLAT_LAND.length ? value : FLAT_LAND;
}

/** The level of one cell (0 outside the lot). */
export function levelAt(w: WorldModel, col: number, row: number): number {
  if (!inside(col, row)) return 0;
  return Number(landOf(w)[indexOf(col, row)] ?? 0);
}

/** The cell under a point on the lot. */
export function cellAt(x: number, z: number): [number, number] {
  return [Math.floor((x - LOT.origin[0]) / GRID), Math.floor((z - LOT.origin[1]) / GRID)];
}

/** Ground height in metres under a point: where a guest stands or a structure sits. */
export function groundAt(w: WorldModel, x: number, z: number): number {
  const [col, row] = cellAt(x, z);
  return levelAt(w, col, row) * LEVEL_HEIGHT;
}

/** Every cell a structure at `cell` would cover. */
export function footprintCells(kind: string, cell: readonly [number, number]): [number, number][] {
  const n = sizeOf(BUILDABLES[kind]!);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) out.push([cell[0] + i, cell[1] + j]);
  return out;
}

/** True when every cell under the footprint is at one level. */
export function levelUnder(w: WorldModel, kind: string, cell: readonly [number, number]): boolean {
  const cells = footprintCells(kind, cell);
  const first = levelAt(w, cells[0]![0], cells[0]![1]);
  return cells.every(([col, row]) => levelAt(w, col, row) === first);
}

/** The structure standing on a cell, if any. */
export function occupantOf(w: WorldModel, col: number, row: number): string | null {
  for (const instance of w.instances()) {
    if (instance.cell === null) continue;
    const n = sizeOf(BUILDABLES[instance.kind]!);
    const [c0, r0] = instance.cell;
    if (col >= c0 && col < c0 + n && row >= r0 && row < r0 + n) return instance.id;
  }
  return null;
}

export type LandCheck = { ok: true; level: number } | { ok: false; reason: string };

/** Can this cell go up (`+1`) or down (`-1`) a level? */
export function canShape(w: WorldModel, col: number, row: number, step: 1 | -1): LandCheck {
  if (!inside(col, row)) return { ok: false, reason: "Outside the fence" };
  if (occupantOf(w, col, row) !== null) return { ok: false, reason: "Something is built there" };
  const level = levelAt(w, col, row) + step;
  if (level < 0) return { ok: false, reason: "Already at the lowest level" };
  if (level > MAX_LEVEL) return { ok: false, reason: "Already at the highest level" };
  if (w.num("park.cash") < LAND_COST) return { ok: false, reason: "Not enough cash" };
  return { ok: true, level };
}

/** Raise or lower one cell, paying for it. Returns the refusal, or null when the ground moved. */
export function shapeLand(w: WorldModel, col: number, row: number, step: 1 | -1): string | null {
  const check = canShape(w, col, row, step);
  if (!check.ok) return check.reason;
  const land = landOf(w);
  const i = indexOf(col, row);
  w.set(LAND_FACT, land.slice(0, i) + String(check.level) + land.slice(i + 1));
  w.change({ "park.cash": -LAND_COST, "park.spent_today": LAND_COST });
  return null;
}

/** Put one cell back to a level without paying (undo). */
export function setLevel(w: WorldModel, col: number, row: number, level: number): void {
  if (!inside(col, row)) return;
  const land = landOf(w);
  const i = indexOf(col, row);
  w.set(LAND_FACT, land.slice(0, i) + String(Math.max(0, Math.min(MAX_LEVEL, level))) + land.slice(i + 1));
}

/** Every raised cell, for the renderer. */
export function raisedCells(w: WorldModel): { col: number; row: number; level: number }[] {
  const land = landOf(w);
  const out: { col: number; row: number; level: number }[] = [];
  for (let i = 0; i < land.length; i += 1) {
    const level = Number(land[i]);
    if (level > 0) out.push({ col: i % LOT.cols, row: Math.floor(i / LOT.cols), level });
  }
  return out;
}

/** World centre of a cell. */
export function cellCentre(col: number, row: number): [number, number] {
  return [LOT.origin[0] + (col + 0.5) * GRID, LOT.origin[1] + (row + 0.5) * GRID];
}

/** The two land tools the build bar offers: they sit in the tool slot like a blueprint does. */
export const LAND_TOOLS = {
  land_raise: { label: "Raise Land", icon: "⬆️", step: 1, blurb: `Lift the ground a level. Click a cell or drag over an area · $${LAND_COST} a cell.` },
  land_lower: { label: "Lower Land", icon: "⬇️", step: -1, blurb: `Dig the ground down a level. Click a cell or drag over an area · $${LAND_COST} a cell.` },
} as const satisfies Record<string, { label: string; icon: string; step: 1 | -1; blurb: string }>;
export type LandTool = keyof typeof LAND_TOOLS;

export function isLandTool(id: string | null): id is LandTool {
  return id !== null && Object.hasOwn(LAND_TOOLS, id);
}

/** Every cell in the rectangle between two cells, corners included. */
export function rectCells(a: readonly [number, number], b: readonly [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (let c = Math.min(a[0], b[0]); c <= Math.max(a[0], b[0]); c += 1) for (let r = Math.min(a[1], b[1]); r <= Math.max(a[1], b[1]); r += 1) out.push([c, r]);
  return out;
}

/** The cells of a dragged line: along the longer side first, then round the corner (an L). */
export function lineCells(a: readonly [number, number], b: readonly [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const colsFirst = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const dc = Math.sign(b[0] - a[0]), dr = Math.sign(b[1] - a[1]);
  let [c, r] = a;
  out.push([c, r]);
  const walk = (alongCols: boolean) => {
    if (alongCols) while (c !== b[0]) { c += dc; out.push([c, r]); }
    else while (r !== b[1]) { r += dr; out.push([c, r]); }
  };
  walk(colsFirst);
  walk(!colsFirst);
  return out;
}
