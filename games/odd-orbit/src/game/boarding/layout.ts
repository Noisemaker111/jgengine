import { editorLayers } from "../../editorLayers";
import { ROOM_COLUMNS, ROOM_SLOTS } from "./rooms";

/**
 * Where each room berth sits in the world. The berths are authored in the scene document as
 * `room_berth` markers (meta `slot`), so the editor moves a module and the sim, the walk paths and
 * the module renderer all follow. The airlock is the habitat's authored gate marker.
 */
export interface BerthPose { slot: number; x: number; z: number; rotation: number }

/** Module footprint, metres: wide along the corridor, deep away from it. */
export const BERTH_SIZE = { w: 4.6, d: 4.4 } as const;

function authoredBerths(): BerthPose[] {
  return editorLayers.markers
    .filter((marker) => marker.kind === "room_berth" && typeof marker.meta?.["slot"] === "number")
    .map((marker) => ({ slot: marker.meta!["slot"] as number, x: marker.position.x, z: marker.position.z, rotation: marker.rotationY ?? 0 }))
    .sort((a, b) => a.slot - b.slot);
}

const AUTHORED = authoredBerths();

export function berthPose(slot: number): BerthPose {
  const authored = AUTHORED.find((pose) => pose.slot === slot);
  if (authored !== undefined) return authored;
  const col = slot % ROOM_COLUMNS;
  const deck = Math.floor(slot / ROOM_COLUMNS);
  return { slot, x: -7.5 + col * 5, z: -13 - deck * 5, rotation: 0 };
}

export const BERTHS: readonly BerthPose[] = Array.from({ length: ROOM_SLOTS }, (_, slot) => berthPose(slot));

const gate = editorLayers.markers.find((marker) => marker.meta?.["object"] === "hab_gate");
/** The airlock between the common room and the corridor of rooms. */
export const AIRLOCK = { x: gate?.position.x ?? 0, z: gate?.position.z ?? -9 } as const;

/** Every berth is authored in the scene document. */
export function authoredBerthCount(): number {
  return AUTHORED.length;
}
