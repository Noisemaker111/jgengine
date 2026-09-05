/**
 * Runtime renderer for the `city` volume kind: everything `resolveCityObject` emits becomes a
 * fixed, bounded set of merged and instanced draws — road ribbons split by surface with lane
 * dashes, crosswalks, intersection patches and cul-de-sac bulbs; median-divided boulevards;
 * sidewalks; styled bridges with railings, piers and abutments; massing pieces as five instanced
 * primitive meshes (plain walls, window-banded walls via `createCityWindowMaterial`, gable roofs,
 * cylinders, domes) with palette-role coloring and per-lot jitter; species-mixed instanced trees
 * (shared scatter proxies), street lights, estate hedges, driveways, parking pads, curbside and
 * pad-stall parked vehicles, mast-arm junction signals with sign posts, and
 * vertex-colored parks with crop-row fields. Lots near the camera and flat enough swap their
 * massing for full `generateBuilding` facade kits (windows, awnings, storefronts) batched per part
 * kind — a bounded LOD that re-picks only when the camera crosses a coarse cell, never per frame.
 * All geometry derives from the document volume, so editor sliders re-render the district live and
 * games consume the same authored volume unchanged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import {
  roundPathCorners,
  buildIntersectionMarkings,
  buildRoadRibbon,
  buildTrimmedIntersections,
  dashSegments,
  GROUND_DECAL_LAYERS,
  type IntersectionStreet,
  type RoadJunctionInput,
  type RoadPoint,
  type RoadRibbon,
} from "@jgengine/core/world/roads";
import { offsetPath } from "@jgengine/core/world/streets";
import { triangulatePolygon, triangulateRingBand } from "@jgengine/core/world/cityGeometry";
import {
  resolveCityObject,
  CITY_KIND,
  CITY_ZONE_KIND,
  type CityIntersection,
  type CityTree,
  type CityVehicleKind,
} from "@jgengine/core/world/cityKind";
import { zoneBand, zoneMetric, type CityTreeSpecies, type CityPieceRole, type CityZoneBand } from "@jgengine/core/world/cityContent";
import {
  generateBuilding,
  buildingSurfaceColor,
  resolveBuildingPalette,
  resolveBuildingWallTones,
  type BuildingPalette,
} from "@jgengine/core/world/buildings";
import { hashString } from "@jgengine/core/random/rng";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { buildScatterProxy } from "../scatter/scatterProxies";
import { InstancedBuildings, type InstancedBuildingPlacement } from "../structures/GeneratedBuilding";
import { getBuildingKit } from "../structures/buildingKitRegistry";
import { createCityWindowMaterial } from "./cityWindowMaterial";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

const ASPHALT_COLOR = "#3a3b3d";
const GRAVEL_COLOR = "#93815f";
const SIDEWALK_COLOR = "#867f74";
const MARKING_COLOR = "#ddd9cb";
const MEDIAN_COLOR = "#4d7a40";
const PAVEMENT_COLOR = "#a8a49a";
const CONCRETE_COLOR = "#b0aba1";
const STEEL_COLOR = "#4c505a";
const TUNNEL_COLOR = "#5b5754";
const CURB_COLOR = "#b8b4aa";
const HEDGE_COLOR = "#3d6631";
const VEHICLE_PAINTS = ["#b9bdc3", "#2c2f33", "#79838f", "#8d3330", "#27446e", "#eceae1", "#3c5c48", "#a8792f"] as const;
const VEHICLE_GLASS_COLOR = "#23262b";
const SIGNAL_POST_COLOR = "#3b4046";
const SIGNAL_HOUSING_COLOR = "#1e2226";
const SIGN_FACE_COLOR = "#c8ccd2";
const SIGNAL_LAMP_COLORS = ["#d43a2c", "#dfa32b", "#33a558"] as const;
const KERB_RED = new THREE.Color("#d23a34");
const KERB_WHITE = new THREE.Color("#e8e8ea");
const CHECK_DARK = new THREE.Color("#101015");
const CHECK_LIGHT = new THREE.Color("#e8e8ea");
const RACE_ASPHALT = new THREE.Color("#1a1c20");
const RACE_EDGE = new THREE.Color("#d8d4c8");
const PARK_COLORS = { plaza: "#b3ada0", green: "#4e7c41", meadow: "#6d8a4c", field: "#94805a", courtyard: "#6a655c", buffer: "#63734a" } as const;
const CROP_COLORS = ["#5d7a35", "#7a6b41", "#6f7f3a"] as const;
/** Block-interior ground by zone band. A dense district keeps hard surface all the way to its rim;
 *  only a low-density (large-block) district lets the edge band go back to lawn. */
const BLOCK_SURFACE_COLORS: Record<CityZoneBand, string> = { core: "#5b5850", mid: "#6c6456", edge: "#78765c" };
const BLOCK_EDGE_GREEN = "#6a7f4a";
/** The developed ground fades into this at its outer reach so the fabric has no stamped rim. */
const FRINGE_COLOR = "#5f7444";
/** Non-buildable block land takes its open-space colour so a park block never shows raw terrain. */
const BLOCK_OPEN_COLORS = { park: PARK_COLORS.green, plaza: PARK_COLORS.plaza, field: PARK_COLORS.field, buffer: PARK_COLORS.buffer } as const;

/**
 * City ground-decal stack. The single-owner {@link GROUND_DECAL_LAYERS} table fixes the authored-road
 * heights, but a generated district drapes many more surface classes (sidewalk/park/median/curb) and
 * wants more clearance over relief, so it keeps its own baseline while mirroring the table's ordering
 * (terrain < road == junction < marking) and its two hard contracts: the welded junction surface
 * shares the road layer (seam-welded, never stacked), and markings ride above the road with
 * `polygonOffset`/`renderOrder` on the material. Everything behind the curb (block land, sidewalk,
 * parks) rides a curb-height step ABOVE the carriageway, and the curb face is real vertical
 * geometry between the two — a flat sidewalk under the road plane cannot read as a street.
 */
const URBAN_LAYER = 0.06; // street-derived developed ground, under everything else
const ROAD_LAYER = 0.16; // asphalt/gravel carriageway AND the welded junction surface (seam-shared)
const MARKING_LAYER = 0.24;
const MEDIAN_LAYER = 0.3;
const BLOCK_LAND_LAYER = 0.3;
const CURB_LAYER = 0.32;
const SIDEWALK_LAYER = 0.32;
const PARK_LAYER = 0.34;
const DRIVEWAY_LAYER = 0.34;
const PARKING_LAYER = 0.35;
const PLAZA_LAYER = 0.36;
const CROP_LAYER = 0.42;
const RACE_SURFACE_LAYER = 0.28;
const RACE_PAINT_LAYER = 0.3;
const BRIDGE_DECK_LIFT = 0.12;

/** Compact carriageway-union — same seam as StreetGeometryPreview and playground `cityScene`. */
const JUNCTION_OPTS = { curbReturnRadius: 2, apronMargin: 0.25, filletSegments: 6, elevation: ROAD_LAYER, maxSegmentLength: 2 };

const SPECIES_PROXY: Record<CityTreeSpecies, string> = { broadleaf: "oak", conifer: "pine", palm: "palm", cypress: "cypress" };
const SPECIES_SCALE: Record<CityTreeSpecies, number> = { broadleaf: 2.7, conifer: 2.5, palm: 2.6, cypress: 2.3 };

/**
 * Three boxes per parked vehicle: painted body, an inset dark glass volume, and a narrower roof cap
 * that gives the silhouette a taper. Sizes are `[across, up, along the heading]`; each `*Y` is the
 * box centre above the surface the vehicle stands on, each `*Along` its shift down the body.
 */
interface VehicleShape {
  body: readonly [number, number, number];
  bodyY: number;
  cabin: readonly [number, number, number];
  cabinY: number;
  cabinAlong: number;
  roof: readonly [number, number, number];
  roofY: number;
  roofAlong: number;
}

const VEHICLE_SHAPES: Record<CityVehicleKind, VehicleShape> = {
  car: { body: [1.82, 0.72, 4.42], bodyY: 0.62, cabin: [1.62, 0.62, 2.24], cabinY: 1.24, cabinAlong: -0.24, roof: [1.34, 0.12, 1.86], roofY: 1.58, roofAlong: -0.24 },
  van: { body: [2.02, 1.0, 5.2], bodyY: 0.76, cabin: [1.82, 0.74, 3.2], cabinY: 1.58, cabinAlong: -0.42, roof: [1.56, 0.12, 2.8], roofY: 1.99, roofAlong: -0.42 },
  truck: { body: [2.32, 1.46, 6.8], bodyY: 0.99, cabin: [2.1, 0.62, 0.54], cabinY: 1.32, cabinAlong: 3.18, roof: [1.94, 0.14, 6.1], roofY: 1.79, roofAlong: -0.2 },
};

type Sampler = (x: number, z: number) => number;

/** Accumulates draped ribbons, patches, discs, and quads into one merged (optionally colored) buffer. */
class MeshAccumulator {
  positions: number[] = [];
  indices: number[] = [];
  colors: number[] | null;

  constructor(colored = false) {
    this.colors = colored ? [] : null;
  }

  private pushColor(count: number, color: THREE.Color | null): void {
    if (this.colors === null || color === null) return;
    for (let i = 0; i < count; i += 1) this.colors.push(color.r, color.g, color.b);
  }

  addRibbon(points: readonly RoadPoint[], width: number, sample: Sampler, elevation: number, color: THREE.Color | null = null): void {
    if (points.length < 2) return;
    const ribbon = buildRoadRibbon(points, width, sample, { elevation, maxSegmentLength: 2 });
    const offset = this.positions.length / 3;
    for (let i = 0; i < ribbon.positions.length; i += 1) this.positions.push(ribbon.positions[i]!);
    for (let i = 0; i < ribbon.indices.length; i += 1) this.indices.push(ribbon.indices[i]! + offset);
    this.pushColor(ribbon.positions.length / 3, color);
  }

  /** Append an already-draped ribbon/surface (absolute `[x,y,z]` positions) verbatim — e.g. a welded junction. */
  addMesh(ribbon: RoadRibbon, color: THREE.Color | null = null): void {
    if (ribbon.positions.length === 0) return;
    const offset = this.positions.length / 3;
    for (let i = 0; i < ribbon.positions.length; i += 1) this.positions.push(ribbon.positions[i]!);
    for (let i = 0; i < ribbon.indices.length; i += 1) this.indices.push(ribbon.indices[i]! + offset);
    this.pushColor(ribbon.positions.length / 3, color);
  }

  /** A ground-draped rotated rectangle, grid-subdivided so large patches follow the relief. */
  addPatch(
    center: RoadPoint,
    size: readonly [number, number],
    rotationY: number,
    sample: Sampler,
    elevation: number,
    color: THREE.Color | null = null,
  ): void {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const nx = Math.max(1, Math.ceil(size[0] / 8));
    const nz = Math.max(1, Math.ceil(size[1] / 8));
    const base = this.positions.length / 3;
    for (let j = 0; j <= nz; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        const lx = (i / nx - 0.5) * size[0];
        const lz = (j / nz - 0.5) * size[1];
        const x = center[0] + lx * cos + lz * sin;
        const z = center[1] - lx * sin + lz * cos;
        this.positions.push(x, sample(x, z) + elevation, z);
      }
    }
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const a = base + j * (nx + 1) + i;
        const b = a + 1;
        const c = a + (nx + 1);
        const d = c + 1;
        this.indices.push(a, c, b, b, c, d);
      }
    }
    this.pushColor((nx + 1) * (nz + 1), color);
  }

  addDisc(center: RoadPoint, radius: number, sample: Sampler, elevation: number, color: THREE.Color | null = null, segments = 14): void {
    const base = this.positions.length / 3;
    this.positions.push(center[0], sample(center[0], center[1]) + elevation, center[1]);
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const x = center[0] + Math.cos(a) * radius;
      const z = center[1] + Math.sin(a) * radius;
      this.positions.push(x, sample(x, z) + elevation, z);
    }
    for (let i = 0; i < segments; i += 1) this.indices.push(base, base + 1 + i, base + 2 + i);
    this.pushColor(segments + 2, color);
  }

  /** A ground-draped polygon patch: ear-clipped, one terrain sample per ring vertex. */
  addPolygon(ring: readonly RoadPoint[], sample: Sampler, elevation: number, color: THREE.Color | null = null): void {
    const { positions, indices } = triangulatePolygon(ring);
    if (indices.length === 0) return;
    const base = this.positions.length / 3;
    for (const [x, z] of positions) this.positions.push(x, sample(x, z) + elevation, z);
    for (const index of indices) this.indices.push(index + base);
    this.pushColor(positions.length, color);
  }

  /** A ground-draped band between two nested rings (curb outer, land inner) — the sidewalk. */
  addRingBand(outer: readonly RoadPoint[], inner: readonly RoadPoint[], sample: Sampler, elevation: number, color: THREE.Color | null = null): void {
    const { positions, indices } = triangulateRingBand(outer, inner);
    if (indices.length === 0) return;
    const base = this.positions.length / 3;
    for (const [x, z] of positions) this.positions.push(x, sample(x, z) + elevation, z);
    for (const index of indices) this.indices.push(index + base);
    this.pushColor(positions.length, color);
  }

  /** A vertical skirt around a closed ring — the curb face between carriageway and sidewalk. */
  addRingWall(
    ring: readonly RoadPoint[],
    sample: Sampler,
    bottom: number,
    top: number,
    color: THREE.Color | null = null,
  ): void {
    if (ring.length < 3) return;
    const base = this.positions.length / 3;
    for (const [x, z] of ring) {
      const y = sample(x, z);
      this.positions.push(x, y + bottom, z, x, y + top, z);
    }
    for (let i = 0; i < ring.length; i += 1) {
      const a = base + i * 2;
      const b = base + ((i + 1) % ring.length) * 2;
      this.indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    this.pushColor(ring.length * 2, color);
  }

  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.positions), 3));
    if (this.colors !== null) geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /** Flat draped quad in XZ, already lifted: corners in order around the face. */
  addQuad(corners: readonly (readonly [number, number, number])[], color: THREE.Color): void {
    if (this.colors === null) return;
    const base = this.positions.length / 3;
    for (const corner of corners) this.positions.push(corner[0], corner[1], corner[2]);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.pushColor(4, color);
  }

  /** Standing barrier brick: a box extruded along `across` and `forward`, striped by the caller. */
  addSealBlock(
    x: number,
    z: number,
    y: number,
    height: number,
    halfAcross: number,
    halfDepth: number,
    across: readonly [number, number],
    forward: readonly [number, number],
    color: THREE.Color,
  ): void {
    if (this.colors === null) return;
    const ax = across[0];
    const az = across[1];
    const fx = forward[0];
    const fz = forward[1];
    const corners: readonly (readonly [number, number, number])[] = [
      [x - ax * halfAcross - fx * halfDepth, y, z - az * halfAcross - fz * halfDepth],
      [x + ax * halfAcross - fx * halfDepth, y, z + az * halfAcross - fz * halfDepth],
      [x + ax * halfAcross + fx * halfDepth, y, z + az * halfAcross + fz * halfDepth],
      [x - ax * halfAcross + fx * halfDepth, y, z - az * halfAcross + fz * halfDepth],
      [x - ax * halfAcross - fx * halfDepth, y + height, z - az * halfAcross - fz * halfDepth],
      [x + ax * halfAcross - fx * halfDepth, y + height, z + az * halfAcross - fz * halfDepth],
      [x + ax * halfAcross + fx * halfDepth, y + height, z + az * halfAcross + fz * halfDepth],
      [x - ax * halfAcross + fx * halfDepth, y + height, z - az * halfAcross + fz * halfDepth],
    ];
    const base = this.positions.length / 3;
    for (const corner of corners) this.positions.push(corner[0], corner[1], corner[2]);
    const faces: readonly (readonly [number, number, number, number])[] = [
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
      [4, 5, 6, 7],
    ];
    for (const [a, b, c, d] of faces) this.indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
    this.pushColor(8, color);
  }
}

/** Split a polyline into runs that keep `pad` clearance from every intersection disc. */
function clipPolylineAtIntersections(
  points: readonly RoadPoint[],
  intersections: readonly CityIntersection[],
  pad: number,
): RoadPoint[][] {
  const blocked = (x: number, z: number): boolean => {
    for (const cross of intersections) {
      if (Math.hypot(cross.x - x, cross.z - z) < cross.radius + pad) return true;
    }
    return false;
  };
  const runs: RoadPoint[][] = [];
  let current: RoadPoint[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (blocked(x, z)) {
        if (current.length >= 2) runs.push(current);
        current = [];
      } else {
        current.push([x, z]);
      }
    }
  }
  const last = points[points.length - 1];
  if (last !== undefined && !blocked(last[0], last[1])) current.push(last);
  if (current.length >= 2) runs.push(current);
  return runs;
}

let unitGeometryCache: { box: THREE.BoxGeometry; gable: THREE.BufferGeometry; cylinder: THREE.CylinderGeometry; dome: THREE.SphereGeometry } | null = null;

/** Unit massing primitives shared by every district: box, gable prism (ridge along X), cylinder, dome. */
function unitGeometries() {
  if (unitGeometryCache !== null) return unitGeometryCache;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  const gable = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  gable.translate(0, 0, -0.5);
  gable.rotateY(Math.PI / 2);
  gable.computeVertexNormals();
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  cylinder.translate(0, 0.5, 0);
  const dome = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 2, 1);
  unitGeometryCache = { box, gable, cylinder, dome };
  return unitGeometryCache;
}

const ROLE_JITTER: Record<CityPieceRole, number> = { wall: 1, roof: 0.5, trim: 0.35, accent: 0.6 };

function roleColor(palette: BuildingPalette, role: CityPieceRole): string {
  if (role === "wall") return buildingSurfaceColor(palette.wall);
  if (role === "roof") return buildingSurfaceColor(palette.roof);
  if (role === "trim") return buildingSurfaceColor(palette.corner);
  return buildingSurfaceColor(palette.awning);
}

interface DetailBuilding {
  lotId: string;
  center: readonly [number, number];
  baseY: number;
  rotationY: number;
  parts: ReturnType<typeof generateBuilding>["parts"];
}

const DETAIL_RADIUS = 95;
const DETAIL_MAX = 12;
const DETAIL_CLASSES = new Set(["tower", "slab", "shop", "rowhouse"]);

// Rooftop mechanical units read as debug cubes in the district's bright palette accent — force a
// muted metal grey so they look like real HVAC/plant, never placeholder geometry.
const ROOF_PROP_GREY = "#9a9ea3";

/**
 * Near-LOD facade buildings, rendered through the shared building path so an authored city picks up
 * a `BuildingKit` exactly like a `building()` feature does: kit-bound parts instance their models,
 * everything else keeps the palette blocks.
 */
function DetailBuildings({
  buildings,
  palette,
  kitName,
}: {
  buildings: DetailBuilding[];
  palette: BuildingPalette;
  kitName: string;
}) {
  const placements = useMemo<InstancedBuildingPlacement[]>(
    () =>
      buildings.map((entry) => ({
        building: { id: entry.lotId, parts: entry.parts },
        position: [entry.center[0], entry.baseY, entry.center[1]],
        rotationY: entry.rotationY,
      })),
    [buildings],
  );
  const detailPalette = useMemo(() => ({ ...palette, roofProp: ROOF_PROP_GREY }), [palette]);
  const kit = getBuildingKit(kitName);
  if (placements.length === 0) return null;
  return <InstancedBuildings buildings={placements} palette={detailPalette} {...(kit === undefined ? {} : { kit })} />;
}

/** One authored city volume → the full merged/instanced district. */
function OneCity({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const field = context.field;
  const sample = useMemo(() => (x: number, z: number) => field.sampleHeight(x, z), [field]);
  const zoneOverrides = useMemo(
    () =>
      context.document.volumes
        .filter((volume) => volume.kind === CITY_ZONE_KIND)
        .map((volume) => ({
          id: volume.id,
          kind: volume.kind,
          center: volume.center,
          ...(volume.halfExtents === undefined ? {} : { halfExtents: volume.halfExtents }),
          ...(volume.radius === undefined ? {} : { radius: volume.radius }),
          ...(volume.meta === undefined ? {} : { meta: volume.meta }),
        })),
    [context.document.volumes],
  );
  const resolved = useMemo(
    () => resolveCityObject(object, { sampleHeight: sample, zoneOverrides }),
    [object, sample, zoneOverrides],
  );
  const palette = useMemo(() => resolveBuildingPalette(resolved?.rules.style ?? "generic"), [resolved]);

  // --- Camera-coarse LOD cell: re-pick detail lots only when the camera crosses a 28 m cell. ---
  const [detailKey, setDetailKey] = useState("");
  const cameraRef = useRef<[number, number]>([0, 0]);
  const cellRef = useRef("");
  useFrame(({ camera }) => {
    const key = `${Math.round(camera.position.x / 28)}:${Math.round(camera.position.z / 28)}`;
    if (key !== cellRef.current) {
      cellRef.current = key;
      cameraRef.current = [camera.position.x, camera.position.z];
      setDetailKey(key);
    }
  });

  const detail = useMemo(() => {
    if (resolved === null || detailKey === "") return { ids: new Set<string>(), buildings: [] as DetailBuilding[] };
    const [cx, cz] = cameraRef.current;
    const candidates = resolved.lots
      .filter((lot) => DETAIL_CLASSES.has(lot.class) && lot.floors <= 9)
      .map((lot) => ({ lot, dist: Math.hypot(lot.center[0] - cx, lot.center[1] - cz) }))
      .filter((entry) => entry.dist < DETAIL_RADIUS)
      .sort((a, b) => a.dist - b.dist);
    const ids = new Set<string>();
    const buildings: DetailBuilding[] = [];
    for (const { lot } of candidates) {
      if (buildings.length >= DETAIL_MAX) break;
      // Only flat-enough lots swap in the facade kit — it has no foundation to hide a slope.
      const c = Math.cos(lot.rotationY);
      const s = Math.sin(lot.rotationY);
      const hw = lot.size[0] / 2;
      const hd = lot.size[1] / 2;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [dx, dz] of [
        [hw, hd],
        [hw, -hd],
        [-hw, hd],
        [-hw, -hd],
      ] as const) {
        const y = sample(lot.center[0] + dx * c + dz * s, lot.center[1] - dx * s + dz * c);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (maxY - minY > 1.4) continue;
      const baysWide = Math.min(8, Math.max(2, Math.round(lot.size[0] / 2.4)));
      const baysDeep = Math.min(6, Math.max(2, Math.round(lot.size[1] / 2.4)));
      const building = generateBuilding({
        id: lot.id,
        seed: lot.id,
        center: [0, 0],
        floors: Math.min(8, lot.floors),
        baysWide,
        baysDeep,
        bayWidth: lot.size[0] / baysWide,
        floorHeight: resolved.rules.floorHeight,
      });
      ids.add(lot.id);
      buildings.push({
        lotId: lot.id,
        center: lot.center,
        baseY: maxY,
        rotationY: lot.rotationY,
        parts: building.parts,
      });
    }
    return { ids, buildings };
  }, [resolved, detailKey, sample]);

  // --- Massing: five instanced primitive draws over every lot's pieces (minus detail-LOD lots). ---
  const massing = useMemo(() => {
    if (resolved === null || resolved.lots.length === 0) return null;
    const units = unitGeometries();
    interface Bucket {
      matrices: THREE.Matrix4[];
      colors: THREE.Color[];
      groundOffsets?: number[];
      facades?: number[];
    }
    const buckets: Record<"box" | "banded" | "gable" | "cylinder" | "dome", Bucket> = {
      box: { matrices: [], colors: [] },
      banded: { matrices: [], colors: [], groundOffsets: [], facades: [] },
      gable: { matrices: [], colors: [] },
      cylinder: { matrices: [], colors: [] },
      dome: { matrices: [], colors: [] },
    };
    const color = new THREE.Color();
    const wallTones = resolveBuildingWallTones(resolved.rules.style).map((tone: string) => new THREE.Color(tone));
    const roleBase: Record<CityPieceRole, THREE.Color> = {
      wall: new THREE.Color(roleColor(palette, "wall")),
      roof: new THREE.Color(roleColor(palette, "roof")),
      trim: new THREE.Color(roleColor(palette, "trim")),
      accent: new THREE.Color(roleColor(palette, "accent")),
    };
    const lotWall = new THREE.Color();
    for (const lot of resolved.lots) {
      if (detail.ids.has(lot.id)) continue;
      const c = Math.cos(lot.rotationY);
      const s = Math.sin(lot.rotationY);
      const hw = lot.size[0] / 2;
      const hd = lot.size[1] / 2;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [dx, dz] of [
        [hw, hd],
        [hw, -hd],
        [-hw, hd],
        [-hw, -hd],
      ] as const) {
        const y = sample(lot.center[0] + dx * c + dz * s, lot.center[1] - dx * s + dz * c);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const grade = maxY;
      const foundationBase = minY - 0.5;
      // Edge-of-town lots vary more; downtown stays composed.
      const jitterAmp = lot.zone === "edge" ? 0.4 : lot.zone === "mid" ? 0.28 : 0.18;
      // Each building draws its wall colour from the style's tone family, then shifts value/hue on
      // top — one flat hue per style is what makes a whole skyline read as a single paint bucket.
      const idHash = hashString(lot.id);
      lotWall.copy(wallTones[idHash % wallTones.length]!);
      const shade = ((idHash >>> 8) % 1024) / 1024;
      const hue = ((idHash >>> 19) % 512) / 512;
      lotWall.offsetHSL((hue - 0.5) * 0.07, (hue - 0.5) * 0.24, (shade - 0.5) * 0.2);
      const facadeSeed = ((idHash >>> 17) % 997) / 997;
      // Parking structures are the one class whose "windows" are open deck slots, and the resolver
      // can seat an interior-fill class here that `CityLotClass` does not name.
      const facadeKind = (lot.class as string) === "garage" ? 2 : lot.floors >= 8 ? 1 : 0;
      for (const piece of lot.pieces) {
        const px = lot.center[0] + piece.offset[0] * c + piece.offset[2] * s;
        const pz = lot.center[1] - piece.offset[0] * s + piece.offset[2] * c;
        const grounded = piece.grounded;
        const baseY = grounded ? foundationBase : grade + piece.offset[1];
        const height = grounded ? piece.size[1] + (grade - foundationBase) : piece.size[1];
        const groundOffset = grounded ? grade - foundationBase : -piece.offset[1];
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(px, piece.shape === "gable" || piece.shape === "cylinder" || piece.shape === "dome" ? baseY : baseY + height / 2, pz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.rotationY + piece.rotationY),
          new THREE.Vector3(Math.max(0.05, piece.size[0]), Math.max(0.05, height), Math.max(0.05, piece.size[2])),
        );
        const amp = jitterAmp * ROLE_JITTER[piece.role];
        color.copy(piece.role === "wall" ? lotWall : roleBase[piece.role]);
        // Trim/roof/accent stay in the lot's own family so a building reads as one object, not as
        // borrowed parts: pull each partway toward its wall tone before the role jitter.
        if (piece.role === "trim") color.lerp(lotWall, 0.45);
        else if (piece.role === "roof") color.lerp(lotWall, 0.2);
        // Accent trim (awnings/cornices) is a saturated storefront color that reads as a stray red/pink
        // strip at district scale — pull it partway to the wall so it stays a tasteful accent.
        else if (piece.role === "accent") color.lerp(lotWall, 0.5);
        color.multiplyScalar(1 - amp / 2 + lot.jitter * amp);
        const bucket = piece.shape === "box" ? (piece.banded ? buckets.banded : buckets.box) : buckets[piece.shape];
        bucket.matrices.push(matrix);
        bucket.colors.push(color.clone());
        bucket.groundOffsets?.push(groundOffset);
        bucket.facades?.push(facadeSeed, facadeKind);
      }
    }
    // Cylinders/gables/domes scale from their base (geometry roots at y=0), boxes from center —
    // the matrices above already position each accordingly.
    const makeMesh = (
      key: keyof typeof buckets,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
    ): THREE.InstancedMesh | null => {
      const bucket = buckets[key];
      if (bucket.matrices.length === 0) return null;
      const mesh = new THREE.InstancedMesh(geometry, material, bucket.matrices.length);
      bucket.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      bucket.colors.forEach((tint, i) => mesh.setColorAt(i, tint));
      if (bucket.groundOffsets !== undefined && bucket.facades !== undefined) {
        mesh.geometry = geometry.clone();
        mesh.geometry.setAttribute(
          "instanceGroundOffset",
          new THREE.InstancedBufferAttribute(new Float32Array(bucket.groundOffsets), 1),
        );
        mesh.geometry.setAttribute(
          "instanceFacade",
          new THREE.InstancedBufferAttribute(new Float32Array(bucket.facades), 2),
        );
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    };
    const plain = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.04 });
    const banded = createCityWindowMaterial({ floorHeight: resolved.rules.floorHeight, windowColor: buildingSurfaceColor(palette.window) });
    const meshes = [
      makeMesh("box", units.box, plain),
      makeMesh("banded", units.box, banded),
      makeMesh("gable", units.gable, plain),
      makeMesh("cylinder", units.cylinder, plain),
      makeMesh("dome", units.dome, plain),
    ].filter((mesh): mesh is THREE.InstancedMesh => mesh !== null);
    return { meshes, materials: [plain, banded] };
  }, [resolved, sample, palette, detail.ids]);
  useEffect(
    () => () => {
      if (massing === null) return;
      for (const material of massing.materials) material.dispose();
      for (const mesh of massing.meshes) if (mesh.geometry.getAttribute("instanceGroundOffset") !== undefined) mesh.geometry.dispose();
    },
    [massing],
  );

  // --- Ground network: roads by surface, sidewalks, medians, patches, markings, driveways, parks. ---
  const ground = useMemo(() => {
    if (resolved === null || resolved.streets.length === 0) return null;
    const asphalt = new MeshAccumulator(true);
    const gravel = new MeshAccumulator();
    const sidewalks = new MeshAccumulator();
    const urban = new MeshAccumulator(true);
    const land = new MeshAccumulator(true);
    const patches = new MeshAccumulator(true);
    const markings = new MeshAccumulator(true);
    const curbs = new MeshAccumulator();
    const medians = new MeshAccumulator();
    const pavementDrives = new MeshAccumulator();
    const gravelDrives = new MeshAccumulator();
    const parks = new MeshAccumulator(true);
    const crops = new MeshAccumulator(true);
    const parkColor = new THREE.Color();
    const wearColor = new THREE.Color();
    const markColor = new THREE.Color();
    const LANE_TINT = new THREE.Color(0.78, 0.77, 0.72);
    const STALL_TINT = new THREE.Color(0.55, 0.54, 0.5);
    // Sidewalks now come from block curb→land bands; only pre-block documents fall back to the old
    // per-street widened ribbon.
    const useBlockSidewalks = resolved.blocks.length > 0;
    const sidewalkW = Math.max(0, resolved.rules.sidewalkWidth);

    // Feature-aware height: because streets stay continuous across water and through ridges, the road
    // must ride UP onto a bridge deck and hold FLAT through a tunnel bore rather than dive under the
    // river or climb over the hill. Points off any feature fall back to the terrain sampler.
    const bridgeDecks = resolved.bridges.map((bridge) => {
      const first = bridge.points[0]!;
      const last = bridge.points[bridge.points.length - 1]!;
      const abx = last[0] - first[0];
      const abz = last[1] - first[1];
      const len2 = Math.max(1e-6, abx * abx + abz * abz);
      return {
        first,
        abx,
        abz,
        len2,
        span: Math.sqrt(len2),
        hA: sample(first[0], first[1]) + 0.35,
        hB: sample(last[0], last[1]) + 0.35,
        style: bridge.style,
        half: bridge.width / 2 + 1.2,
      };
    });
    const tunnelFloors = resolved.tunnels.map((tunnel) => {
      const first = tunnel.points[0]!;
      const last = tunnel.points[tunnel.points.length - 1]!;
      const abx = last[0] - first[0];
      const abz = last[1] - first[1];
      return { first, abx, abz, len2: Math.max(1e-6, abx * abx + abz * abz), floor: tunnel.bankHeight, half: tunnel.width / 2 + 0.8 };
    });
    const deckSampler = (x: number, z: number): number => {
      for (const d of bridgeDecks) {
        const raw = ((x - d.first[0]) * d.abx + (z - d.first[1]) * d.abz) / d.len2;
        if (raw < -0.03 || raw > 1.03) continue;
        const t = Math.max(0, Math.min(1, raw));
        if (Math.hypot(x - (d.first[0] + d.abx * t), z - (d.first[1] + d.abz * t)) > d.half) continue;
        const arch = d.style === "arch" ? Math.sin(t * Math.PI) * Math.min(1.6, d.span * 0.03) : 0.25;
        return d.hA + (d.hB - d.hA) * t + arch;
      }
      for (const tn of tunnelFloors) {
        const raw = ((x - tn.first[0]) * tn.abx + (z - tn.first[1]) * tn.abz) / tn.len2;
        if (raw < -0.03 || raw > 1.03) continue;
        const t = Math.max(0, Math.min(1, raw));
        if (Math.hypot(x - (tn.first[0] + tn.abx * t), z - (tn.first[1] + tn.abz * t)) > tn.half) continue;
        return tn.floor;
      }
      return sample(x, z);
    };

    const addMarkQuad = (
      center: RoadPoint,
      along: readonly [number, number],
      length: number,
      width: number,
      tint: THREE.Color,
    ) => {
      const perp: readonly [number, number] = [-along[1], along[0]];
      const base = markings.positions.length / 3;
      for (const [sa, sp] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ] as const) {
        const x = center[0] + along[0] * length * sa + perp[0] * width * sp;
        const z = center[1] + along[1] * length * sa + perp[1] * width * sp;
        markings.positions.push(x, deckSampler(x, z) + MARKING_LAYER, z);
        markings.colors?.push(tint.r, tint.g, tint.b);
      }
      markings.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    };

    // Trim carriageways and weld one compact surface per crossing — the same
    // `buildTrimmedIntersections` seam StreetGeometryPreview and playground cityScene consume.
    // Do not stack plaza discs, hull aprons, or fat zebra paint on top of that union.
    const roundedPaths = resolved.streets.map((street) =>
      street.points.length < 2 ? street.points : roundPathCorners(street.points, Math.max(2.5, street.width * 1.15), 9),
    );
    const intersectionInputs: RoadJunctionInput[] = resolved.intersections.map((cross) => ({
      x: cross.x,
      z: cross.z,
      arms: cross.arms.map((arm) => ({ angle: arm.angle, width: arm.width })),
    }));
    const intersectionStreets: IntersectionStreet[] = resolved.streets.map((street, streetIndex) => {
      const path = roundedPaths[streetIndex]!;
      // Always declare sidewalk widths when sidewalks are on so junction curb-return aprons weld;
      // per-street sidewalk ribbons are skipped below when block curb rings already own the walk.
      const wantSidewalk = street.sidewalk && sidewalkW > 0 && resolved.rules.sidewalks;
      const arterial = street.level === "boulevard" || street.level === "avenue";
      return {
        path,
        width: street.width,
        ...(wantSidewalk ? { sidewalks: { left: sidewalkW, right: sidewalkW } } : {}),
        ...(arterial && street.surface === "asphalt"
          ? {
              markings: {
                lines: [{ offset: 0, width: 0.16 }],
                stopLine: true,
              },
            }
          : {}),
      };
    });
    const trimmed = buildTrimmedIntersections(intersectionStreets, intersectionInputs, deckSampler, JUNCTION_OPTS);
    for (let i = 0; i < trimmed.ribbons.length; i += 1) {
      const streetIndex = trimmed.trimmedStreetIndices[i]!;
      const street = resolved.streets[streetIndex]!;
      const wear = (hashString(`surface:${streetIndex}`) % 1024) / 1024;
      wearColor.setRGB(0.86 + wear * 0.3, 0.87 + wear * 0.28, 0.9 + wear * 0.24);
      const target = street.surface === "gravel" ? gravel : asphalt;
      target.addMesh(trimmed.ribbons[i]!, street.surface === "gravel" ? null : wearColor);
    }
    if (!useBlockSidewalks) {
      for (const sidewalk of trimmed.sidewalks) sidewalks.addMesh(sidewalk);
      for (const apron of trimmed.sidewalkAprons) sidewalks.addMesh(apron);
    }
    for (let j = 0; j < trimmed.junctions.length; j += 1) {
      const crossIndex = trimmed.junctionIndices[j]!;
      const scuff = (hashString(`cross:${crossIndex}`) % 512) / 512;
      wearColor.setRGB(0.76 + scuff * 0.18, 0.77 + scuff * 0.17, 0.8 + scuff * 0.16);
      patches.addMesh(trimmed.junctions[j]!, wearColor);
    }
    for (const paint of buildIntersectionMarkings(trimmed, deckSampler, {
      mouthClearance: 1.25,
      dashLength: 2.6,
      dashGap: 3.6,
      elevation: MARKING_LAYER,
      maxSegmentLength: 2,
    })) {
      markColor.copy(LANE_TINT);
      markings.addMesh(paint, markColor);
    }

    resolved.streets.forEach((street, streetIndex) => {
      if (street.points.length < 2) return;
      const rounded = roundedPaths[streetIndex]!;
      const wear = (hashString(`surface:${streetIndex}`) % 1024) / 1024;
      wearColor.setRGB(0.86 + wear * 0.3, 0.87 + wear * 0.28, 0.9 + wear * 0.24);
      if (street.sidewalk && !useBlockSidewalks && sidewalkW <= 0) {
        sidewalks.addRibbon(rounded, street.width + 3.6, sample, SIDEWALK_LAYER);
      }
      if (street.surface === "asphalt") {
        const half = street.width / 2;
        for (const run of clipPolylineAtIntersections(rounded, resolved.intersections, half + 0.5)) {
          if (run.length < 2) continue;
          if (!useBlockSidewalks) {
            curbs.addRibbon(offsetPath(run, half), 0.55, deckSampler, CURB_LAYER);
            curbs.addRibbon(offsetPath(run, -half), 0.55, deckSampler, CURB_LAYER);
          }
          if (street.level === "boulevard" || street.level === "avenue") {
            markColor.copy(LANE_TINT);
            markings.addRibbon(offsetPath(run, half - 0.8), 0.12, deckSampler, MARKING_LAYER, markColor);
            markings.addRibbon(offsetPath(run, -(half - 0.8)), 0.12, deckSampler, MARKING_LAYER, markColor);
            if (street.level === "avenue") {
              for (const dash of dashSegments(offsetPath(run, half * 0.5), 2.4, 3.2)) markings.addRibbon(dash, 0.12, deckSampler, MARKING_LAYER, markColor);
              for (const dash of dashSegments(offsetPath(run, -half * 0.5), 2.4, 3.2)) markings.addRibbon(dash, 0.12, deckSampler, MARKING_LAYER, markColor);
            }
          }
        }
      }
      if (street.bulb !== undefined) {
        if (street.surface === "gravel") gravel.addDisc(street.bulb, street.width * 1.15, sample, ROAD_LAYER);
        else asphalt.addDisc(street.bulb, street.width * 1.15, sample, ROAD_LAYER, wearColor);
        if (street.sidewalk) sidewalks.addDisc(street.bulb, street.width * 1.15 + 1.8, sample, SIDEWALK_LAYER);
      }
      if (street.surface === "asphalt" && street.level === "boulevard") {
        for (const run of clipPolylineAtIntersections(rounded, resolved.intersections, 2.6)) {
          let runLength = 0;
          for (let i = 0; i + 1 < run.length; i += 1) runLength += Math.hypot(run[i + 1]![0] - run[i]![0], run[i + 1]![1] - run[i]![1]);
          if (runLength < 7) continue;
          const width = Math.max(1.3, street.width * 0.14);
          medians.addRibbon(run, width, deckSampler, MEDIAN_LAYER);
          medians.addDisc(run[0]!, width / 2, deckSampler, MEDIAN_LAYER, null, 8);
          medians.addDisc(run[run.length - 1]!, width / 2, deckSampler, MEDIAN_LAYER, null, 8);
        }
      }
    });
    // NOTE: streetGenerator's `Street.sidewalks` offset polylines are NOT surfaced here — this renderer
    // consumes `resolveCityObject`'s `CityStreet` (which carries only a `sidewalk` boolean), and its
    // sidewalks come from richer block curb→land bands below. Wiring the raw offset polylines would be a
    // second, redundant sidewalk source, so it is intentionally skipped for this component's data flow.
    // Sidewalk band per block: the region between the curb ring (outer) and the land ring (inner).
    // Blocks whose two rings coincide (no sidewalk) drop out — every band triangle is degenerate,
    // so `addRingBand` emits nothing.
    const hx = Math.max(1e-6, resolved.size[0] / 2);
    const hz = Math.max(1e-6, resolved.size[1] / 2);
    const cosR = Math.cos(resolved.rotationY);
    const sinR = Math.sin(resolved.rotationY);
    const bandAt = (x: number, z: number, roll: number): CityZoneBand => {
      const dx = x - resolved.center[0];
      const dz = z - resolved.center[2];
      return zoneBand(
        zoneMetric(dx * cosR - dz * sinR, dx * sinR + dz * cosR, hx, hz),
        resolved.rules.profile,
        resolved.rules.coreExtent,
        resolved.rules.midExtent,
        roll,
      );
    };
    const lawnEdge = !resolved.rules.sidewalks || resolved.rules.blockSize > 64;

    // Developed ground. Where the street graph yields real block faces the land ring behind the
    // sidewalk is filled exactly; but block extraction routinely recovers only a fraction of a
    // wandered district's faces, and every face it misses is terrain grass under downtown. So the
    // fabric is also stamped as a street-distance field: any cell within reach of a centerline is
    // developed, shaded pavement near the kerb and yard/service surface deeper into the block.
    if (resolved.rules.fabric) {
      // Reach and paved band are measured OUTWARD FROM THE KERB, not from the centreline: a
      // 20 m boulevard and a 5 m lane must not lay the same width of pavement beside them.
      const reach = Math.min(40, Math.max(10, resolved.rules.blockSize * 0.55));
      const pavedTo = Math.max(1.2, resolved.rules.sidewalkWidth + 0.3);
      const cell = 2.5;
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      let widest = 0;
      for (const street of resolved.streets) {
        widest = Math.max(widest, street.width);
        for (const [x, z] of street.points) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
      }
      const pad = reach + widest / 2;
      const originX = minX - pad;
      const originZ = minZ - pad;
      const nx = Math.ceil((maxX + pad - originX) / cell) + 1;
      const nz = Math.ceil((maxZ + pad - originZ) / cell) + 1;
      if (Number.isFinite(minX) && nx > 1 && nz > 1 && nx * nz <= 160_000) {
        const field = new Float32Array(nx * nz).fill(Infinity);
        for (const street of resolved.streets) {
          const half = street.width / 2;
          for (let s = 0; s + 1 < street.points.length; s += 1) {
            const [ax, az] = street.points[s]!;
            const [bx, bz] = street.points[s + 1]!;
            const vx = bx - ax;
            const vz = bz - az;
            const len2 = Math.max(1e-6, vx * vx + vz * vz);
            const span = reach + half;
            const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - span - originX) / cell));
            const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + span - originX) / cell));
            const j0 = Math.max(0, Math.floor((Math.min(az, bz) - span - originZ) / cell));
            const j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + span - originZ) / cell));
            for (let j = j0; j <= j1; j += 1) {
              const pz = originZ + j * cell;
              for (let i = i0; i <= i1; i += 1) {
                const px = originX + i * cell;
                const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2));
                const d = Math.hypot(px - (ax + vx * t), pz - (az + vz * t)) - half;
                const idx = j * nx + i;
                if (d < field[idx]!) field[idx] = d;
              }
            }
          }
        }
        const fringe = new THREE.Color(FRINGE_COLOR);
        const fabricColor = new THREE.Color();
        for (let j = 0; j + 1 < nz; j += 1) {
          for (let i = 0; i + 1 < nx; i += 1) {
            const d = (field[j * nx + i]! + field[j * nx + i + 1]! + field[(j + 1) * nx + i]! + field[(j + 1) * nx + i + 1]!) / 4;
            if (d > reach) continue;
            const x = originX + (i + 0.5) * cell;
            const z = originZ + (j + 0.5) * cell;
            const tone = (hashString(`fabric:${i}:${j}`) % 256) / 256;
            if (d < pavedTo) {
              fabricColor.set(SIDEWALK_COLOR);
            } else {
              const band = bandAt(x, z, tone);
              fabricColor.set(band === "edge" && lawnEdge ? BLOCK_EDGE_GREEN : BLOCK_SURFACE_COLORS[band]);
              // A block-sized patch tone over the fine per-cell grain: yards, courts and lots,
              // not one poured apron.
              fabricColor.multiplyScalar(0.8 + ((hashString(`yard:${Math.floor(x / 22)}:${Math.floor(z / 22)}`) % 256) / 256) * 0.42);
            }
            fabricColor.multiplyScalar(0.95 + tone * 0.1);
            if (d > reach - 7) fabricColor.lerp(fringe, Math.min(1, (d - (reach - 7)) / 7));
            urban.addPatch([x, z], [cell, cell], 0, sample, URBAN_LAYER, fabricColor);
          }
        }
      }
    }
    // The land ring behind the sidewalk is the block INTERIOR — fill it with a surface read from
    // the block's use and its zone band, varied per block so a district reads as many yards and
    // service courts rather than one sheet.
    if (useBlockSidewalks) {
      const landColor = new THREE.Color();
      for (const block of resolved.blocks) {
        let cx = 0;
        let cz = 0;
        for (const [x, z] of block.polygon) {
          cx += x;
          cz += z;
        }
        cx /= Math.max(1, block.polygon.length);
        cz /= Math.max(1, block.polygon.length);
        const tone = (hashString(block.id) % 512) / 512;
        const band = bandAt(cx, cz, tone);
        landColor.set(
          block.kind !== "buildable"
            ? BLOCK_OPEN_COLORS[block.kind]
            : band === "edge" && lawnEdge
              ? BLOCK_EDGE_GREEN
              : BLOCK_SURFACE_COLORS[band],
        );
        landColor.multiplyScalar(0.88 + tone * 0.24);
        landColor.r *= 1 + (tone - 0.5) * 0.1;
        landColor.b *= 1 + (0.5 - tone) * 0.12;
        land.addPolygon(block.polygon, sample, BLOCK_LAND_LAYER, landColor);
        sidewalks.addRingBand(block.curb, block.polygon, sample, SIDEWALK_LAYER);
        curbs.addRingWall(block.curb, sample, ROAD_LAYER - 0.02, CURB_LAYER);
      }
    }
    // Junction pavement + curb-return sidewalk aprons already came from `buildTrimmedIntersections`
    // above. No plaza discs, hull aprons, or fat zebra ladders on top of that union.
    for (const drive of resolved.driveways) {
      (drive.surface === "gravel" ? gravelDrives : pavementDrives).addRibbon(drive.points, drive.width, sample, DRIVEWAY_LAYER);
    }
    for (const pad of resolved.parkingLots) {
      pavementDrives.addPatch(pad.center, pad.size, pad.rotationY, sample, PARKING_LAYER);
      // Stall separators along the pad.
      const cos = Math.cos(pad.rotationY);
      const sin = Math.sin(pad.rotationY);
      const stalls = Math.floor(pad.size[0] / 2.9);
      for (let i = 1; i < stalls; i += 1) {
        const lx = (i / stalls - 0.5) * pad.size[0];
        const cx = pad.center[0] + lx * cos + (pad.size[1] * 0.24) * sin;
        const cz = pad.center[1] - lx * sin + (pad.size[1] * 0.24) * cos;
        addMarkQuad([cx, cz], [sin, cos], pad.size[1] * 0.42, 0.1, STALL_TINT);
      }
    }
    for (const park of resolved.parks) {
      parkColor.set(PARK_COLORS[park.type]);
      parkColor.multiplyScalar(0.92 + park.jitter * 0.16);
      const elevation = park.type === "plaza" ? PLAZA_LAYER : PARK_LAYER;
      // Block-pipeline parks carry a real road-derived polygon; the rect is only a coarse proxy.
      if (park.polygon !== undefined) parks.addPolygon(park.polygon, sample, elevation, parkColor);
      else parks.addPatch(park.center, park.size, park.rotationY, sample, elevation, parkColor);
      if (park.rows !== undefined) {
        const crop = new THREE.Color(CROP_COLORS[Math.floor(park.jitter * CROP_COLORS.length) % CROP_COLORS.length]);
        crop.multiplyScalar(0.9 + park.jitter * 0.2);
        for (const row of park.rows) crops.addRibbon(row, 1.05, sample, CROP_LAYER, crop);
      }
    }
    return {
      asphalt: asphalt.build(),
      gravel: gravel.build(),
      sidewalks: sidewalks.build(),
      urban: urban.build(),
      land: land.build(),
      patches: patches.build(),
      markings: markings.build(),
      curbs: curbs.build(),
      medians: medians.build(),
      pavementDrives: pavementDrives.build(),
      gravelDrives: gravelDrives.build(),
      parks: parks.build(),
      crops: crops.build(),
    };
  }, [resolved, sample]);
  useEffect(
    () => () => {
      if (ground === null) return;
      for (const geometry of Object.values(ground)) geometry?.dispose();
    },
    [ground],
  );

  // --- Bridges: styled decks, railings/trusses, piers and abutments. ---
  const bridges = useMemo(() => {
    if (resolved === null || resolved.bridges.length === 0) return null;
    const decks = new MeshAccumulator();
    const concrete: THREE.Matrix4[] = [];
    const steel: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3(1, 0, 0);
    const segmentBox = (a: THREE.Vector3, b: THREE.Vector3, thickness: number, height: number, into: THREE.Matrix4[]) => {
      const dir = b.clone().sub(a);
      const length = dir.length();
      if (length < 0.05) return;
      const quat = new THREE.Quaternion().setFromUnitVectors(xAxis, dir.normalize());
      into.push(
        new THREE.Matrix4().compose(
          a.clone().add(b).multiplyScalar(0.5),
          quat,
          new THREE.Vector3(length, height, thickness),
        ),
      );
    };
    for (const bridge of resolved.bridges) {
      const first = bridge.points[0]!;
      const last = bridge.points[bridge.points.length - 1]!;
      const hA = sample(first[0], first[1]) + 0.35;
      const hB = sample(last[0], last[1]) + 0.35;
      const abx = last[0] - first[0];
      const abz = last[1] - first[1];
      const len2 = Math.max(1e-6, abx * abx + abz * abz);
      const span = Math.sqrt(len2);
      const deckY = (x: number, z: number) => {
        const t = Math.max(0, Math.min(1, ((x - first[0]) * abx + (z - first[1]) * abz) / len2));
        const arch = bridge.style === "arch" ? Math.sin(t * Math.PI) * Math.min(1.6, span * 0.03) : 0.25;
        return hA + (hB - hA) * t + arch;
      };
      decks.addRibbon(bridge.points, bridge.width + 1.2, deckY, BRIDGE_DECK_LIFT);
      // Curb strips give the deck visible thickness from the side.
      const tangent: readonly [number, number] = [abx / span, abz / span];
      const normal: readonly [number, number] = [-tangent[1], tangent[0]];
      const halfW = bridge.width / 2 + 0.55;
      const postSpacing = 2.6;
      for (const side of [1, -1] as const) {
        let prevTop: THREE.Vector3 | null = null;
        let prevBase: THREE.Vector3 | null = null;
        for (let dist = 0; dist <= span; dist += postSpacing) {
          const t = dist / span;
          const x = first[0] + abx * t + normal[0] * halfW * side;
          const z = first[1] + abz * t + normal[1] * halfW * side;
          const y = deckY(x - normal[0] * halfW * side, z - normal[1] * halfW * side) + 0.12;
          const base = new THREE.Vector3(x, y, z);
          const postH = bridge.style === "truss" ? 2.7 : 1.05;
          steel.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(x, y + postH / 2, z),
              new THREE.Quaternion(),
              new THREE.Vector3(0.18, postH, 0.18),
            ),
          );
          const top = new THREE.Vector3(x, y + postH, z);
          if (prevTop !== null && prevBase !== null) {
            segmentBox(prevTop, top, 0.13, 0.16, steel);
            if (bridge.style === "truss") {
              segmentBox(prevBase, top, 0.09, 0.09, steel);
              segmentBox(prevTop, base, 0.09, 0.09, steel);
            } else {
              // Mid rail for arch/beam parapets.
              const midA = prevBase.clone().lerp(prevTop, 0.55);
              const midB = base.clone().lerp(top, 0.55);
              segmentBox(midA, midB, 0.08, 0.08, steel);
            }
          }
          prevTop = top;
          prevBase = base;
        }
      }
      // Piers + bank abutments.
      const pierCount = Math.max(0, Math.floor(span / 16));
      for (let p = 1; p <= pierCount; p += 1) {
        const t = p / (pierCount + 1);
        const x = first[0] + abx * t;
        const z = first[1] + abz * t;
        const top = deckY(x, z);
        const bottom = sample(x, z) - 1.5;
        concrete.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, (top + bottom) / 2, z),
            new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(tangent[0], tangent[1])),
            new THREE.Vector3(1.4, Math.max(0.5, top - bottom), bridge.width * 0.7),
          ),
        );
      }
      for (const [ex, ez] of [first, last]) {
        const groundY = sample(ex, ez);
        concrete.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(ex, groundY - 0.6 + 0.9, ez),
            new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(tangent[0], tangent[1])),
            new THREE.Vector3(2.4, 1.8, bridge.width + 2),
          ),
        );
      }
    }
    return { deck: decks.build(), concrete, steel };
  }, [resolved, sample]);
  useEffect(() => () => bridges?.deck?.dispose(), [bridges]);

  // --- Tunnels: a bore roof over the road, side walls, and portal lintels at each mouth. ---
  const tunnels = useMemo(() => {
    if (resolved === null || resolved.tunnels.length === 0) return null;
    const roofs = new MeshAccumulator();
    const stone: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const clearance = 5.5;
    for (const tunnel of resolved.tunnels) {
      const first = tunnel.points[0]!;
      const last = tunnel.points[tunnel.points.length - 1]!;
      const abx = last[0] - first[0];
      const abz = last[1] - first[1];
      const span = Math.hypot(abx, abz) || 1;
      const tangent: readonly [number, number] = [abx / span, abz / span];
      const normal: readonly [number, number] = [-tangent[1], tangent[0]];
      const floor = tunnel.bankHeight;
      const yaw = Math.atan2(tangent[0], tangent[1]);
      // Roof slab held flat over the road at head clearance.
      roofs.addRibbon(tunnel.points, tunnel.width + 1.2, () => floor + clearance, 0);
      // Side walls running the length of the bore.
      const halfW = tunnel.width / 2 + 0.5;
      for (const side of [1, -1] as const) {
        const wx = (first[0] + last[0]) / 2 + normal[0] * halfW * side;
        const wz = (first[1] + last[1]) / 2 + normal[1] * halfW * side;
        stone.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(wx, floor + clearance / 2, wz),
            new THREE.Quaternion().setFromAxisAngle(up, yaw),
            new THREE.Vector3(0.6, clearance, span),
          ),
        );
      }
      // Portal lintel across each mouth so the entrances read as tunnels from the air and the road.
      for (const [ex, ez] of [first, last]) {
        stone.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(ex, floor + clearance + 0.5, ez),
            new THREE.Quaternion().setFromAxisAngle(up, yaw),
            new THREE.Vector3(tunnel.width + 2.4, 1.2, 1.2),
          ),
        );
      }
    }
    return { roof: roofs.build(), stone };
  }, [resolved, sample]);
  useEffect(() => () => tunnels?.roof?.dispose(), [tunnels]);

  // --- Instanced furniture: trees per species, street lights, hedges, parked cars, junction signals. ---
  const furniture = useMemo(() => {
    if (resolved === null) return null;
    const meshes: THREE.Object3D[] = [];
    const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
    const bySpecies = new Map<CityTreeSpecies, CityTree[]>();
    for (const tree of resolved.trees) {
      const bucket = bySpecies.get(tree.species);
      if (bucket === undefined) bySpecies.set(tree.species, [tree]);
      else bucket.push(tree);
    }
    const color = new THREE.Color();
    for (const [species, trees] of bySpecies) {
      const geometry = buildScatterProxy(SPECIES_PROXY[species]);
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
      const mesh = new THREE.InstancedMesh(geometry, material, trees.length);
      const matrix = new THREE.Matrix4();
      trees.forEach((tree, i) => {
        // A second stream off the planting position: `tree.jitter` alone left every canopy the same
        // ball on a stick, so age (girth vs height) and leaf tone vary independently of it.
        const age = (hashString(`tree:${tree.x.toFixed(2)}:${tree.z.toFixed(2)}`) % 1024) / 1024;
        const scale = tree.scale * SPECIES_SCALE[species] * (0.66 + age * 0.78);
        const spread = 0.86 + tree.jitter * 0.34;
        matrix.compose(
          new THREE.Vector3(tree.x, sample(tree.x, tree.z) - 0.05, tree.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.jitter * Math.PI * 2),
          new THREE.Vector3(scale * spread, scale * (0.8 + age * 0.55), scale * spread),
        );
        mesh.setMatrixAt(i, matrix);
        color.setRGB(0.74 + age * 0.42, 0.84 + tree.jitter * 0.3, 0.68 + ((age * 5) % 1) * 0.4);
        mesh.setColorAt(i, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      meshes.push(mesh);
      disposables.push(geometry, material);
    }
    if (resolved.lights.length > 0) {
      const units = unitGeometries();
      const poleMaterial = new THREE.MeshStandardMaterial({ color: "#3a3d42", roughness: 0.6, metalness: 0.5 });
      const headMaterial = new THREE.MeshStandardMaterial({ color: "#ffe9b0", emissive: "#ffdf8a", emissiveIntensity: 0.9, roughness: 0.4 });
      const poles = new THREE.InstancedMesh(units.cylinder, poleMaterial, resolved.lights.length);
      const arms = new THREE.InstancedMesh(units.box, poleMaterial, resolved.lights.length);
      const heads = new THREE.InstancedMesh(units.box, headMaterial, resolved.lights.length);
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const upAxis = new THREE.Vector3(0, 1, 0);
      resolved.lights.forEach((light, i) => {
        const y = sample(light.x, light.z);
        const dir: readonly [number, number] = [Math.sin(light.heading), Math.cos(light.heading)];
        quat.setFromAxisAngle(upAxis, light.heading);
        matrix.compose(new THREE.Vector3(light.x, y, light.z), quat, new THREE.Vector3(0.16, 4.9, 0.16));
        poles.setMatrixAt(i, matrix);
        matrix.compose(
          new THREE.Vector3(light.x + dir[0] * 0.7, y + 4.85, light.z + dir[1] * 0.7),
          quat,
          new THREE.Vector3(0.12, 0.12, 1.5),
        );
        arms.setMatrixAt(i, matrix);
        matrix.compose(
          new THREE.Vector3(light.x + dir[0] * 1.35, y + 4.72, light.z + dir[1] * 1.35),
          quat,
          new THREE.Vector3(0.34, 0.18, 0.7),
        );
        heads.setMatrixAt(i, matrix);
      });
      for (const mesh of [poles, arms, heads]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        meshes.push(mesh);
      }
      disposables.push(poleMaterial, headMaterial);
    }
    if (resolved.hedges.length > 0) {
      const units = unitGeometries();
      const hedgeMaterial = new THREE.MeshStandardMaterial({ color: HEDGE_COLOR, roughness: 0.9, metalness: 0 });
      const hedges = new THREE.InstancedMesh(units.box, hedgeMaterial, resolved.hedges.length);
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const upAxis = new THREE.Vector3(0, 1, 0);
      const color2 = new THREE.Color();
      resolved.hedges.forEach((hedge, i) => {
        const y = sample(hedge.center[0], hedge.center[1]);
        quat.setFromAxisAngle(upAxis, hedge.rotationY);
        matrix.compose(
          new THREE.Vector3(hedge.center[0], y + 0.62, hedge.center[1]),
          quat,
          new THREE.Vector3(Math.max(0.4, hedge.size[0]), 1.65, hedge.size[1]),
        );
        hedges.setMatrixAt(i, matrix);
        color2.setScalar(0.85 + ((i * 37) % 10) * 0.03);
        hedges.setColorAt(i, color2);
      });
      hedges.instanceMatrix.needsUpdate = true;
      if (hedges.instanceColor !== null) hedges.instanceColor.needsUpdate = true;
      hedges.castShadow = true;
      hedges.receiveShadow = true;
      hedges.frustumCulled = false;
      meshes.push(hedges);
      disposables.push(hedgeMaterial);
    }
    if (resolved.vehicles.length > 0) {
      const units = unitGeometries();
      const paintMaterial = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.34 });
      const glassMaterial = new THREE.MeshPhysicalMaterial({ color: VEHICLE_GLASS_COLOR, roughness: 0.16, metalness: 0.2 });
      const bodies = new THREE.InstancedMesh(units.box, paintMaterial, resolved.vehicles.length);
      const cabins = new THREE.InstancedMesh(units.box, glassMaterial, resolved.vehicles.length);
      const roofs = new THREE.InstancedMesh(units.box, paintMaterial, resolved.vehicles.length);
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const upAxis = new THREE.Vector3(0, 1, 0);
      const paint = new THREE.Color();
      resolved.vehicles.forEach((vehicle, i) => {
        const shape = VEHICLE_SHAPES[vehicle.kind];
        const base = sample(vehicle.x, vehicle.z) + (vehicle.stall === "lot" ? PARKING_LAYER : ROAD_LAYER);
        const along: readonly [number, number] = [Math.sin(vehicle.rotationY), Math.cos(vehicle.rotationY)];
        quat.setFromAxisAngle(upAxis, vehicle.rotationY);
        const place = (mesh: THREE.InstancedMesh, size: readonly [number, number, number], y: number, offset: number) => {
          matrix.compose(
            new THREE.Vector3(vehicle.x + along[0] * offset, base + y, vehicle.z + along[1] * offset),
            quat,
            new THREE.Vector3(size[0], size[1], size[2]),
          );
          mesh.setMatrixAt(i, matrix);
        };
        place(bodies, shape.body, shape.bodyY, 0);
        place(cabins, shape.cabin, shape.cabinY, shape.cabinAlong);
        place(roofs, shape.roof, shape.roofY, shape.roofAlong);
        paint.set(VEHICLE_PAINTS[vehicle.paint % VEHICLE_PAINTS.length]!);
        paint.multiplyScalar(0.88 + ((hashString(`car:${vehicle.x.toFixed(2)}:${vehicle.z.toFixed(2)}`) % 256) / 256) * 0.26);
        bodies.setColorAt(i, paint);
        roofs.setColorAt(i, paint);
      });
      for (const mesh of [bodies, cabins, roofs]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        meshes.push(mesh);
      }
      disposables.push(paintMaterial, glassMaterial);
    }
    if (resolved.signals.length > 0) {
      const units = unitGeometries();
      const mastCount = resolved.signals.filter((signal) => signal.kind === "signal").length;
      const postMaterial = new THREE.MeshStandardMaterial({ color: SIGNAL_POST_COLOR, roughness: 0.55, metalness: 0.55 });
      const headMaterial = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.15 });
      const lampMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
      const posts = new THREE.InstancedMesh(units.cylinder, postMaterial, resolved.signals.length);
      const heads = new THREE.InstancedMesh(units.box, headMaterial, resolved.signals.length);
      const arms = mastCount > 0 ? new THREE.InstancedMesh(units.box, postMaterial, mastCount) : null;
      const lamps = mastCount > 0 ? new THREE.InstancedMesh(units.box, lampMaterial, mastCount * 3) : null;
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const armQuat = new THREE.Quaternion();
      const upAxis = new THREE.Vector3(0, 1, 0);
      const tint = new THREE.Color();
      let mast = 0;
      resolved.signals.forEach((signal, i) => {
        const y = sample(signal.x, signal.z);
        const facing: readonly [number, number] = [Math.sin(signal.heading), Math.cos(signal.heading)];
        // The mast arm reaches to the right of the facing direction — out over the lanes it controls.
        const overRoad: readonly [number, number] = [facing[1], -facing[0]];
        quat.setFromAxisAngle(upAxis, signal.heading);
        const isSignal = signal.kind === "signal";
        const postHeight = isSignal ? 5.3 : 2.5;
        const thickness = isSignal ? 0.2 : 0.13;
        matrix.compose(new THREE.Vector3(signal.x, y, signal.z), quat, new THREE.Vector3(thickness, postHeight, thickness));
        posts.setMatrixAt(i, matrix);
        if (!isSignal) {
          matrix.compose(
            new THREE.Vector3(signal.x, y + postHeight - 0.2, signal.z),
            quat,
            new THREE.Vector3(0.72, 0.72, 0.07),
          );
          heads.setMatrixAt(i, matrix);
          tint.set(SIGN_FACE_COLOR);
          heads.setColorAt(i, tint);
          return;
        }
        const hx = signal.x + overRoad[0] * signal.reach;
        const hz = signal.z + overRoad[1] * signal.reach;
        armQuat.setFromAxisAngle(upAxis, signal.heading + Math.PI / 2);
        matrix.compose(
          new THREE.Vector3(signal.x + overRoad[0] * signal.reach * 0.5, y + postHeight - 0.15, signal.z + overRoad[1] * signal.reach * 0.5),
          armQuat,
          new THREE.Vector3(0.14, 0.14, signal.reach),
        );
        arms!.setMatrixAt(mast, matrix);
        matrix.compose(new THREE.Vector3(hx, y + postHeight - 0.72, hz), quat, new THREE.Vector3(0.4, 1.14, 0.3));
        heads.setMatrixAt(i, matrix);
        tint.set(SIGNAL_HOUSING_COLOR);
        heads.setColorAt(i, tint);
        for (let lamp = 0; lamp < 3; lamp += 1) {
          matrix.compose(
            new THREE.Vector3(hx + facing[0] * 0.17, y + postHeight - 0.36 - lamp * 0.36, hz + facing[1] * 0.17),
            quat,
            new THREE.Vector3(0.22, 0.22, 0.08),
          );
          lamps!.setMatrixAt(mast * 3 + lamp, matrix);
          tint.set(SIGNAL_LAMP_COLORS[lamp]!);
          lamps!.setColorAt(mast * 3 + lamp, tint);
        }
        mast += 1;
      });
      for (const mesh of [posts, heads, arms, lamps]) {
        if (mesh === null) continue;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = mesh !== lamps;
        mesh.frustumCulled = false;
        meshes.push(mesh);
      }
      disposables.push(postMaterial, headMaterial, lampMaterial);
    }
    return { meshes, disposables };
  }, [resolved, sample]);
  useEffect(
    () => () => {
      if (furniture === null) return;
      for (const disposable of furniture.disposables) disposable.dispose();
    },
    [furniture],
  );

  // Race dressing: resurface the lap, stripe its kerbs, paint start/finish + grid, and stand a
  // barrier across every sealed side street — the visual proof the race is a section of this city.
  const race = useMemo(() => {
    if (resolved?.race === undefined) return null;
    const route = resolved.race;
    const points = route.centerline;
    const n = points.length;
    if (n < 8) return null;
    const decals = new MeshAccumulator(true);
    const barriers = new MeshAccumulator(true);
    const normals = points.map((_, i) => {
      const before = points[(i - 1 + n) % n]!;
      const after = points[(i + 1) % n]!;
      const dx = after[0] - before[0];
      const dz = after[1] - before[1];
      const len = Math.hypot(dx, dz) || 1;
      return [dz / len, -dx / len] as const;
    });
    const half = points.map((_, i) => Math.max(1.5, (route.widths[i] ?? 9) * 0.5 - 0.3));
    const surfaceY0 = points.map((p, i) => route.heights?.[i] ?? sample(p[0], p[1]));
    const rim = (i: number, off: number, lift: number): [number, number, number] => [
      points[i]![0] + normals[i]![0] * off,
      surfaceY0[i]! + lift,
      points[i]![1] + normals[i]![1] * off,
    ];
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const midX = (points[i]![0] + points[j]![0]) * 0.5;
      const midZ = (points[i]![1] + points[j]![1]) * 0.5;
      // Leave welded junction pavement visible — a continuous race ribbon over the mouth undoes the seam.
      let overJunction = false;
      for (const cross of resolved.intersections) {
        if (Math.hypot(cross.x - midX, cross.z - midZ) < cross.radius + 0.6) {
          overJunction = true;
          break;
        }
      }
      if (overJunction) continue;
      decals.addQuad(
        [rim(i, -half[i]!, RACE_SURFACE_LAYER), rim(j, -half[j]!, RACE_SURFACE_LAYER), rim(j, half[j]!, RACE_SURFACE_LAYER), rim(i, half[i]!, RACE_SURFACE_LAYER)],
        RACE_ASPHALT,
      );
      for (const side of [-1, 1] as const) {
        decals.addQuad(
          [
            rim(i, side * half[i]!, RACE_PAINT_LAYER),
            rim(j, side * half[j]!, RACE_PAINT_LAYER),
            rim(j, side * (half[j]! - 0.34), RACE_PAINT_LAYER),
            rim(i, side * (half[i]! - 0.34), RACE_PAINT_LAYER),
          ],
          RACE_EDGE,
        );
      }
    }
    for (const kerb of route.kerbs) {
      const run = kerb.points;
      if (run.length < 2) continue;
      const outward = run.map((_, i) => {
        const before = run[Math.max(0, i - 1)]!;
        const after = run[Math.min(run.length - 1, i + 1)]!;
        const dx = after[0] - before[0];
        const dz = after[1] - before[1];
        const len = Math.hypot(dx, dz) || 1;
        return [(dz / len) * kerb.side, (-dx / len) * kerb.side] as const;
      });
      let travelled = 0;
      for (let i = 0; i + 1 < run.length; i += 1) {
        const a = run[i]!;
        const b = run[i + 1]!;
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (seg < 1e-6) continue;
        const midX = (a[0] + b[0]) * 0.5;
        const midZ = (a[1] + b[1]) * 0.5;
        let overJunction = false;
        for (const cross of resolved.intersections) {
          if (Math.hypot(cross.x - midX, cross.z - midZ) < cross.radius + 0.4) {
            overJunction = true;
            break;
          }
        }
        if (overJunction) {
          travelled += seg;
          continue;
        }
        const oa = outward[i]!;
        const ob = outward[i + 1]!;
        let t = 0;
        while (t < 1 - 1e-6) {
          const here = travelled + t * seg;
          const band = Math.floor(here / kerb.stripe + 1e-6);
          const next = Math.min(1, Math.max(t + 1e-3, t + ((band + 1) * kerb.stripe - here) / seg));
          const along = (u: number): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
          const away = (u: number): [number, number] => [oa[0] + (ob[0] - oa[0]) * u, oa[1] + (ob[1] - oa[1]) * u];
          const [x0, z0] = along(t);
          const [x1, z1] = along(next);
          const [ox0, oz0] = away(t);
          const [ox1, oz1] = away(next);
          const drape = (x: number, z: number): [number, number, number] => [x, sample(x, z) + RACE_PAINT_LAYER, z];
          decals.addQuad(
            [drape(x0, z0), drape(x1, z1), drape(x1 + ox1 * kerb.width, z1 + oz1 * kerb.width), drape(x0 + ox0 * kerb.width, z0 + oz0 * kerb.width)],
            band % 2 === 0 ? KERB_RED : KERB_WHITE,
          );
          t = next;
        }
        travelled += seg;
      }
    }
    const [lineA, lineB] = route.start.line;
    const acrossX = lineB[0] - lineA[0];
    const acrossZ = lineB[1] - lineA[1];
    const travelX = Math.sin(route.start.heading);
    const travelZ = Math.cos(route.start.heading);
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 10; c += 1) {
        const cell = (u: number, v: number): [number, number, number] => {
          const x = lineA[0] + acrossX * u + travelX * v;
          const z = lineA[1] + acrossZ * u + travelZ * v;
          return [x, sample(x, z) + RACE_PAINT_LAYER, z];
        };
        const v0 = -2.5 + (r / 2) * 5;
        const v1 = -2.5 + ((r + 1) / 2) * 5;
        decals.addQuad(
          [cell(c / 10, v0), cell((c + 1) / 10, v0), cell((c + 1) / 10, v1), cell(c / 10, v1)],
          (c + r) % 2 === 0 ? CHECK_DARK : CHECK_LIGHT,
        );
      }
    }
    for (const slot of route.grid) {
      const fx = Math.sin(slot.heading);
      const fz = Math.cos(slot.heading);
      const ax = Math.cos(slot.heading);
      const az = -Math.sin(slot.heading);
      const corner = (u: number, v: number): [number, number, number] => {
        const x = slot.x + ax * u + fx * v;
        const z = slot.z + az * u + fz * v;
        return [x, sample(x, z) + RACE_PAINT_LAYER, z];
      };
      for (const [u0, u1, v0, v1] of [
        [-1.3, -1.12, -2.6, 2.6],
        [1.12, 1.3, -2.6, 2.6],
        [-1.3, 1.3, 2.42, 2.6],
      ] as const) {
        decals.addQuad([corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1)], RACE_EDGE);
      }
    }
    for (const seal of route.seals) {
      const fx = Math.sin(seal.heading);
      const fz = Math.cos(seal.heading);
      const ax = Math.cos(seal.heading);
      const az = -Math.sin(seal.heading);
      const span = seal.width + 3;
      const blocks = Math.max(3, Math.round(span / 1.4));
      const halfRun = span / blocks / 2;
      for (let s = 0; s < blocks; s += 1) {
        const u = -span / 2 + ((s + 0.5) / blocks) * span;
        const cx = seal.x + ax * u;
        const cz = seal.z + az * u;
        barriers.addSealBlock(cx, cz, sample(cx, cz), 1.05, halfRun, 0.28, [ax, az], [fx, fz], s % 2 === 0 ? KERB_RED : KERB_WHITE);
      }
    }
    const geometries: THREE.BufferGeometry[] = [];
    const meshes: THREE.Object3D[] = [];
    const surface = decals.build();
    if (surface !== null) {
      geometries.push(surface);
      const mesh = new THREE.Mesh(
        surface,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
      );
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
    const sealGeom = barriers.build();
    if (sealGeom !== null) {
      geometries.push(sealGeom);
      const mesh = new THREE.Mesh(
        sealGeom,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.04, side: THREE.DoubleSide }),
      );
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
    return { meshes, geometries, materials: meshes.map((mesh) => (mesh as THREE.Mesh).material as THREE.Material) };
  }, [resolved, sample]);
  useEffect(
    () => () => {
      if (race === null) return;
      for (const geometry of race.geometries) geometry.dispose();
      for (const material of race.materials) material.dispose();
    },
    [race],
  );

  if (resolved === null) return null;
  return (
    <group>
      {ground?.urban != null ? (
        <mesh geometry={ground.urban} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.land != null ? (
        <mesh geometry={ground.land} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.asphalt != null ? (
        <mesh geometry={ground.asphalt} receiveShadow>
          <meshStandardMaterial color={ASPHALT_COLOR} vertexColors roughness={0.96} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.gravel != null ? (
        <mesh geometry={ground.gravel} receiveShadow>
          <meshStandardMaterial color={GRAVEL_COLOR} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.sidewalks != null ? (
        <mesh geometry={ground.sidewalks} receiveShadow>
          <meshStandardMaterial color={SIDEWALK_COLOR} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.patches != null ? (
        <mesh geometry={ground.patches} receiveShadow>
          <meshStandardMaterial color={ASPHALT_COLOR} vertexColors roughness={0.96} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.curbs != null ? (
        <mesh geometry={ground.curbs} receiveShadow castShadow>
          <meshStandardMaterial color={CURB_COLOR} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.markings != null ? (
        <mesh geometry={ground.markings} renderOrder={1}>
          <meshStandardMaterial
            color={MARKING_COLOR}
            vertexColors
            roughness={0.8}
            metalness={0}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ) : null}
      {ground?.medians != null ? (
        <mesh geometry={ground.medians} receiveShadow>
          <meshStandardMaterial color={MEDIAN_COLOR} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.pavementDrives != null ? (
        <mesh geometry={ground.pavementDrives} receiveShadow>
          <meshStandardMaterial color={PAVEMENT_COLOR} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.gravelDrives != null ? (
        <mesh geometry={ground.gravelDrives} receiveShadow>
          <meshStandardMaterial color={GRAVEL_COLOR} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.parks != null ? (
        <mesh geometry={ground.parks} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {ground?.crops != null ? (
        <mesh geometry={ground.crops} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {bridges?.deck != null ? (
        <mesh geometry={bridges.deck} castShadow receiveShadow>
          <meshStandardMaterial color={CONCRETE_COLOR} roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {bridges !== null && bridges.concrete.length > 0 ? (
        <InstancedBoxes matrices={bridges.concrete} color={CONCRETE_COLOR} />
      ) : null}
      {bridges !== null && bridges.steel.length > 0 ? <InstancedBoxes matrices={bridges.steel} color={STEEL_COLOR} /> : null}
      {tunnels?.roof != null ? (
        <mesh geometry={tunnels.roof} castShadow receiveShadow>
          <meshStandardMaterial color={TUNNEL_COLOR} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {tunnels !== null && tunnels.stone.length > 0 ? <InstancedBoxes matrices={tunnels.stone} color={TUNNEL_COLOR} /> : null}
      {massing !== null ? massing.meshes.map((mesh, i) => <primitive key={`massing:${i}`} object={mesh} />) : null}
      {furniture !== null ? furniture.meshes.map((mesh, i) => <primitive key={`furniture:${i}`} object={mesh} />) : null}
      {race !== null ? race.meshes.map((mesh, i) => <primitive key={`race:${i}`} object={mesh} />) : null}
      <DetailBuildings buildings={detail.buildings} palette={palette} kitName={resolved?.rules.buildingKit ?? ""} />
    </group>
  );
}

/** One instanced unit-box mesh from precomposed matrices (bridge parts). */
function InstancedBoxes({ matrices, color }: { matrices: THREE.Matrix4[]; color: string }) {
  const mesh = useMemo(() => {
    const units = unitGeometries();
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.15 });
    const instanced = new THREE.InstancedMesh(units.box, material, matrices.length);
    matrices.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.frustumCulled = false;
    return instanced;
  }, [matrices, color]);
  useEffect(
    () => () => {
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

/** Registers the `city` volume runtime renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerCityRenderer(): void {
  registerSceneKindRenderer(CITY_KIND, ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <OneCity key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
