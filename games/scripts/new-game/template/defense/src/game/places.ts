import type { EditorDocument } from "@jgengine/core/editor/index";

/**
 * Where things are comes from the authored scene (`editor.scene.json`, edited with F2+E), never from
 * coordinates in code: the lanes the attackers march down (paths whose id starts `lane-`), the pads
 * towers stand on (`tower_pad` markers) and the core every lane ends at (the `core` marker).
 */
export interface Lane {
  id: string;
  points: readonly { x: number; z: number }[];
}

export interface Pad {
  id: string;
  label: string;
  x: number;
  z: number;
}

export function lanes(doc: EditorDocument): Lane[] {
  const found = doc.paths.filter((path) => path.id.startsWith("lane-") && path.points.length >= 2);
  if (found.length === 0) throw new Error('editor.scene.json needs a path whose id starts with "lane-"');
  // A lane that joins another is drawn only up to the join; `meta.route` carries its whole way.
  return found.map((path) => {
    const route = path.meta?.["route"];
    const points = Array.isArray(route) ? (route as [number, number][]).map(([x, z]) => ({ x, z })) : path.points.map((point) => ({ x: point.x, z: point.z }));
    return { id: path.id, points };
  });
}

export function pads(doc: EditorDocument): Pad[] {
  return doc.markers
    .filter((marker) => marker.kind === "tower_pad")
    .map((marker) => ({ id: marker.id, label: marker.label ?? marker.id, x: marker.position.x, z: marker.position.z }));
}

export function coreMarker(doc: EditorDocument): { x: number; z: number } {
  const core = doc.markers.find((marker) => marker.kind === "core");
  if (core === undefined) throw new Error('editor.scene.json needs a marker of kind "core"');
  return { x: core.position.x, z: core.position.z };
}

/** The middle of the field: where the camera starts looking. */
export function fieldCentre(doc: EditorDocument): { x: number; z: number } {
  const field = doc.markers.find((marker) => marker.kind === "field");
  return field === undefined ? { x: 0, z: 0 } : { x: field.position.x, z: field.position.z };
}

/** The nearest pad to a point within `reach` metres that passes `keep`, or null. */
export function padNear(all: readonly Pad[], x: number, z: number, reach: number, keep: (pad: Pad) => boolean = () => true): Pad | null {
  let best: Pad | null = null;
  let bestDistance = reach;
  for (const pad of all) {
    if (!keep(pad)) continue;
    const distance = Math.hypot(pad.x - x, pad.z - z);
    if (distance <= bestDistance) [best, bestDistance] = [pad, distance];
  }
  return best;
}
