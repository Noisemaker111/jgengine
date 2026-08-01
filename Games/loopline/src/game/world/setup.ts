import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { editorMarkerXZ } from "@jgengine/core/editor/index";

import { editorLayers } from "../../editorLayers";
import { GRID, snapToGrid } from "../catalog";
import { buildableDef, type BuildableDef } from "../objects/catalog";
import { seedGuests } from "../sim/guests";
import { nextObjectId, resetSession, session, type PlacedObject } from "../session";

const TRACK_PATH_ID = "coaster-track";

export interface SeedPlacement {
  catalogId: string;
  x: number;
  z: number;
}

function markerCatalogId(meta: Record<string, unknown> | undefined): string {
  const id = meta?.["catalogId"];
  if (typeof id !== "string") throw new Error("loopline: scene marker missing meta.catalogId");
  return id;
}

/**
 * The starter-park placement order, derived from `editor.scene.json`. Rides and stalls seed first (the
 * coaster station must exist before the track pieces test connectivity), then the coaster's `route`
 * path becomes track pieces, then the remaining scenery and path markers. Coordinates live only in the
 * authored document — this reads them back in the one order the placement rules require.
 */
export function seedPlacements(): SeedPlacement[] {
  const rides: SeedPlacement[] = [];
  const rest: SeedPlacement[] = [];
  for (const marker of editorLayers.markers) {
    const catalogId = markerCatalogId(marker.meta);
    const category = buildableDef(catalogId).category;
    const target = category === "ride" || category === "stall" ? rides : rest;
    const [x, z] = editorMarkerXZ(marker);
    target.push({ catalogId, x, z });
  }
  const track = editorLayers.paths.find((path) => path.id === TRACK_PATH_ID);
  const trackPieces: SeedPlacement[] = (track?.points ?? []).map((point) => ({
    catalogId: "track_piece",
    x: point.x,
    z: point.z,
  }));
  return [...rides, ...trackPieces, ...rest];
}

function footprintN(def: BuildableDef): number {
  return Math.max(1, Math.round(def.footprint / GRID));
}

function footprintCells(def: BuildableDef, gx: number, gz: number): string[] {
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

function blockCenter(def: BuildableDef, gx: number, gz: number): [number, number] {
  const n = footprintN(def);
  const start = -Math.floor((n - 1) / 2);
  const min = start * GRID;
  const max = (start + n - 1) * GRID;
  return [gx + (min + max) / 2, gz + (min + max) / 2];
}

// The authored document is the source of truth; the only rule kept from the deleted
// build mode is first-wins on an occupied cell, so seeding order stays meaningful.
function seedPlace(ctx: GameContext, catalogId: string, x: number, z: number): void {
  const def = buildableDef(catalogId);
  const gx = snapToGrid(x);
  const gz = snapToGrid(z);
  const cells = footprintCells(def, gx, gz);
  for (const key of cells) {
    if (session.occupied.has(key)) return;
  }
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
  for (const key of cells) session.occupied.set(key, id);
  ctx.scene.object.place(catalogId, cx, 0, cz, { instanceId: id });
}

function seedStarterPark(ctx: GameContext): void {
  for (const placement of seedPlacements()) seedPlace(ctx, placement.catalogId, placement.x, placement.z);
}

export function setupWorld(ctx: GameContext): void {
  resetSession();
  seedStarterPark(ctx);
  seedGuests(ctx, 24);
  session.started = true;
}
