import { normalizeEditorLayers } from "@jgengine/core/editor/document";
import type { EditorDocument, EditorLayersInput, EditorPath } from "@jgengine/core/editor/index";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
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
  dressing: "skag_den" | "cache" | "wreck_field";
  spawns: readonly { catalogId: string; count: number }[];
}

export const SIDE_POIS: readonly SidePoi[] = [
  {
    id: "poi_monglet_den",
    name: "Monglet Den",
    x: -640,
    z: 430,
    radius: 26,
    anchorZoneId: "windshear_waste",
    dressing: "skag_den",
    spawns: [{ catalogId: "bullymong_brat", count: 4 }, { catalogId: "bullymong", count: 2 }],
  },
  {
    id: "poi_lost_cache",
    name: "Lost Apex Cache",
    x: 180,
    z: 210,
    radius: 22,
    anchorZoneId: "arid_badlands",
    dressing: "cache",
    spawns: [{ catalogId: "loader", count: 3 }],
  },
  {
    id: "poi_wreck_field",
    name: "Buzzard Wreck Field",
    x: 640,
    z: 40,
    radius: 28,
    anchorZoneId: "the_dust",
    dressing: "wreck_field",
    spawns: [{ catalogId: "marauder", count: 3 }, { catalogId: "psycho", count: 3 }],
  },
];

/** The authored scene document: placed level props (markers) and the road/spur network (paths). */
export const authoredScene: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);

const POI_IDS = new Set(SIDE_POIS.map((poi) => poi.id));

function pathToRoute(path: EditorPath): Route {
  const count = path.points.length;
  return {
    from: String(path.meta?.from ?? ""),
    to: String(path.meta?.to ?? ""),
    points: path.points.map((point, index) => ({
      x: point.x,
      z: point.z,
      t: count <= 1 ? 0 : index / (count - 1),
    })),
  };
}

const roadRoutes = authoredScene.paths.filter((path) => path.kind === "road").map(pathToRoute);

/** Campaign roads chaining zone to zone, draped and flattened from the authored document. */
export const ROUTES: readonly Route[] = roadRoutes.filter((route) => !POI_IDS.has(route.to));

/** Spurs peeling off a campaign zone toward a side POI. */
export const SPUR_ROUTES: readonly Route[] = roadRoutes.filter((route) => POI_IDS.has(route.to));

export function roadFlattenMasks(
  heightAt: (x: number, z: number) => number,
): readonly { center: readonly [number, number]; radius: number; height: number; falloff: number }[] {
  const corridorMasks = (
    points: readonly RoutePoint[],
    fromCenter: { x: number; z: number },
    fromRadius: number,
    toCenter: { x: number; z: number },
    toRadius: number,
  ) => {
    const fromHeight = heightAt(fromCenter.x, fromCenter.z);
    const toHeight = heightAt(toCenter.x, toCenter.z);
    const length = Math.hypot(toCenter.x - fromCenter.x, toCenter.z - fromCenter.z);
    const rampStart = fromRadius;
    const rampSpan = Math.max(1, length - fromRadius - toRadius);
    return points
      .filter((point) => {
        const fromDistance = Math.hypot(point.x - fromCenter.x, point.z - fromCenter.z);
        const toDistance = Math.hypot(point.x - toCenter.x, point.z - toCenter.z);
        return fromDistance > fromRadius - 14 && toDistance > toRadius - 14;
      })
      .map((point) => {
        const rampT = Math.min(1, Math.max(0, (point.t * length - rampStart) / rampSpan));
        return {
          center: [point.x, point.z] as const,
          radius: 14,
          height: fromHeight + (toHeight - fromHeight) * rampT,
          falloff: 8,
        };
      });
  };

  const mainMasks = ROUTES.flatMap((route) => {
    const from = zoneById(route.from)!;
    const to = zoneById(route.to)!;
    return corridorMasks(route.points, from.center, from.flattenRadius, to.center, to.flattenRadius);
  });

  const spurMasks = SPUR_ROUTES.flatMap((route) => {
    const from = zoneById(route.from)!;
    const poi = SIDE_POIS.find((candidate) => candidate.id === route.to)!;
    return corridorMasks(route.points, from.center, from.flattenRadius, { x: poi.x, z: poi.z }, poi.radius);
  });

  const poiMasks = SIDE_POIS.map((poi) => {
    const anchor = zoneById(poi.anchorZoneId)!;
    return {
      center: [poi.x, poi.z] as const,
      radius: poi.radius,
      height: heightAt(anchor.center.x, anchor.center.z),
      falloff: 12,
    };
  });

  const wallMasks = [...ROUTES, ...SPUR_ROUTES].flatMap((route) => {
    const from = zoneById(route.from)!;
    const toZone = zoneById(route.to);
    const poi = SIDE_POIS.find((candidate) => candidate.id === route.to);
    const toCenter = toZone?.center ?? { x: poi!.x, z: poi!.z };
    const toRadius = toZone?.flattenRadius ?? poi!.radius;
    const fromHeight = heightAt(from.center.x, from.center.z);
    const toHeight = heightAt(toCenter.x, toCenter.z);
    const length = Math.hypot(toCenter.x - from.center.x, toCenter.z - from.center.z);
    const rampSpan = Math.max(1, length - from.flattenRadius - toRadius);
    const walls: { center: readonly [number, number]; radius: number; height: number; falloff: number }[] = [];
    for (let index = 0; index < route.points.length - 1; index += 2) {
      const point = route.points[index]!;
      const next = route.points[index + 1]!;
      const fromDistance = Math.hypot(point.x - from.center.x, point.z - from.center.z);
      const toDistance = Math.hypot(point.x - toCenter.x, point.z - toCenter.z);
      if (fromDistance < from.flattenRadius + 10 || toDistance < toRadius + 10) continue;
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const segment = Math.hypot(dx, dz) || 1;
      const rampT = Math.min(1, Math.max(0, (point.t * length - from.flattenRadius) / rampSpan));
      const roadHeight = fromHeight + (toHeight - fromHeight) * rampT;
      for (const side of [-1, 1]) {
        walls.push({
          center: [point.x + (-dz / segment) * 40 * side, point.z + (dx / segment) * 40 * side] as const,
          radius: 26,
          height: roadHeight + 22,
          falloff: 14,
        });
      }
    }
    return walls;
  });

  return [...wallMasks, ...poiMasks, ...mainMasks, ...spurMasks];
}

export interface PlacedPiece {
  catalogId: string;
  x: number;
  z: number;
  instanceId: string;
  rotation?: number;
}

/** Every placed level prop, read straight off the authored document (`meta.catalogId`). */
export const AUTHORED_PIECES: readonly PlacedPiece[] = authoredScene.markers
  .filter((marker) => typeof marker.meta?.catalogId === "string")
  .map((marker) => ({
    catalogId: marker.meta!.catalogId as string,
    x: marker.position.x,
    z: marker.position.z,
    instanceId: marker.id,
    rotation: marker.rotationY ?? 0,
  }));

export const NPC_PLACEMENTS: readonly { id: string; name: string; x: number; z: number }[] = (() => {
  const hub = zoneById("arid_badlands")!;
  return [
    { id: "npc_zed", name: "dr_sparx", x: hub.center.x + 12, z: hub.center.z - 10 },
    { id: "npc_rigg", name: "rigg", x: hub.center.x - 10, z: hub.center.z - 8 },
    { id: "npc_gauge", name: "gauge", x: hub.center.x + 2, z: hub.center.z + 20 },
  ];
})();

export function placeLevel(ctx: GameContext): void {
  for (const piece of AUTHORED_PIECES) {
    const y = ctx.world.groundHeightAt(piece.x, piece.z);
    ctx.scene.object.place(piece.catalogId, piece.x, y + 0.5, piece.z, {
      instanceId: piece.instanceId,
      rotation: piece.rotation ?? 0,
    });
  }
  for (const npc of NPC_PLACEMENTS) {
    ctx.scene.entity.spawn(npc.name, {
      id: npc.id,
      position: [npc.x, ctx.world.groundHeightAt(npc.x, npc.z), npc.z],
      role: "npc",
    });
  }
}
