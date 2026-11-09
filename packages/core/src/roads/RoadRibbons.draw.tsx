import { useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, MeshStandardMaterial } from "three";
import { isAsphaltSurface, type RoadEnvironmentDescriptor, type TerrainDetailMaterialConfig } from "@jgengine/core/world/features";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import {
  buildIntersectionMarkings,
  buildRoadRibbon,
  buildTrimmedIntersections,
  dashSegments,
  GROUND_DECAL_LAYERS,
  offsetPath,
  roundPathCorners,
  type RoadJunctionInput,
  type RoadPoint,
  type RoadRibbon,
} from "@jgengine/core/roads/roads";
import { findRoadJunctions, sidewalkWidthOf, type RoadJunction } from "@jgengine/core/roads/streets";
import type { TerrainField } from "@jgengine/core/terrain/terrain";

import type { SurfaceScanTextures } from "@jgengine/core/material/surfaceScanTextures.draw";
import { roadJunctionsDraw } from "./RoadJunctions.draw";
import { terrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import {
  isSoftRibbonSurface,
  resolvePathSurface,
  ribbonEdgeMargin,
  RIBBON_FRAME_ATTRIBUTE,
  ribbonSurfaceFrame,
  scannedRibbonDraw,
  type RibbonSurfaceScan,
  type ScannedRibbonSpec,
  type SurfaceRibbonMaterialOptions,
} from "./surfaceRibbonMaterial.draw";

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
/**
 * Default kerb height over the gutter, the same step the generated city draws (`CityRenderer`'s road
 * 0.16 -> sidewalk 0.32). A 4 cm lip read as paint on the road; a road sets its own with `sidewalk.kerb`.
 */
const DEFAULT_KERB = 0.14;

/** Sidewalk top above the carriageway: the gutter lift plus the road's kerb. @internal */
export function sidewalkLiftOf(road: Pick<RoadEnvironmentDescriptor, "sidewalk">): number {
  const kerb = road.sidewalk === false ? DEFAULT_KERB : road.sidewalk.kerb ?? DEFAULT_KERB;
  return CURB_LIFT + Math.max(0, kerb);
}
/** Default paving slab length along the kerb, metres; across, the sidewalk divides into whole slabs near this. */
const SLAB_METRES = 1.5;

/** Mix two colours (deterministic, no alloc churn). @internal */
export function mixColor(a: string, b: string, t: number): string {
  const c = new Color(a).lerp(new Color(b), t);
  return `#${c.getHexString()}`;
}

/**
 * The gutter strip's colour: poured concrete between kerb and asphalt where there is a sidewalk,
 * else a dusty shoulder a shade paler than the road. Never darker than the carriageway: a dark
 * band along every edge reads as a cartoon outline. @internal
 */
export function gutterColor(roadColor: string, sidewalkColor: string | null): string {
  return sidewalkColor === null
    ? mixColor(roadColor, "#9a968c", 0.22)
    : mixColor(mixColor(sidewalkColor, roadColor, 0.35), "#000000", 0.08);
}

/** One road's share of a merged draw: its trimmed centreline sub-paths and the base height they drape at. */
export interface RoadPiece {
  elevation: number;
  paths: readonly (readonly RoadPoint[])[];
}

/**
 * Vertical faces along each sidewalk edge: the kerb face from the gutter up to the sidewalk top on the
 * road side, and a skirt down to the ground on the outer side, so the raised slab never floats.
 * @internal
 */
export function buildKerbFaces(
  pieces: readonly RoadPiece[],
  roadWidth: number,
  sidewalkWidth: number,
  sampleHeight: (x: number, z: number) => number,
  sidewalkLift: number = CURB_LIFT + DEFAULT_KERB,
): BufferGeometry | null {
  const positions: number[] = [];
  const indices: number[] = [];
  const strip = (line: readonly RoadPoint[], bottom: number, top: number) => {
    if (line.length < 2) return;
    const base = positions.length / 3;
    for (const [x, z] of line) {
      const h = sampleHeight(x, z);
      positions.push(x, h + bottom, z, x, h + top, z);
    }
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  for (const { paths, elevation } of pieces) {
    for (const path of paths) {
      for (const side of [1, -1]) {
        strip(offsetPath(path, (roadWidth / 2) * side), elevation + CURB_LIFT - 0.01, elevation + sidewalkLift);
        strip(offsetPath(path, (roadWidth / 2 + sidewalkWidth) * side), -0.05, elevation + sidewalkLift);
      }
    }
  }
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Lane paint width for a carriageway: 15–30 cm, as real centre lines are. The old 3.5%-of-width
 * rule drew half-metre bars on a city avenue, the chunkiest toy cue on the street. @internal
 */
export function roadMarkingWidth(roadWidth: number): number {
  return Math.min(0.3, Math.max(0.15, roadWidth * 0.015));
}

/** A loaded scan as ribbon material input, or `undefined` while it loads, failed, or was never asked for. */
function ribbonScan(
  config: TerrainDetailMaterialConfig | undefined,
  textures: SurfaceScanTextures | null,
  projection: "world" | "frame",
): RibbonSurfaceScan | undefined {
  if (config === undefined || textures === null) return undefined;
  return { textures, projection, repeat: config.repeat ?? 4, strength: config.strength ?? 1, tint: config.tint ?? 1 };
}

function toGeometry(positions: Float32Array, indices: Uint32Array): BufferGeometry | null {
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Merge many ribbons into one plain buffer geometry, so they cost one draw. @internal */
export function mergeRibbonGeometry(ribbons: readonly RoadRibbon[]): BufferGeometry | null {
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

/** {@link mergeRibbonGeometry} plus each ribbon's along/across frame for the surface shader. */
function mergeRibbons(ribbons: readonly RoadRibbon[]): BufferGeometry | null {
  const geometry = mergeRibbonGeometry(ribbons);
  geometry?.setAttribute(RIBBON_FRAME_ATTRIBUTE, new BufferAttribute(ribbonSurfaceFrame(ribbons.map((r) => r.positions)), 3));
  return geometry;
}

/**
 * Everything about a road that shapes its materials, as one string: roads with equal keys share
 * every material, so their layers merge into one draw each. The path, its corners and the base
 * elevation only shape geometry and stay out. @internal
 */
export function roadLookKey(road: RoadEnvironmentDescriptor): string {
  const { width, color, markings, markingColor, sidewalk, surface, materials, wear, edgeSoftness } = road;
  return JSON.stringify([width, color, markings, markingColor, sidewalk, surface ?? null, materials ?? null, wear ?? null, edgeSoftness ?? null]);
}

/** Convert a detected {@link RoadJunction} into the structural {@link RoadJunctionInput} the trimmer wants. @internal */
export function roadJunctionInput(junction: RoadJunction): RoadJunctionInput {
  return {
    x: junction.center[0],
    z: junction.center[1],
    // Arm direction `[dx, dz]` → angle `atan2(dx, dz)`, matching the generator convention the core uses.
    arms: junction.approaches.map((approach) => ({
      angle: Math.atan2(approach.direction[0], approach.direction[1]),
      width: approach.width,
    })),
    elevation: junction.elevation,
  };
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
  /** Stop lines and zebra crosswalks at every multi-arm junction mouth, when paint was asked for. */
  junctionPaint: RoadRibbon[];
}

/** Stop-line width of authored crossings, metres. */
const STOP_LINE_WIDTH = 0.5;

/**
 * Trim every authored road back to its junction boundaries and weld one surface into each crossing,
 * through the core's one intersection builder ({@link buildTrimmedIntersections}): ribbon corners
 * drape at the road's own `elevation`, each surface at its junction's. With `paint`, every multi-arm
 * mouth gets a stop line and a zebra crosswalk ({@link buildIntersectionMarkings}).
 * @internal
 */
export function buildAuthoredRoadNetwork(
  roads: readonly RoadEnvironmentDescriptor[],
  junctions: readonly RoadJunction[],
  sampleHeight: (x: number, z: number) => number,
  { paint = false }: { paint?: boolean } = {},
): AuthoredRoadNetwork {
  const intersections = buildTrimmedIntersections(
    roads.map((road) => ({
      path: road.path,
      width: road.width,
      elevation: road.elevation,
      ...(paint && road.markings !== false ? { markings: { stopLine: true, crosswalk: true } } : {}),
    })),
    junctions.map(roadJunctionInput),
    sampleHeight,
  );
  const roadPaths: RoadPoint[][][] = roads.map(() => []);
  intersections.trimmed.forEach((trimmed, index) => roadPaths[intersections.trimmedStreetIndices[index]!]!.push(trimmed.path));
  const junctionSurfaces = intersections.junctions.map((ribbon, index) => ({
    color: junctions[intersections.junctionIndices[index]!]!.color,
    ribbon,
  }));
  const paintElevation = junctions.reduce((top, junction) => Math.max(top, junction.elevation), 0) + MARKING_LIFT;
  const junctionPaint = paint
    ? buildIntersectionMarkings(intersections, sampleHeight, { elevation: paintElevation, stopLineWidth: STOP_LINE_WIDTH })
    : [];
  return { roadPaths, junctionSurfaces, junctionPaint };
}

/** Props for {@link RoadRibbons}. */
export interface RoadRibbonsProps {
  /** The shared look; its path and elevation are ignored in favour of `pieces`. */
  road: RoadEnvironmentDescriptor;
  field: TerrainField;
  pieces: readonly RoadPiece[];
}

/**
 * Renders every road that looks like `road` (equal {@link roadLookKey}) from their trimmed centerline
 * sub-paths (cut back at every junction by {@link buildAuthoredRoadNetwork}): an asphalt ribbon, a
 * curb/edge strip along each border, an optional dashed centerline, and optional sidewalks. Each layer
 * is one merged draw however many roads share the look, so a city of streets costs a handful of draws.
 * Because the sub-paths already stop at the junction boundary, every layer naturally ends there â€” no
 * ribbon ploughs through the crossing and the dashed line no longer needs exclusion circles to skip
 * intersections. The carriageway, curbs and sidewalks shade with the terrain's procedural surfaces
 * (`road.surface`, default asphalt with tyre wear); `surface: false` keeps them flat.
 * @capability road-ribbons draw roads, tracks and trails as surfaced ribbons with curbs, sidewalks, lane markings and trimmed junctions
 */
export function roadRibbonsDraw(getProps: () => RoadRibbonsProps): EngineDraw {
  const group = new Group();
  let children: { draw: EngineDraw; state: EngineFrameState }[] = [];
  let geometries: BufferGeometry[] = [];
  let added = false;

  function addChild(state: EngineFrameState, draw: EngineDraw): void {
    const childState = childFrameState(state, group);
    draw.mount?.(childState);
    children.push({ draw, state: childState });
  }

  function ribbonSpec(
    geometry: BufferGeometry,
    scanMaps: TerrainDetailMaterialConfig["maps"] | undefined,
    detailed: boolean,
    materialOptions: (textures: SurfaceScanTextures | null, quality: GraphicsQuality) => SurfaceRibbonMaterialOptions | null,
    fallback: () => MeshStandardMaterial,
    extra?: Partial<ScannedRibbonSpec>,
  ): ScannedRibbonSpec {
    return {
      geometry,
      scanMaps,
      scanEnabled: detailed && terrainQuality() !== "low",
      quality: terrainQuality(),
      materialOptions: (textures) => materialOptions(textures, terrainQuality()),
      fallback,
      receiveShadow: true,
      ...extra,
    };
  }

  return {
    mount(state: EngineFrameState) {
      const { road, field, pieces } = getProps();
      const detailed = road.surface !== false;
      const style = detailed
        ? resolvePathSurface("road", road.width, {
            surface: road.surface ?? "road",
            ...(road.wear === undefined ? {} : { wear: road.wear }),
            ...(road.edgeSoftness === undefined ? {} : { edgeSoftness: road.edgeSoftness }),
          })
        : null;
      // Unpaved ground (dirt, gravel, sand) fades into the terrain instead of meeting it at a gutter.
      const soft = style !== null && isSoftRibbonSurface(style.surface);
      // A soft edge needs the ribbon wider than authored so the fade straddles the authored edge.
      const margin = soft && road.sidewalk === false && style !== null ? ribbonEdgeMargin(style) : 0;
      const asphalt = mergeRibbons(
        pieces.flatMap(({ paths, elevation }) =>
          paths.map((path) => buildRoadRibbon(path, road.width + margin, (x, z) => field.sampleHeight(x, z), { elevation, maxSegmentLength: 2 })),
        ),
      );
      if (asphalt === null) return;
      const markingWidth = roadMarkingWidth(road.width);
      const dashes = !road.markings
        ? null
        : mergeRibbons(
            pieces.flatMap(({ paths, elevation }) =>
              paths.flatMap((path) =>
                dashSegments(path, 3.2, 4).map((dash) =>
                  buildRoadRibbon(dash, markingWidth, (x, z) => field.sampleHeight(x, z), { elevation: elevation + MARKING_LIFT }),
                ),
              ),
            ),
          );
      const sidewalkColor = road.sidewalk === false ? "#a7adb8" : road.sidewalk.color;
      const curbColor = gutterColor(road.color, road.sidewalk === false ? null : sidewalkColor);
      const curbs = soft && road.sidewalk === false
        ? null
        : mergeRibbons(
            pieces.flatMap(({ paths, elevation }) => {
              // The gutter: a narrow strip inside each asphalt edge, lifted just above the ribbon.
              const strip = Math.min(0.6, Math.max(0.35, road.width * 0.045));
              const edge = road.width / 2 - strip / 2;
              return paths.flatMap((path) => [edge, -edge].map((off) =>
                buildRoadRibbon(offsetPath(path, off), strip, (x, z) => field.sampleHeight(x, z), { elevation: elevation + CURB_LIFT }),
              ));
            }),
          );
      const sidewalkWidth = sidewalkWidthOf(road);
      const sidewalks = (() => {
        if (sidewalkWidth <= 0) return null;
        const offset = road.width / 2 + sidewalkWidth / 2;
        return mergeRibbons(
          pieces.flatMap(({ paths, elevation }) =>
            paths.flatMap((path) => [offset, -offset].map((off) =>
              buildRoadRibbon(offsetPath(path, off), sidewalkWidth, (x, z) => field.sampleHeight(x, z), { elevation: elevation + sidewalkLiftOf(road) }),
            )),
          ),
        );
      })();
      const kerbs = sidewalkWidth <= 0 ? null : buildKerbFaces(pieces, road.width, sidewalkWidth, (x, z) => field.sampleHeight(x, z), sidewalkLiftOf(road));
      const slabSize = road.sidewalk === false ? false : road.sidewalk.slabs ?? SLAB_METRES;
      const slabs = (() => {
        if (slabSize === false || slabSize <= 0) return undefined;
        const across = sidewalkWidth / Math.max(1, Math.round(sidewalkWidth / slabSize));
        return [slabSize, across] as const;
      })();
      // Paint takes the asphalt's grain (tint 0 keeps the marking colour) and wears through to it.
      const kerbColor = mixColor(sidewalkColor, "#000000", 0.12);
      const roadScanMaps = road.materials?.road?.maps;
      const sidewalkScanMaps = road.materials?.sidewalk?.maps;
      const curbScanMaps = road.materials?.curb?.maps;

      geometries = [asphalt, dashes, curbs, sidewalks, kerbs].filter((g): g is BufferGeometry => g !== null);
      addChild(state, scannedRibbonDraw(() =>
        ribbonSpec(
          asphalt,
          roadScanMaps,
          detailed,
          (textures, quality) => {
            if (style === null) return null;
            const roadScan = ribbonScan(road.materials?.road, textures, "world");
            return soft
              ? { ...style, color: road.color, halfWidth: road.width / 2, quality, ...(roadScan === undefined ? {} : { scan: roadScan }) }
              : { surface: style.surface, wear: style.wear, color: road.color, halfWidth: road.width / 2, quality, ...(roadScan === undefined ? {} : { scan: roadScan }) };
          },
          () => new MeshStandardMaterial({ color: road.color, roughness: 0.95, metalness: 0, side: DoubleSide }),
        ),
      ));
      if (curbs !== null) {
        addChild(state, scannedRibbonDraw(() =>
          ribbonSpec(
            curbs,
            curbScanMaps,
            detailed,
            (textures, quality) => {
              if (!detailed) return null;
              const curbScan = ribbonScan(road.materials?.curb, textures, "frame");
              return { surface: "concrete", color: curbColor, halfWidth: road.width / 2, roughness: 0.9, quality, ...(curbScan === undefined ? {} : { scan: curbScan }) };
            },
            () => new MeshStandardMaterial({ color: curbColor, roughness: 0.9, metalness: 0, side: DoubleSide }),
          ),
        ));
      }
      if (dashes !== null) {
        addChild(state, scannedRibbonDraw(() =>
          ribbonSpec(
            dashes,
            roadScanMaps,
            detailed,
            (textures, quality) => {
              const roadScan = ribbonScan(road.materials?.road, textures, "world");
              return detailed
                ? {
                    surface: "road",
                    color: road.markingColor,
                    halfWidth: markingWidth / 2,
                    roughness: 0.6,
                    quality,
                    polygonOffset: true,
                    paint: true,
                    ...(roadScan === undefined ? {} : { scan: { ...roadScan, tint: 0, strength: 0.85 } }),
                  }
                : null;
            },
            () =>
              new MeshStandardMaterial({
                color: road.markingColor,
                roughness: 0.8,
                metalness: 0,
                side: DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
              }),
            { renderOrder: 1 },
          ),
        ));
      }
      if (sidewalks !== null) {
        addChild(state, scannedRibbonDraw(() =>
          ribbonSpec(
            sidewalks,
            sidewalkScanMaps,
            detailed,
            (textures, quality) => {
              if (!detailed) return null;
              const sidewalkScan = ribbonScan(road.materials?.sidewalk, textures, "frame");
              return {
                surface: "pavement",
                color: sidewalkColor,
                halfWidth: Math.max(0.01, sidewalkWidth / 2),
                roughness: 0.9,
                scale: 1.6,
                quality,
                ...(slabs === undefined ? {} : { slabs }),
                ...(sidewalkScan === undefined ? {} : { scan: sidewalkScan }),
              };
            },
            () => new MeshStandardMaterial({ color: sidewalkColor, roughness: 0.9, metalness: 0, side: DoubleSide }),
          ),
        ));
      }
      if (kerbs !== null) {
        addChild(state, scannedRibbonDraw(() =>
          ribbonSpec(
            kerbs,
            undefined,
            detailed,
            () => null,
            () => new MeshStandardMaterial({ color: kerbColor, roughness: 0.88, metalness: 0, side: DoubleSide }),
          ),
        ));
      }
      state.scene.add(group);
      added = true;
    },
    frame(_state: EngineFrameState) {
      for (const child of children) child.draw.frame?.(child.state);
    },
    dispose(state: EngineFrameState) {
      for (const child of children) child.draw.dispose?.(child.state);
      children = [];
      if (added) state.scene.remove(group);
      added = false;
      for (const geometry of geometries) geometry.dispose();
      geometries = [];
    },
  };
}

/**
 * Renders every road that looks like `road` (equal {@link roadLookKey}) from their trimmed centerline
 * sub-paths â€” the React wrapper over {@link roadRibbonsDraw}.
 */
export function RoadRibbons(props: RoadRibbonsProps) {
  const latest = useRef<RoadRibbonsProps>(props);
  latest.current = props;
  useEngineDraw(() => roadRibbonsDraw(() => latest.current), [props.road, props.field, props.pieces]);
  return null;
}

/** A road's centreline as drawn: a closed loop rejoined at a straight seam, sharp bends filleted. @internal */
export function drawnRoadPath(road: Pick<RoadEnvironmentDescriptor, "path" | "width" | "closed" | "cornerRadius">): RoadPoint[] {
  const points = road.path.map((point) => [point[0], point[1]] as RoadPoint);
  let line = points;
  if (road.closed === true && points.length >= 3) {
    // Start mid-way along the first segment so every authored vertex, the first included, gets filleted.
    const a = points[0]!;
    const b = points[1]!;
    const mid: RoadPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    line = [mid, ...points.slice(1), a, mid];
  }
  const radius = road.cornerRadius ?? Math.max(1.5, road.width * 0.9);
  const rounded = radius > 0 ? roundPathCorners(line, radius, 6) : line;
  // Neighbouring fillets on short segments meet at the same midpoint; a zero-length step has no
  // normal, and offset kerbs and sidewalks would spike across the road there.
  const out: RoadPoint[] = [rounded[0]!];
  for (let i = 1; i < rounded.length; i += 1) {
    const prev = out[out.length - 1]!;
    const next = rounded[i]!;
    if (Math.hypot(next[0] - prev[0], next[1] - prev[1]) > 1e-3) out.push(next);
  }
  return out;
}

/** Roads that weld into each other at crossings: the paved network, or one unpaved surface. */
function surfaceGroup(road: RoadEnvironmentDescriptor): string {
  if (road.surface === false) return "flat";
  return isAsphaltSurface(road.surface) ? "paved" : road.surface ?? "paved";
}

/** One surface group of roads: junctions welded across them plus a ribbon draw per shared look. */
function roadGroupDraw(getProps: () => { roads: readonly RoadEnvironmentDescriptor[]; field: TerrainField; group: string }): EngineDraw {
  const root = new Group();
  let children: { draw: EngineDraw; state: EngineFrameState }[] = [];
  let added = false;
  return {
    mount(state: EngineFrameState) {
      const { roads, field, group: groupName } = getProps();
      const junctions = findRoadJunctions(roads);
      const paved = groupName === "paved";
      const network = buildAuthoredRoadNetwork(roads, junctions, (x, z) => field.sampleHeight(x, z), { paint: paved });
      const byLook = new Map<string, { road: RoadEnvironmentDescriptor; pieces: RoadPiece[] }>();
      roads.forEach((road, index) => {
        const piece = { elevation: road.elevation, paths: network.roadPaths[index] ?? [] };
        const key = roadLookKey(road);
        const look = byLook.get(key);
        if (look === undefined) byLook.set(key, { road, pieces: [piece] });
        else look.pieces.push(piece);
      });
      const add = (draw: EngineDraw) => {
        const childState = childFrameState(state, root);
        draw.mount?.(childState);
        children.push({ draw, state: childState });
      };
      for (const look of byLook.values()) {
        add(roadRibbonsDraw(() => ({ road: look.road, field, pieces: look.pieces })));
      }
      add(
        roadJunctionsDraw(() => ({
          surfaces: network.junctionSurfaces,
          paint: network.junctionPaint,
          surfaceDetail: groupName !== "flat",
          surface: paved || groupName === "flat" ? "road" : groupName,
          scan: roads.find((road) => road.materials?.road !== undefined)?.materials?.road,
        })),
      );
      state.scene.add(root);
      added = true;
    },
    frame(_state: EngineFrameState) {
      for (const child of children) child.draw.frame?.(child.state);
    },
    dispose(state: EngineFrameState) {
      for (const child of children) child.draw.dispose?.(child.state);
      children = [];
      if (added) state.scene.remove(root);
      added = false;
    },
  };
}

/**
 * The engine's one road renderer: `road()` descriptors from an environment and authored editor
 * paths (streets, race tracks, trails, routes) all draw here â€” the React wrapper over {@link roadsDraw}.
 */
export function roadsDraw(getProps: () => { roads: readonly RoadEnvironmentDescriptor[]; field: TerrainField }): EngineDraw {
  const root = new Group();
  let children: { draw: EngineDraw; state: EngineFrameState }[] = [];
  let added = false;
  return {
    mount(state: EngineFrameState) {
      const { roads, field } = getProps();
      const byGroup = new Map<string, RoadEnvironmentDescriptor[]>();
      for (const entry of roads) {
        if (entry.path.length < 2) continue;
        const drawn = { ...entry, path: drawnRoadPath(entry) };
        const key = surfaceGroup(entry);
        const bucket = byGroup.get(key);
        if (bucket === undefined) byGroup.set(key, [drawn]);
        else bucket.push(drawn);
      }
      for (const [groupName, entries] of byGroup) {
        const draw = roadGroupDraw(() => ({ roads: entries, field, group: groupName }));
        const childState = childFrameState(state, root);
        draw.mount?.(childState);
        children.push({ draw, state: childState });
      }
      state.scene.add(root);
      added = true;
    },
    frame(_state: EngineFrameState) {
      for (const child of children) child.draw.frame?.(child.state);
    },
    dispose(state: EngineFrameState) {
      for (const child of children) child.draw.dispose?.(child.state);
      children = [];
      if (added) state.scene.remove(root);
      added = false;
    },
  };
}

/**
 * The engine's one road renderer: `road()` descriptors from an environment and authored editor
 * paths (streets, race tracks, trails, routes) all draw here â€” the React wrapper over {@link roadsDraw}.
 */
export function Roads({ roads, field }: { roads: readonly RoadEnvironmentDescriptor[]; field: TerrainField }) {
  const latest = useRef<{ roads: readonly RoadEnvironmentDescriptor[]; field: TerrainField }>({ roads, field });
  latest.current = { roads, field };
  useEngineDraw(() => roadsDraw(() => latest.current), [roads, field]);
  return null;
}
