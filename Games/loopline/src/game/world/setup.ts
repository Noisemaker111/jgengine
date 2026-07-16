import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { editorLayers } from "../../editorLayers";
import { registerBuildCommands } from "../build/commands";
import { placeObject } from "../build/placement";
import { buildableDef } from "../objects/catalog";
import { seedGuests } from "../sim/guests";
import { resetSession, session } from "../session";

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
    target.push({ catalogId, x: marker.position.x, z: marker.position.z });
  }
  const track = editorLayers.paths.find((path) => path.id === TRACK_PATH_ID);
  const trackPieces: SeedPlacement[] = (track?.points ?? []).map((point) => ({
    catalogId: "track_piece",
    x: point.x,
    z: point.z,
  }));
  return [...rides, ...trackPieces, ...rest];
}

function seedStarterPark(ctx: GameContext): void {
  for (const placement of seedPlacements()) placeObject(ctx, placement.catalogId, placement.x, placement.z);
}

export function setupWorld(ctx: GameContext): void {
  resetSession();
  registerBuildCommands(ctx);
  seedStarterPark(ctx);
  seedGuests(ctx, 24);
  session.started = true;
}
