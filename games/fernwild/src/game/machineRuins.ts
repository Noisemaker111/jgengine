import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { markersOfKind, type AuthoredSpawnMarkerLike as AuthoredMarker } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import type { WorldSolid } from "@jgengine/core/world/worldSolids";

/**
 * The colony's rusted fabricators as shapes, no drawing: box parts in the fabricator's own frame (+Z its
 * front), its collision, and the cable vines draped from its gantry. `world/MachineRuins.tsx` draws them;
 * the solids keep the technician and the bots from walking through the bed.
 */
export interface FabricatorPart {
  center: [number, number, number];
  size: [number, number, number];
  material: "rust" | "steel" | "dark" | "lamp";
}

/** Bed 7 m by 5 m, gantry 5 m tall. */
const BED = { width: 7, depth: 5, height: 1.4 } as const;
const GANTRY = 5;

export function fabricatorParts(): FabricatorPart[] {
  const parts: FabricatorPart[] = [
    { center: [0, BED.height / 2, 0], size: [BED.width, BED.height, BED.depth], material: "rust" },
    { center: [0, BED.height + 0.08, 0], size: [BED.width * 0.8, 0.16, BED.depth * 0.75], material: "dark" },
    // The gantry: two uprights and a beam, the print head parked mid-beam.
    { center: [-BED.width / 2 + 0.3, BED.height + GANTRY / 2, 0], size: [0.5, GANTRY, 0.6], material: "steel" },
    { center: [BED.width / 2 - 0.3, BED.height + GANTRY / 2, 0], size: [0.5, GANTRY, 0.6], material: "steel" },
    { center: [0, BED.height + GANTRY, 0], size: [BED.width, 0.5, 0.7], material: "steel" },
    { center: [0.8, BED.height + GANTRY - 0.8, 0], size: [1.2, 1.1, 1.1], material: "rust" },
    { center: [0.8, BED.height + GANTRY - 1.6, 0], size: [0.25, 0.6, 0.25], material: "dark" },
    // A control cabinet on the side, its status lamp still lit.
    { center: [BED.width / 2 + 0.7, 1.2, BED.depth / 2 - 1], size: [1.2, 2.4, 1], material: "dark" },
    { center: [BED.width / 2 + 0.7, 2.2, BED.depth / 2 - 0.48], size: [0.35, 0.35, 0.08], material: "lamp" },
  ];
  // A half-printed frame left on the bed: legs and a ribcage of bars.
  for (let i = 0; i < 4; i += 1) parts.push({ center: [-1.5 + i, BED.height + 0.9, 0], size: [0.18, 1.6, 0.18], material: "steel" });
  parts.push({ center: [0, BED.height + 1.7, 0], size: [3.4, 0.2, 1.2], material: "rust" });
  return parts;
}

function yawOf(marker: AuthoredMarker): number {
  return Number(marker.meta?.["yaw"] ?? 0);
}

/** A point in the fabricator's frame, in the world. */
function toWorld(marker: AuthoredMarker, x: number, z: number): [number, number] {
  const yaw = yawOf(marker);
  return [marker.position.x + Math.cos(yaw) * x + Math.sin(yaw) * z, marker.position.z - Math.sin(yaw) * x + Math.cos(yaw) * z];
}

export function fabricatorSolids(marker: AuthoredMarker, ground: (x: number, z: number) => number): WorldSolid[] {
  const base = ground(marker.position.x, marker.position.z);
  return [{ center: [marker.position.x, base + BED.height / 2, marker.position.z], halfExtents: [BED.width / 2, BED.height / 2 + 0.5, BED.depth / 2], rotationY: yawOf(marker) }];
}

/** Make every authored fabricator's bed solid in the world, as the world starts. */
export function placeFabricatorSolids(ctx: GameContext): void {
  ctx.world.solids.set("fernwild:fabricators", markersOfKind(editorLayers, "fabricator").flatMap((marker) => fabricatorSolids(marker, ctx.world.groundHeightAt)));
}

/**
 * Cable vines: from points along the gantry beam, sagging out to the ground a few metres away, as if the
 * jungle had grown through the fabricator's wiring. Deterministic from the marker id.
 */
export function vineCurves(marker: AuthoredMarker, ground: (x: number, z: number) => number): [number, number, number][][] {
  const count = Number(marker.meta?.["vines"] ?? 5);
  let seed = [...marker.id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const top = ground(marker.position.x, marker.position.z) + BED.height + GANTRY;
  const curves: [number, number, number][][] = [];
  for (let i = 0; i < count; i += 1) {
    const along = (rand() - 0.5) * BED.width * 0.9;
    const [sx, sz] = toWorld(marker, along, 0);
    const angle = rand() * Math.PI * 2;
    const reach = 5 + rand() * 5;
    const ex = sx + Math.cos(angle) * reach;
    const ez = sz + Math.sin(angle) * reach;
    const end = ground(ex, ez);
    const points: [number, number, number][] = [];
    for (let k = 0; k <= 6; k += 1) {
      const t = k / 6;
      const x = sx + (ex - sx) * t;
      const z = sz + (ez - sz) * t;
      // A sagging curve that ends on the ground.
      const line = top + (end - top) * t;
      const sag = Math.sin(t * Math.PI) * (1.2 + rand() * 0.8);
      points.push([x, Math.max(ground(x, z) + 0.05, line - sag), z]);
    }
    curves.push(points);
  }
  return curves;
}
