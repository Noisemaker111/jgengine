import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from "three";
import type { RoadEnvironmentDescriptor } from "@jgengine/core/world/features";
import {
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
import { offsetPath, sidewalkWidthOf, type RoadJunction } from "@jgengine/core/world/streets";
import type { TerrainField } from "@jgengine/core/world/terrain";

/**
 * Decal sub-layers as small lifts above each road's authored base `elevation`, spaced by the
 * single-owner {@link GROUND_DECAL_LAYERS} table so the edge strip and lane paint never z-fight the
 * asphalt they sit on. The asphalt ribbon and the welded junction surface stay on the authored base
 * (they are seam-welded — never stacked); markings lift by the table's road→marking gap and ALSO get
 * `polygonOffset`/`renderOrder` on the material. Curbs and sidewalks are their own surfaces beside
 * the road edge (not table decal layers), so they carry documented offsets rather than a table entry.
 */
const MARKING_LIFT = GROUND_DECAL_LAYERS.marking - GROUND_DECAL_LAYERS.road;
const CURB_LIFT = 0.02;
const SIDEWALK_LIFT = 0.06;

/** Darken an asphalt color toward black for a curb/edge strip (deterministic, no alloc churn). */
function darken(hex: string, amount: number): string {
  const c = new Color(hex);
  c.multiplyScalar(1 - amount);
  return `#${c.getHexString()}`;
}

function toGeometry(positions: Float32Array, indices: Uint32Array): BufferGeometry | null {
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Merge many ribbons into one buffer geometry (draws collapse to a single mesh). */
function mergeRibbons(ribbons: readonly RoadRibbon[]): BufferGeometry | null {
  const vertexCount = ribbons.reduce((sum, r) => sum + r.positions.length, 0);
  const indexCount = ribbons.reduce((sum, r) => sum + r.indices.length, 0);
  if (vertexCount === 0) return null;
  const positions = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const ribbon of ribbons) {
    positions.set(ribbon.positions, vertexOffset);
    const base = vertexOffset / 3;
    for (let i = 0; i < ribbon.indices.length; i += 1) indices[indexOffset + i] = ribbon.indices[i]! + base;
    vertexOffset += ribbon.positions.length;
    indexOffset += ribbon.indices.length;
  }
  return toGeometry(positions, indices);
}

/** Convert a detected {@link RoadJunction} into the structural {@link RoadJunctionInput} the trimmer wants. */
export function roadJunctionInput(junction: RoadJunction): RoadJunctionInput {
  return {
    x: junction.center[0],
    z: junction.center[1],
    // Arm direction `[dx, dz]` → angle `atan2(dx, dz)`, matching the generator convention the core uses.
    arms: junction.approaches.map((approach) => ({
      angle: Math.atan2(approach.direction[0], approach.direction[1]),
      width: approach.width,
    })),
  };
}

/**
 * Split every path segment at the junction centers that fall on it, inserting the junction point as
 * a real vertex so {@link trimPathAtJunctions} (which matches junctions to path vertices) can cut the
 * ribbon back there. Authored road crossings from `findRoadJunctions` land mid-segment, not on the
 * hand-authored vertices, so without this the trimmer would never see them.
 */
export function insertJunctionNodes(
  path: readonly RoadPoint[],
  junctions: readonly RoadJunctionInput[],
  tolerance = 1e-3,
): RoadPoint[] {
  if (path.length < 2) return path.map((p) => [p[0], p[1]] as RoadPoint);
  const out: RoadPoint[] = [[path[0]![0], path[0]![1]]];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const lengthSq = abx * abx + abz * abz;
    if (lengthSq > 1e-12) {
      const hits: { t: number; x: number; z: number }[] = [];
      for (const j of junctions) {
        const t = ((j.x - a[0]) * abx + (j.z - a[1]) * abz) / lengthSq;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue; // coincident with an existing vertex — already covered
        const px = a[0] + abx * t;
        const pz = a[1] + abz * t;
        if (Math.hypot(j.x - px, j.z - pz) <= tolerance) hits.push({ t, x: j.x, z: j.z });
      }
      hits.sort((u, v) => u.t - v.t);
      for (const hit of hits) {
        const prev = out[out.length - 1]!;
        if (Math.hypot(prev[0] - hit.x, prev[1] - hit.z) > 1e-6) out.push([hit.x, hit.z]);
      }
    }
    out.push([b[0], b[1]]);
  }
  return out;
}

/** One welded asphalt junction surface plus the color it should render in. */
export interface JunctionSurface {
  color: string;
  ribbon: RoadRibbon;
}

/** Trimmed ribbons for every road plus the welded surfaces that fill the crossings between them. */
export interface AuthoredRoadNetwork {
  /** Trimmed centerline sub-paths per input road (parallel to the `roads` array; empty for degenerate roads). */
  roadPaths: RoadPoint[][][];
  /** One welded surface per junction that at least one trimmed ribbon actually ends at. */
  junctionSurfaces: JunctionSurface[];
}

/**
 * Trim every authored road back to its junction boundaries and weld one surface into each crossing —
 * the drop-in replacement for the old "full ribbons + floating disc" model. Each road's path gets its
 * junction crossings inserted as vertices, is trimmed by {@link trimPathAtJunctions} (a through-road
 * splits in two), and the terminal cross-section corners feed {@link buildJunctionSurface}. Ribbon
 * corners drape at the road's own authored `elevation`, so each welded corner meets the ribbon end at
 * the exact same height (seam-shared, per {@link GROUND_DECAL_LAYERS}); the surface interior drapes at
 * the junction's representative elevation. Pure geometry, so the shell just meshes the result.
 */
export function buildAuthoredRoadNetwork(
  roads: readonly RoadEnvironmentDescriptor[],
  junctions: readonly RoadJunction[],
  sampleHeight: (x: number, z: number) => number,
): AuthoredRoadNetwork {
  const inputs = junctions.map(roadJunctionInput);
  const roadPaths: RoadPoint[][][] = [];
  const approachesByJunction = new Map<number, JunctionApproach[]>();

  for (const road of roads) {
    if (road.path.length < 2 || road.width <= 0) {
      roadPaths.push([]);
      continue;
    }
    const noded = insertJunctionNodes(road.path, inputs);
    const subs = trimPathAtJunctions(noded, road.width, inputs);
    roadPaths.push(subs.map((sub) => sub.path));
    for (const sub of subs) {
      for (const cut of sub.cuts) {
        const approach: JunctionApproach = {
          center: cut.center,
          left: [cut.left[0], sampleHeight(cut.left[0], cut.left[1]) + road.elevation, cut.left[1]],
          right: [cut.right[0], sampleHeight(cut.right[0], cut.right[1]) + road.elevation, cut.right[1]],
        };
        const list = approachesByJunction.get(cut.junctionIndex);
        if (list) list.push(approach);
        else approachesByJunction.set(cut.junctionIndex, [approach]);
      }
    }
  }

  const junctionSurfaces: JunctionSurface[] = [];
  for (const ji of [...approachesByJunction.keys()].sort((p, q) => p - q)) {
    const junction = junctions[ji]!;
    const ribbon = buildJunctionSurface(
      { x: junction.center[0], z: junction.center[1] },
      approachesByJunction.get(ji)!,
      sampleHeight,
      { elevation: junction.elevation },
    );
    junctionSurfaces.push({ color: junction.color, ribbon });
  }

  return { roadPaths, junctionSurfaces };
}

/**
 * Renders one `road()` descriptor from its trimmed centerline sub-paths (cut back at every junction
 * by {@link buildAuthoredRoadNetwork}): an asphalt ribbon, a curb/edge strip along each border, an
 * optional dashed centerline, and optional sidewalks. Because the sub-paths already stop at the
 * junction boundary, every layer naturally ends there — no ribbon ploughs through the crossing and
 * the dashed line no longer needs exclusion circles to skip intersections.
 */
export function RoadRibbons({
  road,
  field,
  paths,
}: {
  road: RoadEnvironmentDescriptor;
  field: TerrainField;
  paths: readonly (readonly RoadPoint[])[];
}) {
  const asphalt = useMemo(
    () =>
      mergeRibbons(
        paths.map((path) => buildRoadRibbon(path, road.width, (x, z) => field.sampleHeight(x, z), { elevation: road.elevation })),
      ),
    [paths, road.width, road.elevation, field],
  );
  const dashes = useMemo(() => {
    if (!road.markings) return null;
    const width = Math.max(0.25, road.width * 0.035);
    const ribbons: RoadRibbon[] = [];
    for (const path of paths) {
      for (const dash of dashSegments(path, 3.2, 4)) {
        ribbons.push(buildRoadRibbon(dash, width, (x, z) => field.sampleHeight(x, z), { elevation: road.elevation + MARKING_LIFT }));
      }
    }
    return mergeRibbons(ribbons);
  }, [paths, road.markings, road.width, road.elevation, field]);
  const curbColor = useMemo(() => darken(road.color, 0.45), [road.color]);
  const curbs = useMemo(() => {
    // A thin strip straddling each asphalt edge, lifted just above the ribbon.
    const strip = Math.max(0.4, road.width * 0.09);
    const edge = road.width / 2 - strip / 2;
    const ribbons: RoadRibbon[] = [];
    for (const path of paths) {
      for (const off of [edge, -edge]) {
        ribbons.push(buildRoadRibbon(offsetPath(path, off), strip, (x, z) => field.sampleHeight(x, z), { elevation: road.elevation + CURB_LIFT }));
      }
    }
    return mergeRibbons(ribbons);
  }, [paths, road.width, road.elevation, field]);
  const sidewalks = useMemo(() => {
    const width = sidewalkWidthOf(road);
    if (width <= 0) return null;
    const offset = road.width / 2 + width / 2;
    const ribbons: RoadRibbon[] = [];
    for (const path of paths) {
      for (const off of [offset, -offset]) {
        ribbons.push(buildRoadRibbon(offsetPath(path, off), width, (x, z) => field.sampleHeight(x, z), { elevation: road.elevation + SIDEWALK_LIFT }));
      }
    }
    return mergeRibbons(ribbons);
  }, [paths, road, field]);

  if (asphalt === null) return null;
  return (
    <group>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial color={road.color} roughness={0.95} metalness={0} side={DoubleSide} />
      </mesh>
      {curbs !== null ? (
        <mesh geometry={curbs} receiveShadow>
          <meshStandardMaterial color={curbColor} roughness={0.9} metalness={0} side={DoubleSide} />
        </mesh>
      ) : null}
      {dashes !== null ? (
        <mesh geometry={dashes} renderOrder={1}>
          <meshStandardMaterial
            color={road.markingColor}
            roughness={0.8}
            metalness={0}
            side={DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ) : null}
      {sidewalks !== null ? (
        <mesh geometry={sidewalks} receiveShadow>
          <meshStandardMaterial
            color={road.sidewalk === false ? "#a7adb8" : road.sidewalk.color}
            roughness={0.9}
            metalness={0}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
    </group>
  );
}
