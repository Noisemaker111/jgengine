/**
 * Runtime renderer for the `city` volume kind: everything `resolveCityObject` emits becomes a
 * fixed, bounded set of merged and instanced draws — road ribbons split by surface with lane
 * dashes, crosswalks, intersection patches and cul-de-sac bulbs; median-divided boulevards;
 * sidewalks; styled bridges with railings, piers and abutments; massing pieces as five instanced
 * primitive meshes (plain walls, window-banded walls via `createCityWindowMaterial`, gable roofs,
 * cylinders, domes) with palette-role coloring and per-lot jitter; species-mixed instanced trees
 * (shared scatter proxies), street lights, estate hedges, driveways, parking pads, and
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
  buildJunctionSurface,
  buildRoadRibbon,
  dashSegments,
  GROUND_DECAL_LAYERS,
  trimPathAtJunctions,
  type JunctionApproach,
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
} from "@jgengine/core/world/cityKind";
import type { CityTreeSpecies, CityPieceRole } from "@jgengine/core/world/cityContent";
import { generateBuilding, resolveBuildingPalette, type BuildingPalette, type BuildingPartKind } from "@jgengine/core/world/buildings";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { buildScatterProxy } from "../scatter/scatterProxies";
import { createCityWindowMaterial } from "./cityWindowMaterial";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

const ASPHALT_COLOR = "#3d3f45";
const GRAVEL_COLOR = "#93815f";
const SIDEWALK_COLOR = "#98948c";
const MARKING_COLOR = "#e8e4d8";
const MEDIAN_COLOR = "#4d7a40";
const PAVEMENT_COLOR = "#a8a49a";
const CONCRETE_COLOR = "#b0aba1";
const STEEL_COLOR = "#4c505a";
const TUNNEL_COLOR = "#5b5754";
const CURB_COLOR = "#c4c0b6";
const HEDGE_COLOR = "#3d6631";
const PARK_COLORS = { plaza: "#b3ada0", green: "#4e7c41", meadow: "#6d8a4c", field: "#94805a", courtyard: "#5c8348", buffer: "#63734a" } as const;
const CROP_COLORS = ["#5d7a35", "#7a6b41", "#6f7f3a"] as const;

/**
 * City ground-decal stack. The single-owner {@link GROUND_DECAL_LAYERS} table fixes the authored-road
 * heights, but a generated district drapes many more surface classes (sidewalk/park/median/curb) and
 * wants more clearance over relief, so it keeps its own baseline while mirroring the table's ordering
 * (terrain < road == junction < marking) and its two hard contracts: the welded junction surface
 * shares the road layer (seam-welded, never stacked), and markings ride above the road with
 * `polygonOffset`/`renderOrder` on the material. Values below preserve the district's prior look.
 */
const SIDEWALK_LAYER = 0.1;
const PARK_LAYER = 0.12;
const DRIVEWAY_LAYER = 0.12;
const BRIDGE_DECK_LIFT = 0.12;
const PARKING_LAYER = 0.13;
const PLAZA_LAYER = 0.14;
const ROAD_LAYER = 0.16; // asphalt/gravel carriageway AND the welded junction surface (seam-shared)
const CROP_LAYER = 0.2;
const CURB_LAYER = 0.24;
const MARKING_LAYER = 0.26;
const MEDIAN_LAYER = 0.3;

/** Trim + weld tuning shared by {@link trimPathAtJunctions} and {@link buildJunctionSurface} for the district. */
const JUNCTION_OPTS = { curbReturnRadius: 3, apronMargin: 0.6, filletSegments: 6, elevation: ROAD_LAYER, maxSegmentLength: 2 };

const SPECIES_PROXY: Record<CityTreeSpecies, string> = { broadleaf: "oak", conifer: "pine", palm: "palm", cypress: "cypress" };
const SPECIES_SCALE: Record<CityTreeSpecies, number> = { broadleaf: 2.7, conifer: 2.5, palm: 2.6, cypress: 2.3 };

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

  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.positions), 3));
    if (this.colors !== null) geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
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

/** Andrew's monotone-chain convex hull of XZ points (CCW), degenerate-safe. */
function convexHull(points: readonly RoadPoint[]): RoadPoint[] {
  const pts = points.map((p) => [p[0], p[1]] as RoadPoint).sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  if (pts.length < 3) return pts;
  const cross = (o: RoadPoint, a: RoadPoint, b: RoadPoint): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: RoadPoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: RoadPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Round every vertex of a CLOSED ring into a short arc — the curb-return radius that turns a hard
 *  polygon corner into a real street corner. Radius is clamped to each corner's shorter leg. */
function roundRing(ring: readonly RoadPoint[], radius: number, segments = 5): RoadPoint[] {
  if (ring.length < 3 || radius <= 0) return ring.map((p) => [p[0], p[1]] as RoadPoint);
  const n = ring.length;
  const out: RoadPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = ring[(i - 1 + n) % n]!;
    const v = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const ax = a[0] - v[0];
    const az = a[1] - v[1];
    const bx = b[0] - v[0];
    const bz = b[1] - v[1];
    const la = Math.hypot(ax, az) || 1;
    const lb = Math.hypot(bx, bz) || 1;
    const r = Math.min(radius, la / 2, lb / 2);
    const p0: RoadPoint = [v[0] + (ax / la) * r, v[1] + (az / la) * r];
    const p1: RoadPoint = [v[0] + (bx / lb) * r, v[1] + (bz / lb) * r];
    out.push(p0);
    for (let s = 1; s < segments; s += 1) {
      const t = s / segments;
      const u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * v[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * v[1] + t * t * p1[1]]);
    }
    out.push(p1);
  }
  return out;
}

/**
 * The pavement outline of a junction: each arm's roadway extended to the crossing, hulled into one
 * convex area, then corner-rounded. This reads as a real intersection (a squared crossing with
 * rounded curb corners) instead of the old stamped circle. Returns `null` for a degenerate junction.
 */
function junctionOutline(cross: CityIntersection, reachScale = 1.15, expand = 0): RoadPoint[] | null {
  if (cross.arms.length < 2) return null;
  let maxHalf = 0;
  for (const arm of cross.arms) maxHalf = Math.max(maxHalf, arm.width / 2);
  const reach = maxHalf * reachScale + expand;
  const mouth: RoadPoint[] = [];
  for (const arm of cross.arms) {
    const dir: readonly [number, number] = [Math.sin(arm.angle), Math.cos(arm.angle)];
    const perp: readonly [number, number] = [-dir[1], dir[0]];
    const hw = arm.width / 2 + expand;
    mouth.push([cross.x + dir[0] * reach + perp[0] * hw, cross.z + dir[1] * reach + perp[1] * hw]);
    mouth.push([cross.x + dir[0] * reach - perp[0] * hw, cross.z + dir[1] * reach - perp[1] * hw]);
  }
  const hull = convexHull(mouth);
  if (hull.length < 3) return null;
  // Curb-return radius: a real corner, capped so a tight junction never over-rounds into a blob.
  const cornerR = Math.min(maxHalf * 0.9 + expand, 5.5);
  return roundRing(hull, cornerR, 6);
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
  if (role === "wall") return palette.wall;
  if (role === "roof") return palette.roof;
  if (role === "trim") return palette.corner;
  return palette.awning;
}

interface DetailBuilding {
  lotId: string;
  matrix: THREE.Matrix4;
  parts: ReturnType<typeof generateBuilding>["parts"];
}

const DETAIL_RADIUS = 95;
const DETAIL_MAX = 12;
const DETAIL_CLASSES = new Set(["tower", "slab", "shop", "rowhouse"]);

/** Per-part-kind instanced batches for the near-LOD facade buildings (full lot yaw support). */
function DetailBuildings({ buildings, palette }: { buildings: DetailBuilding[]; palette: BuildingPalette }) {
  const meshes = useMemo(() => {
    if (buildings.length === 0) return null;
    const buckets = new Map<BuildingPartKind, THREE.Matrix4[]>();
    const partMatrix = new THREE.Matrix4();
    const compose = new THREE.Matrix4();
    for (const building of buildings) {
      for (const part of building.parts) {
        partMatrix.compose(
          new THREE.Vector3(part.position[0], part.position[1], part.position[2]),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), part.rotationY),
          new THREE.Vector3(Math.max(0.01, part.scale[0]), Math.max(0.01, part.scale[1]), Math.max(0.01, part.scale[2])),
        );
        compose.multiplyMatrices(building.matrix, partMatrix);
        const bucket = buckets.get(part.kind);
        if (bucket === undefined) buckets.set(part.kind, [compose.clone()]);
        else bucket.push(compose.clone());
      }
    }
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const out: THREE.InstancedMesh[] = [];
    // Rooftop mechanical units read as debug cubes in the district's bright palette accent — force a
    // muted metal grey so they look like real HVAC/plant, never placeholder geometry.
    const ROOF_PROP_GREY = "#9a9ea3";
    for (const [kind, matrices] of buckets) {
      const color = kind === "roofProp" ? ROOF_PROP_GREY : palette[kind];
      const material =
        kind === "window" || kind === "storefront"
          ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.56 })
          : kind === "storeSign"
            ? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.5 })
            : new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      out.push(mesh);
    }
    return out;
  }, [buildings, palette]);
  useEffect(
    () => () => {
      if (meshes === null) return;
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
    [meshes],
  );
  if (meshes === null) return null;
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={`detail:${i}`} object={mesh} />
      ))}
    </>
  );
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
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(lot.center[0], maxY, lot.center[1]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.rotationY),
        new THREE.Vector3(1, 1, 1),
      );
      ids.add(lot.id);
      buildings.push({ lotId: lot.id, matrix, parts: building.parts });
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
    }
    const buckets: Record<"box" | "banded" | "gable" | "cylinder" | "dome", Bucket> = {
      box: { matrices: [], colors: [] },
      banded: { matrices: [], colors: [], groundOffsets: [] },
      gable: { matrices: [], colors: [] },
      cylinder: { matrices: [], colors: [] },
      dome: { matrices: [], colors: [] },
    };
    const color = new THREE.Color();
    const roleBase: Record<CityPieceRole, THREE.Color> = {
      wall: new THREE.Color(roleColor(palette, "wall")),
      roof: new THREE.Color(roleColor(palette, "roof")),
      trim: new THREE.Color(roleColor(palette, "trim")),
      accent: new THREE.Color(roleColor(palette, "accent")),
    };
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
        color.copy(roleBase[piece.role]);
        // Accent trim (awnings/cornices) is a saturated storefront color that reads as a stray red/pink
        // strip at district scale — pull it partway to the wall so it stays a tasteful accent.
        if (piece.role === "accent") color.lerp(roleBase.wall, 0.5);
        color.multiplyScalar(1 - amp / 2 + lot.jitter * amp);
        // A whisper of hue shift so rows of houses never read as one paint bucket.
        color.r *= 1 + (lot.jitter - 0.5) * 0.08;
        color.b *= 1 + (0.5 - lot.jitter) * 0.08;
        const bucket = piece.shape === "box" ? (piece.banded ? buckets.banded : buckets.box) : buckets[piece.shape];
        bucket.matrices.push(matrix);
        bucket.colors.push(color.clone());
        bucket.groundOffsets?.push(groundOffset);
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
      if (bucket.groundOffsets !== undefined) {
        mesh.geometry = geometry.clone();
        mesh.geometry.setAttribute(
          "instanceGroundOffset",
          new THREE.InstancedBufferAttribute(new Float32Array(bucket.groundOffsets), 1),
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
    const banded = createCityWindowMaterial({ floorHeight: resolved.rules.floorHeight, windowColor: palette.window });
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
    const asphalt = new MeshAccumulator();
    const gravel = new MeshAccumulator();
    const sidewalks = new MeshAccumulator();
    const patches = new MeshAccumulator();
    const markings = new MeshAccumulator();
    const curbs = new MeshAccumulator();
    const medians = new MeshAccumulator();
    const pavementDrives = new MeshAccumulator();
    const gravelDrives = new MeshAccumulator();
    const parks = new MeshAccumulator(true);
    const crops = new MeshAccumulator(true);
    const parkColor = new THREE.Color();
    // Sidewalks now come from block curb→land bands; only pre-block documents fall back to the old
    // per-street widened ribbon.
    const useBlockSidewalks = resolved.blocks.length > 0;

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

    const addMarkQuad = (center: RoadPoint, along: readonly [number, number], length: number, width: number) => {
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
      }
      markings.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    };

    // Trim carriageways back to their junction boundaries and weld one surface per crossing (no
    // overlapping ribbons hidden under a floating disc). Street endpoints coincide bitwise with
    // junction nodes, so `trimPathAtJunctions` cuts each rounded ribbon exactly at the crossing; the
    // terminal corners feed `buildJunctionSurface` per intersection. Any crossing that gets no trimmed
    // approach (e.g. sliced past the intersection cap) falls back to the old rounded outline below.
    const intersectionInputs: RoadJunctionInput[] = resolved.intersections.map((cross) => ({
      x: cross.x,
      z: cross.z,
      arms: cross.arms.map((arm) => ({ angle: arm.angle, width: arm.width })),
    }));
    const approachesByCross = new Map<number, JunctionApproach[]>();

    for (const street of resolved.streets) {
      if (street.points.length < 2) continue;
      const rounded = roundPathCorners(street.points, Math.max(2.5, street.width * 1.15), 9);
      const surface = street.surface === "gravel" ? gravel : asphalt;
      for (const sub of trimPathAtJunctions(rounded, street.width, intersectionInputs, JUNCTION_OPTS)) {
        surface.addRibbon(sub.path, street.width, deckSampler, ROAD_LAYER);
        for (const cut of sub.cuts) {
          const approach: JunctionApproach = {
            center: cut.center,
            left: [cut.left[0], deckSampler(cut.left[0], cut.left[1]) + ROAD_LAYER, cut.left[1]],
            right: [cut.right[0], deckSampler(cut.right[0], cut.right[1]) + ROAD_LAYER, cut.right[1]],
          };
          const list = approachesByCross.get(cut.junctionIndex);
          if (list) list.push(approach);
          else approachesByCross.set(cut.junctionIndex, [approach]);
        }
      }
      if (street.sidewalk && !useBlockSidewalks) sidewalks.addRibbon(rounded, street.width + 3.6, sample, SIDEWALK_LAYER);
      // Curbs + painted edge/lane lines make a flat ribbon read as a real carriageway. Both break at
      // junctions (the crossing owns its own pavement), so clip the centerline first.
      if (street.surface === "asphalt") {
        const half = street.width / 2;
        for (const run of clipPolylineAtIntersections(rounded, resolved.intersections, half + 0.5)) {
          if (run.length < 2) continue;
          const left = offsetPath(run, half);
          const right = offsetPath(run, -half);
          curbs.addRibbon(left, 0.55, deckSampler, CURB_LAYER);
          curbs.addRibbon(right, 0.55, deckSampler, CURB_LAYER);
          if (street.level !== "lane") {
            // White edge (fog) lines just inside the curb.
            markings.addRibbon(offsetPath(run, half - 0.75), 0.16, deckSampler, MARKING_LAYER);
            markings.addRibbon(offsetPath(run, -(half - 0.75)), 0.16, deckSampler, MARKING_LAYER);
            // Avenue+ get dashed lane dividers either side of the centerline.
            if (street.level === "avenue") {
              for (const dash of dashSegments(offsetPath(run, half * 0.5), 2.4, 3.2)) markings.addRibbon(dash, 0.13, deckSampler, MARKING_LAYER);
              for (const dash of dashSegments(offsetPath(run, -half * 0.5), 2.4, 3.2)) markings.addRibbon(dash, 0.13, deckSampler, MARKING_LAYER);
            }
          }
        }
      }
      if (street.bulb !== undefined) {
        (street.surface === "gravel" ? gravel : asphalt).addDisc(street.bulb, street.width * 1.15, sample, ROAD_LAYER);
        if (street.sidewalk) sidewalks.addDisc(street.bulb, street.width * 1.15 + 1.8, sample, SIDEWALK_LAYER);
      }
      if (street.surface === "asphalt" && street.level !== "lane") {
        if (street.level === "boulevard") {
          // Median strip instead of a center line, broken WELL clear of every junction — a median
          // stub poking into a crossing reads as debris. Runs shorter than a car are dropped and
          // ends get a rounded cap so each island reads designed.
          for (const run of clipPolylineAtIntersections(rounded, resolved.intersections, 2.6)) {
            let runLength = 0;
            for (let i = 0; i + 1 < run.length; i += 1) runLength += Math.hypot(run[i + 1]![0] - run[i]![0], run[i + 1]![1] - run[i]![1]);
            if (runLength < 7) continue;
            const width = Math.max(1.3, street.width * 0.14);
            medians.addRibbon(run, width, deckSampler, MEDIAN_LAYER);
            medians.addDisc(run[0]!, width / 2, deckSampler, MEDIAN_LAYER, null, 8);
            medians.addDisc(run[run.length - 1]!, width / 2, deckSampler, MEDIAN_LAYER, null, 8);
          }
        } else {
          for (const dash of dashSegments(rounded, 2.6, 3.6)) {
            const [a, b] = [dash[0]!, dash[dash.length - 1]!];
            const mid: RoadPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            let inCross = false;
            for (const cross of resolved.intersections) {
              if (Math.hypot(cross.x - mid[0], cross.z - mid[1]) < cross.radius + 0.8) {
                inCross = true;
                break;
              }
            }
            if (!inCross) markings.addRibbon(dash, 0.18, deckSampler, MARKING_LAYER);
          }
        }
      }
    }
    // NOTE: streetGenerator's `Street.sidewalks` offset polylines are NOT surfaced here — this renderer
    // consumes `resolveCityObject`'s `CityStreet` (which carries only a `sidewalk` boolean), and its
    // sidewalks come from richer block curb→land bands below. Wiring the raw offset polylines would be a
    // second, redundant sidewalk source, so it is intentionally skipped for this component's data flow.
    // Sidewalk band per block: the region between the curb ring (outer) and the land ring (inner).
    // Blocks whose two rings coincide (no sidewalk) drop out — every band triangle is degenerate,
    // so `addRingBand` emits nothing.
    if (useBlockSidewalks) {
      for (const block of resolved.blocks) {
        sidewalks.addRingBand(block.curb, block.polygon, sample, SIDEWALK_LAYER);
      }
    }
    // Junctions: corner curb-return apron (sidewalk ring peeking out under the asphalt patch), the
    // patch itself, and a zebra crossing on every REAL arm — but only where the crossing warrants
    // it. Avenue-and-up arms (or a boulevard/avenue junction) get zebra stripes and the apron;
    // small residential crossings get just the asphalt patch.
    resolved.intersections.forEach((cross, crossIndex) => {
      const bigLevel = cross.level === "boulevard" || cross.level === "avenue";
      const armZebra = (width: number): boolean => bigLevel || width >= resolved.rules.streetWidth * 1.4;
      const paved = resolved.rules.sidewalks && cross.level !== "lane";
      // A slightly larger apron underneath the crossing reads as the wrapped sidewalk/curb.
      if (paved) {
        const apron = junctionOutline(cross, 1.15, resolved.rules.sidewalkWidth + 0.4);
        if (apron !== null) sidewalks.addPolygon(apron, sample, SIDEWALK_LAYER);
      }
      // The junction pavement is welded onto the trimmed ribbon ends (seam-shared, no floating disc).
      // Crossings that got no trimmed approach fall back to the rounded outline / disc, so coverage
      // never regresses.
      const approaches = approachesByCross.get(crossIndex);
      if (approaches !== undefined && approaches.length > 0) {
        patches.addMesh(buildJunctionSurface({ x: cross.x, z: cross.z }, approaches, deckSampler, JUNCTION_OPTS));
      } else {
        const outline = junctionOutline(cross);
        if (outline !== null) patches.addPolygon(outline, deckSampler, ROAD_LAYER);
        else patches.addDisc([cross.x, cross.z], cross.radius, deckSampler, ROAD_LAYER);
      }
      if (paved) {
        const maxHalf = Math.max(...cross.arms.map((arm) => arm.width / 2));
        for (const arm of cross.arms) {
          if (!armZebra(arm.width)) continue;
          const dir: readonly [number, number] = [Math.sin(arm.angle), Math.cos(arm.angle)];
          const perp: readonly [number, number] = [-dir[1], dir[0]];
          // Stop line across the approach, just outside the crossing box.
          const stopDist = maxHalf * 1.15 + 0.55;
          addMarkQuad([cross.x + dir[0] * stopDist, cross.z + dir[1] * stopDist], perp, arm.width * 0.82, 0.5);
          for (let stripe = 0; stripe < 4; stripe += 1) {
            const dist = maxHalf * 1.15 + 1.5 + stripe * 0.85;
            const center: RoadPoint = [cross.x + dir[0] * dist, cross.z + dir[1] * dist];
            addMarkQuad(center, perp, arm.width * 0.8, 0.44);
          }
        }
      }
    });
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
        addMarkQuad([cx, cz], [sin, cos], pad.size[1] * 0.42, 0.12);
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

  // --- Instanced furniture: trees per species, street lights, hedges. ---
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
        const scale = tree.scale * SPECIES_SCALE[species];
        matrix.compose(
          new THREE.Vector3(tree.x, sample(tree.x, tree.z) - 0.05, tree.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.jitter * Math.PI * 2),
          new THREE.Vector3(scale, scale * (0.92 + tree.jitter * 0.16), scale),
        );
        mesh.setMatrixAt(i, matrix);
        color.setScalar(0.82 + tree.jitter * 0.36);
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
    return { meshes, disposables };
  }, [resolved, sample]);
  useEffect(
    () => () => {
      if (furniture === null) return;
      for (const disposable of furniture.disposables) disposable.dispose();
    },
    [furniture],
  );

  if (resolved === null) return null;
  return (
    <group>
      {ground?.asphalt != null ? (
        <mesh geometry={ground.asphalt} receiveShadow>
          <meshStandardMaterial color={ASPHALT_COLOR} roughness={0.96} metalness={0} side={THREE.DoubleSide} />
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
          <meshStandardMaterial color={ASPHALT_COLOR} roughness={0.96} metalness={0} side={THREE.DoubleSide} />
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
      <DetailBuildings buildings={detail.buildings} palette={palette} />
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
