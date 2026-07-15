import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { GRID, snapToGrid, withinPark } from "../catalog";
import { buildableDef, type BuildableDef } from "../objects/catalog";
import { nextObjectId, session, type PlacedObject } from "../session";

function footprintN(def: BuildableDef): number {
  return Math.max(1, Math.round(def.footprint / GRID));
}

export function footprintCells(def: BuildableDef, gx: number, gz: number): string[] {
  const n = footprintN(def);
  const start = -Math.floor((n - 1) / 2);
  const cells: string[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      cells.push(`${gx + (start + i) * GRID},${gz + (start + j) * GRID}`);
    }
  }
  return cells;
}

export function blockCenter(def: BuildableDef, gx: number, gz: number): [number, number] {
  const n = footprintN(def);
  const start = -Math.floor((n - 1) / 2);
  const min = start * GRID;
  const max = (start + n - 1) * GRID;
  return [gx + (min + max) / 2, gz + (min + max) / 2];
}

function neighborsConnected(gx: number, gz: number): boolean {
  const offsets: readonly [number, number][] = [
    [GRID, 0],
    [-GRID, 0],
    [0, GRID],
    [0, -GRID],
  ];
  for (const [dx, dz] of offsets) {
    const occ = session.occupied.get(`${gx + dx},${gz + dz}`);
    if (occ === undefined) continue;
    const placed = session.placed.get(occ);
    if (placed === undefined) continue;
    if (placed.catalogId === "track_piece" || placed.catalogId === "ride_coaster") return true;
  }
  return false;
}

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
}

export function canPlace(catalogId: string, x: number, z: number): PlacementCheck {
  const def = buildableDef(catalogId);
  const gx = snapToGrid(x);
  const gz = snapToGrid(z);
  const cells = footprintCells(def, gx, gz);
  for (const key of cells) {
    const [cxRaw, czRaw] = key.split(",");
    const cx = Number(cxRaw);
    const cz = Number(czRaw);
    if (!withinPark(cx, cz)) return { ok: false, reason: "Outside the fence" };
    if (session.occupied.has(key)) return { ok: false, reason: "Space is taken" };
  }
  if (def.category === "track" && !neighborsConnected(gx, gz)) {
    return { ok: false, reason: "Track must touch the station or existing track" };
  }
  return { ok: true };
}

export function placeObject(ctx: GameContext, catalogId: string, x: number, z: number): PlacedObject | null {
  const check = canPlace(catalogId, x, z);
  if (!check.ok) return null;
  const def = buildableDef(catalogId);
  const gx = snapToGrid(x);
  const gz = snapToGrid(z);
  const [cx, cz] = blockCenter(def, gx, gz);
  const id = nextObjectId(catalogId);
  const placed: PlacedObject = {
    id,
    catalogId,
    x: cx,
    z: cz,
    stock: def.stall?.stock ?? 0,
    soldTotal: 0,
    occupants: 0,
  };
  session.placed.set(id, placed);
  for (const key of footprintCells(def, gx, gz)) session.occupied.set(key, id);
  ctx.scene.object.place(catalogId, cx, 0, cz, { instanceId: id });
  return placed;
}

export function removeObject(ctx: GameContext, instanceId: string): boolean {
  const placed = session.placed.get(instanceId);
  if (placed === undefined) return false;
  for (const [key, occ] of session.occupied) {
    if (occ === instanceId) session.occupied.delete(key);
  }
  session.placed.delete(instanceId);
  for (const guest of session.guests.values()) {
    if (guest.targetId === instanceId) {
      guest.targetId = null;
      guest.target = null;
      guest.phase = "seeking";
      guest.busy = 0;
    }
  }
  ctx.scene.object.remove(instanceId);
  return true;
}

export function placedList(): PlacedObject[] {
  return Array.from(session.placed.values());
}
