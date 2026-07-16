import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { connectedTo, type GridCell } from "@jgengine/core/world/footprintGrid";

import { GRID, snapToGrid, withinPark } from "../catalog";
import { buildableDef, type BuildableDef } from "../objects/catalog";
import { nextObjectId, session, type PlacedObject } from "../session";

function footprintN(def: BuildableDef): number {
  return Math.max(1, Math.round(def.footprint / GRID));
}

export function footprintCells(def: BuildableDef, gx: number, gz: number): GridCell[] {
  const n = footprintN(def);
  const start = -Math.floor((n - 1) / 2);
  const cells: GridCell[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      cells.push({ col: gx / GRID + start + i, row: gz / GRID + start + j });
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

function connectsToTrack(kind: string): boolean {
  return kind === "track_piece" || kind === "ride_coaster";
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
  for (const cell of cells) {
    if (!withinPark(cell.col * GRID, cell.row * GRID)) return { ok: false, reason: "Outside the fence" };
    if (!session.grid.isFree([cell])) return { ok: false, reason: "Space is taken" };
  }
  if (def.category === "track" && !connectedTo(session.grid, cells, connectsToTrack)) {
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
  session.grid.reserve(id, catalogId, footprintCells(def, gx, gz));
  ctx.scene.object.place(catalogId, cx, 0, cz, { instanceId: id });
  return placed;
}

export function removeObject(ctx: GameContext, instanceId: string): boolean {
  const placed = session.placed.get(instanceId);
  if (placed === undefined) return false;
  session.grid.release(instanceId);
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
