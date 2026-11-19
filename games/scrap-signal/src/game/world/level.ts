import { findEditorMarker, normalizeEditorLayers } from "@jgengine/core/editor/document";
import type { EditorDocument, EditorLayersInput, EditorPath } from "@jgengine/core/editor/index";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  placeAuthoredObjectsFromDocument,
  resolveAuthoredObjects,
} from "@jgengine/core/world/authoredObjects";
import type { TerrainPathProfile } from "@jgengine/core/terrain/pathTerrain";
import sceneJson from "../../editor.scene.json";
import { zoneById } from "./zones";

export interface RoutePoint {
  x: number;
  z: number;
  t: number;
}

export interface Route {
  from: string;
  to: string;
  points: readonly RoutePoint[];
}

export interface SidePoi {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  anchorZoneId: string;
  dressing: "ripper_den" | "cache" | "wreck_field";
  spawns: readonly { catalogId: string; count: number }[];
}

interface SidePoiMeta {
  id: string;
  name: string;
  dressing: SidePoi["dressing"];
  anchorZoneId: string;
  spawns: readonly { catalogId: string; count: number }[];
}

const SIDE_POI_META: readonly SidePoiMeta[] = [
  {
    id: "poi_monglet_den",
    name: "Monglet Den",
    anchorZoneId: "rustflat_waste",
    dressing: "ripper_den",
    // Old Tusk's own pack: whelps only, so the boss fight is the boss, not two bruisers beside him.
    spawns: [{ catalogId: "bruiser_brat", count: 5 }],
  },
  {
    id: "poi_lost_cache",
    name: "Lost Apex Cache",
    anchorZoneId: "arid_badlands",
    dressing: "cache",
    spawns: [{ catalogId: "loader", count: 3 }],
  },
  {
    id: "poi_wreck_field",
    name: "Buzzard Wreck Field",
    anchorZoneId: "glasswind_flats",
    dressing: "wreck_field",
    spawns: [{ catalogId: "marauder", count: 3 }, { catalogId: "husk", count: 3 }],
  },
];

export const authoredScene: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);

function requirePoiMarker(id: string) {
  const marker = findEditorMarker(authoredScene, id);
  if (marker === undefined) throw new Error(`editor.scene.json: missing POI marker "${id}"`);
  return marker;
}

export const SIDE_POIS: readonly SidePoi[] = SIDE_POI_META.map((meta) => {
  const marker = requirePoiMarker(meta.id);
  const radius = marker.meta?.["radius"];
  if (typeof radius !== "number") {
    throw new Error(`editor.scene.json: POI "${meta.id}" has no numeric meta.radius`);
  }
  return {
    id: meta.id,
    name: meta.name,
    x: marker.position.x,
    z: marker.position.z,
    radius,
    anchorZoneId: meta.anchorZoneId,
    dressing: meta.dressing,
    spawns: meta.spawns,
  };
});

const POI_IDS = new Set(SIDE_POIS.map((poi) => poi.id));

function pathToRoute(path: EditorPath): Route {
  const count = path.points.length;
  return {
    from: String(path.meta?.["from"] ?? ""),
    to: String(path.meta?.["to"] ?? ""),
    points: path.points.map((point, index) => ({
      x: point.x,
      z: point.z,
      t: count <= 1 ? 0 : index / (count - 1),
    })),
  };
}

const roadRoutes = authoredScene.paths.filter((path) => path.kind === "road").map(pathToRoute);

export const ROUTES: readonly Route[] = roadRoutes.filter((route) => !POI_IDS.has(route.to));

export const SPUR_ROUTES: readonly Route[] = roadRoutes.filter((route) => POI_IDS.has(route.to));

type HeightSampler = (x: number, z: number) => number;

interface RouteEnd {
  center: { x: number; z: number };
  radius: number;
}

function routeEnd(route: Route): { end: RouteEnd; height: (heightAt: HeightSampler) => number } {
  const toZone = zoneById(route.to);
  if (toZone !== undefined) {
    return { end: { center: toZone.center, radius: toZone.flattenRadius }, height: (h) => h(toZone.center.x, toZone.center.z) };
  }
  const poi = SIDE_POIS.find((candidate) => candidate.id === route.to)!;
  const anchor = zoneById(poi.anchorZoneId)!;
  return { end: { center: { x: poi.x, z: poi.z }, radius: poi.radius }, height: (h) => h(anchor.center.x, anchor.center.z) };
}

/**
 * Circular flatten pads leveling each side POI onto its anchor zone's height — the arrival apron the
 * spur road grades into. Kept as radial `flatten` masks because a POI is a round clearing, not a corridor.
 */
export function poiFlattenMasks(
  heightAt: HeightSampler,
): readonly { center: readonly [number, number]; radius: number; height: number; falloff: number }[] {
  return SIDE_POIS.map((poi) => {
    const anchor = zoneById(poi.anchorZoneId)!;
    return {
      center: [poi.x, poi.z] as const,
      radius: poi.radius,
      height: heightAt(anchor.center.x, anchor.center.z),
      falloff: 12,
    };
  });
}

export function roadPathProfiles(heightAt: HeightSampler): readonly TerrainPathProfile[] {
  return [...ROUTES, ...SPUR_ROUTES].flatMap((route): TerrainPathProfile[] => {
    const from = zoneById(route.from)!;
    const { end, height: endHeight } = routeEnd(route);
    // Trim the corridor to the open span between the two aprons, so the zone/POI flatten pads own their
    // interiors and the road never fights them near the endpoints (mirrors the retired mask filter).
    const corridor = route.points.filter((point) => {
      const fromDistance = Math.hypot(point.x - from.center.x, point.z - from.center.z);
      const toDistance = Math.hypot(point.x - end.center.x, point.z - end.center.z);
      return fromDistance > from.flattenRadius && toDistance > end.radius;
    });
    if (corridor.length < 2) return [];
    return [
      {
        points: corridor.map((point) => [point.x, point.z] as const),
        width: 28,
        shoulder: 60,
        height: { kind: "grade", start: heightAt(from.center.x, from.center.z), end: endHeight(heightAt) },
        // Walls rise only where the graded road cuts into open badlands, not across the flattened aprons it links.
        retaining: { wallHeight: 24, threshold: 5, taper: 4 },
      },
    ];
  });
}

export interface LevelPiece {
  catalogId: string;
  x: number;
  z: number;
  instanceId: string;
  rotation?: number;
}

export const AUTHORED_PIECES: readonly LevelPiece[] = resolveAuthoredObjects(authoredScene).map((object) => ({
  catalogId: object.catalogId,
  x: object.x,
  z: object.z,
  instanceId: object.instanceId,
  rotation: object.rotationY,
}));

const NPC_META: readonly { id: string; name: string }[] = [
  { id: "npc_sparx", name: "dr_sparx" },
  { id: "npc_rigg", name: "rigg" },
  { id: "npc_gauge", name: "gauge" },
];

export const NPC_PLACEMENTS: readonly { id: string; name: string; x: number; z: number }[] = NPC_META.map(
  (meta) => {
    const marker = findEditorMarker(authoredScene, meta.id);
    if (marker === undefined) throw new Error(`editor.scene.json: missing NPC marker "${meta.id}"`);
    return { id: meta.id, name: meta.name, x: marker.position.x, z: marker.position.z };
  },
);

export function placeLevel(ctx: GameContext): void {
  placeAuthoredObjectsFromDocument(
    ctx.scene.object,
    authoredScene,
    (x, z) => ctx.world.groundHeightAt(x, z),
    { verticalOffset: 0.5 },
  );
  for (const npc of NPC_PLACEMENTS) {
    ctx.scene.entity.spawn(npc.name, {
      id: npc.id,
      position: [npc.x, ctx.world.groundHeightAt(npc.x, npc.z), npc.z],
      role: "npc",
    });
  }
}
