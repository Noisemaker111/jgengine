import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { BUILDABLES } from "../objects/catalog";
import { cellFor, sizeOf } from "../park";
import { ENTRANCE, EXIT, touchesRide } from "./network";
import { levelUnder } from "./terrain";

/**
 * The placement rules the world cannot declare: coaster track has to touch the station or track
 * already laid, anything but a path needs level ground, and a ride entrance or exit has to stand
 * against a ride. Everything else - the lot's edge, a taken cell, a locked blueprint, the cash - is
 * the world's own `canPlace`.
 */

const RAIL = new Set(["track_piece", "ride_coaster"]);

/** True when a 1-cell piece at `cell` sits beside the station or a laid piece. */
export function touchesRail(w: WorldModel, cell: readonly [number, number]): boolean {
  const neighbours: [number, number][] = [
    [cell[0] + 1, cell[1]],
    [cell[0] - 1, cell[1]],
    [cell[0], cell[1] + 1],
    [cell[0], cell[1] - 1],
  ];
  for (const instance of w.instances()) {
    if (!RAIL.has(instance.kind) || instance.cell === null) continue;
    const n = sizeOf(BUILDABLES[instance.kind]!);
    const [c0, r0] = instance.cell;
    if (neighbours.some(([c, r]) => c >= c0 && c < c0 + n && r >= r0 && r < r0 + n)) return true;
  }
  return false;
}

export type PlacementCheck = { ok: true; cell: [number, number] } | { ok: false; reason: string; code: string };

/** Can this blueprint go down where the pointer is? The world's answer, then the track rule. */
export function placementAt(w: WorldModel, kind: string, x: number, z: number): PlacementCheck {
  if (!Object.hasOwn(BUILDABLES, kind)) return { ok: false, reason: "Unknown blueprint", code: "unknown" };
  const cell = cellFor(kind, x, z);
  const refused = w.canPlace(kind, { cell });
  if (refused !== null) return { ok: false, reason: refused.reason === "blocked" ? "Outside the fence" : refused.message, code: refused.reason };
  if (BUILDABLES[kind]!.category === "track" && !touchesRail(w, cell)) {
    return { ok: false, reason: "Track must touch the station or existing track", code: "rail" };
  }
  // Paths climb from level to level; everything else needs flat ground under its whole footprint.
  if (BUILDABLES[kind]!.category !== "path" && !levelUnder(w, kind, cell)) {
    return { ok: false, reason: "The ground isn’t level here", code: "slope" };
  }
  if ((kind === ENTRANCE || kind === EXIT) && !touchesRide(w, cell)) {
    return { ok: false, reason: "Put it right against a ride", code: "door" };
  }
  return { ok: true, cell };
}
