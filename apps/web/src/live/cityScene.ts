/**
 * GeneratedCity → three.js. Everything rendered here is read from the real
 * `@jgengine/core` city generator output: welded street/junction surfaces from
 * `buildTrimmedIntersections`, real buildings extruded from each lot's massing
 * `pieces` (walls/roofs/trim/accent, landmarks and all), sidewalks flanking the
 * arterials, traffic flowing along the street chains, accent lights on the
 * busiest junctions. Nothing is hand-placed — same seed, same city, here and in
 * a shipped game.
 */
import * as THREE from "three";

import type { GeneratedCity } from "@jgengine/core/world/cityGenerator";
import type {
  CityLotPiece,
  CityPieceRole,
  CityLotClass,
  CityFillerClass,
  CityLandmarkClass,
} from "@jgengine/core/world/cityContent";
import type { Street, StreetLevel } from "@jgengine/core/world/streetGenerator";
import {
  buildIntersectionMarkings,
  buildRoadRibbon,
  buildTrimmedIntersections,
  GROUND_DECAL_LAYERS,
  type IntersectionStreet,
  type RoadRibbon,
} from "@jgengine/core/world/roads";
import { seededStreams } from "@jgengine/core/random/rng";

export interface CityPalette {
  /** Building wall diffuse base + jitter. */
  building: number;
  /** Street ribbon color per level. */
  streets: Record<StreetLevel, number>;
  /** Additive centerline glow on boulevards/avenues. */
  glow: number;
  /** Lit-window emissive tints. */
  windowWarm: number;
  windowCool: number;
  /** Traffic head/tail light streams. */
  trafficA: number;
  trafficB: number;
  /** Junction accent point lights. */
  lightA: number;
  lightB: number;
  fogDensity: number;
  /** Welded junction surface color. Defaults to a darkened `streets.boulevard`. */
  junction?: number;
  /** Sidewalk band color. Defaults to a lightened `streets.street`. */
  sidewalk?: number;
  /** Lane-paint color. Defaults to a warm off-white. */
  marking?: number;
  /** Roof piece flat shade. Defaults to a darkened `building`. */
  roof?: number;
  /** Trim piece flat shade (parapets, cornices, posts). Defaults to a lightened `building`. */
  trim?: number;
  /** Accent piece flat shade (awnings, barns, scoreboards). Defaults to a warm-shifted `building`. */
  accent?: number;
}

export interface CityStats {
  streets: number;
  lots: number;
  loops: number;
  junctions: number;
}

export interface CityModel {
  group: THREE.Group;
  stats: CityStats;
  radius: number;
  /** True once streets have swept in and every building has risen. */
  settled(): boolean;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

const ROAD_Y = GROUND_DECAL_LAYERS.road;
const BUILD_SWEEP_SECONDS = 1.3;
const WINDOW_W = 2.7;
const WINDOW_H = 3.4;
const TEX_CELLS = 8;
const ROOF_U = 0.5 / TEX_CELLS;
const ROOF_V = 0.5 / TEX_CELLS;
/** Street hierarchy order, widest first, for a stable draw/sweep sequence. */
const LEVEL_ORDER: StreetLevel[] = ["boulevard", "avenue", "street", "lane"];

export interface CityRevealState {
  /** Normalized road/sidewalk ribbon progress. */
  ribbonProgress: number;
  /** Junction and sidewalk-apron surfaces appear only after every approach ribbon exists. */
  junctionsVisible: boolean;
  /** Markings/glow/traffic never appear over unrevealed pavement. */
  dressingOpacity: number;
}

/** Pure timing contract shared by the renderer and animation-order tests. */
export function cityRevealState(elapsed: number, instant = false): CityRevealState {
  const sweep = instant ? 1 : Math.max(0, Math.min(1, elapsed / BUILD_SWEEP_SECONDS));
  const ribbonProgress = 1 - (1 - sweep) * (1 - sweep);
  const junctionsVisible = sweep >= 1;
  const fade = instant ? 1 : Math.max(0, Math.min(1, (elapsed - 0.9) / 1.2));
  return { ribbonProgress, junctionsVisible, dressingOpacity: junctionsVisible ? fade : 0 };
}

/**
 * Per-class visual identity. This is THE extension point: to give a new building or landmark class
 * its own look, add a row here. `wall/roof/trim/accent` are the four palette-role tints (hex) — the
 * renderer jitters each per building around the class family, so two towers differ but both read as
 * towers. `windowTint` colors lit windows; `windowDensity` (0..1) is the share of window cells that
 * light up (dense towers vs. a house with a few warm windows); `windowIntensity` is the emissive
 * punch of each lit window. `storefront` lights the ground floor of banded walls as a bright shop
 * band. `flood` (hex, 0 = off) is a whole-body glow that makes block-scale landmarks unmissable.
 * Roof/trim/accent are deliberately NOT derived from the wall color — they are their own hues so
 * gable roofs, silo caps, barn trim, and civic domes read as distinct materials at night.
 */
interface ClassStyle {
  wall: number;
  roof: number;
  trim: number;
  accent: number;
  windowTint: number;
  windowDensity: number;
  windowIntensity: number;
  storefront: boolean;
  flood: number;
}

type AnyCityClass = CityLotClass | CityFillerClass | CityLandmarkClass;

const CLASS_STYLE: Record<AnyCityClass, ClassStyle> = {
  // --- ordinary building classes -------------------------------------------------
  tower: {
    wall: 0x14223a, roof: 0x0c1424, trim: 0x3a5c84, accent: 0x22d3ee,
    windowTint: 0x6ec6ff, windowDensity: 0.6, windowIntensity: 1.55, storefront: false, flood: 0,
  }, // glassy blue-black high-rise: dark glass wall reads between cool-lit windows
  slab: {
    wall: 0x585560, roof: 0x2e2c34, trim: 0x82808c, accent: 0xb4a488,
    windowTint: 0xffca7c, windowDensity: 0.4, windowIntensity: 1.25, storefront: false, flood: 0,
  }, // concrete warm-grey block, sparse warm windows
  shop: {
    wall: 0x452f42, roof: 0x241a22, trim: 0xa05a38, accent: 0xff9d4d,
    windowTint: 0xffb060, windowDensity: 0.48, windowIntensity: 1.4, storefront: true, flood: 0,
  }, // plum-brick shop, bright ground-floor storefront glow
  rowhouse: {
    wall: 0x743d2d, roof: 0x2c1c16, trim: 0x93604a, accent: 0xd98a5a,
    windowTint: 0xffab5a, windowDensity: 0.36, windowIntensity: 1.15, storefront: false, flood: 0,
  }, // brick terrace, small warm windows
  house: {
    wall: 0x77705c, roof: 0x9a4e38, trim: 0x9c9686, accent: 0xc6b492,
    windowTint: 0xffcf7a, windowDensity: 0.22, windowIntensity: 1.0, storefront: false, flood: 0,
  }, // pale plaster, terracotta gable roof, few warm windows
  mansion: {
    wall: 0x817c6a, roof: 0x3f5266, trim: 0xaf9f7d, accent: 0xdcc48a,
    windowTint: 0xffd88a, windowDensity: 0.26, windowIntensity: 1.05, storefront: false, flood: 0,
  }, // pale stone, slate-blue roof
  farmhouse: {
    wall: 0x77644a, roof: 0x6a4630, trim: 0x9d8763, accent: 0xcbab73,
    windowTint: 0xffc270, windowDensity: 0.2, windowIntensity: 0.95, storefront: false, flood: 0,
  }, // warm cream farmhouse, gable roof
  barn: {
    wall: 0x8a231a, roof: 0x2a1210, trim: 0xe4d4ac, accent: 0xe8d8b0,
    windowTint: 0xffb060, windowDensity: 0.14, windowIntensity: 0.9, storefront: false, flood: 0,
  }, // deep barn-red with cream trim
  silo: {
    wall: 0x969ca4, roof: 0xa2a8b0, trim: 0xb4bac2, accent: 0xd2d8e0,
    windowTint: 0xbcd6f0, windowDensity: 0.08, windowIntensity: 0.85, storefront: false, flood: 0,
  }, // pale galvanized metal, almost no windows
  // --- interior-only block fillers (garages + depots behind the streetwall) -------
  garage: {
    wall: 0x54585e, roof: 0x34383e, trim: 0x6a6e76, accent: 0x8a8f98,
    windowTint: 0x9fb4c8, windowDensity: 0.5, windowIntensity: 0.7, storefront: false, flood: 0,
  }, // concrete parking structure: bare grey, banded floors read as sparse cool open-deck strips
  depot: {
    wall: 0x3a2c24, roof: 0x1e1712, trim: 0x5a4636, accent: 0x7a5238,
    windowTint: 0xffb060, windowDensity: 0.06, windowIntensity: 0.8, storefront: false, flood: 0,
  }, // dark warm brick/metal warehouse: near-windowless low box
  // --- block-scale landmarks (flood-lit so they pop out of the skyline) ----------
  hall: {
    wall: 0x6c6672, roof: 0xb58a48, trim: 0xffcf70, accent: 0xffd27a,
    windowTint: 0xffd27a, windowDensity: 0.5, windowIntensity: 1.9, storefront: false, flood: 0x6e4a16,
  }, // civic hall, gilded dome, warm floodlight
  arena: {
    wall: 0x3a4658, roof: 0x5a80a4, trim: 0x66e0ff, accent: 0x66e0ff,
    windowTint: 0x9ae4ff, windowDensity: 0.6, windowIntensity: 2.0, storefront: false, flood: 0x184a5e,
  }, // cool-lit arena bowl
  market: {
    wall: 0x5a3a48, roof: 0xb2604a, trim: 0xff9d4d, accent: 0xffb85c,
    windowTint: 0xffb060, windowDensity: 0.62, windowIntensity: 1.9, storefront: true, flood: 0x5e3410,
  }, // covered market, warm storefront glow
  campus: {
    wall: 0x3a5248, roof: 0x2a3a34, trim: 0x6ee7a8, accent: 0x6ee7a8,
    windowTint: 0xa8ffcc, windowDensity: 0.5, windowIntensity: 1.8, storefront: false, flood: 0x1c5238,
  }, // green-lit civic campus
};

const FALLBACK_STYLE: ClassStyle = CLASS_STYLE.slab;

/** Append a core `RoadRibbon` (flat xyz + Uint32 indices) into the merged street buffers. */
function appendRibbon(
  positions: number[],
  colors: number[],
  indices: number[],
  ribbon: RoadRibbon,
  color: THREE.Color,
): void {
  const base = positions.length / 3;
  const p = ribbon.positions;
  for (let i = 0; i < p.length; i += 3) {
    positions.push(p[i]!, p[i + 1]!, p[i + 2]!);
    colors.push(color.r, color.g, color.b);
  }
  const ind = ribbon.indices;
  for (let i = 0; i < ind.length; i += 1) indices.push(base + ind[i]!);
}

/**
 * One shared window MASK (not a colored texture). Each cell's window rectangle is filled with a
 * grayscale "lit rank" in (0,1]; gaps and the reserved roof cell stay 0. The building shader gates
 * lit windows per building by `rank > 1 - windowDensity`, so ONE mask drives everything from a
 * near-blank house to a fully-lit tower — and colors the survivors with the class's window tint.
 * Kept in linear color space so the rank the shader reads is exactly the value written here.
 */
function windowMaskTexture(seedRng: () => number): THREE.CanvasTexture {
  const size = 256;
  const cell = size / TEX_CELLS;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < TEX_CELLS; row += 1) {
    for (let col = 0; col < TEX_CELLS; col += 1) {
      if (row === TEX_CELLS - 1 && col === 0) continue; // reserved dark cell — non-window faces sample here
      if (seedRng() < 0.12) continue; // a few structural gaps even at full density
      // Rank in [0.12, 1]: high ranks survive low densities, so sparse buildings keep a few windows.
      const rank = 0.12 + seedRng() * 0.88;
      const v = Math.round(rank * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const x = col * cell;
      const y = row * cell;
      ctx.fillRect(x + cell * 0.22, y + cell * 0.16, cell * 0.56, cell * 0.68);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

interface BoxWriter {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  grow: number[];
  /** Per-vertex window emissive tint (rgb). */
  winTint: number[];
  /** Per-vertex lit-window share (0..1). */
  winDensity: number[];
  /** Per-vertex lit-window emissive punch. */
  winIntensity: number[];
  /** Per-vertex ground-floor storefront flag (0/1). */
  storefront: number[];
  /** Per-vertex whole-body flood glow (rgb, 0 = off). */
  flood: number[];
  indices: number[];
}

function makeWriter(): BoxWriter {
  return {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    grow: [],
    winTint: [],
    winDensity: [],
    winIntensity: [],
    storefront: [],
    flood: [],
    indices: [],
  };
}

/** Per-building window/flood parameters threaded into the geometry writers. */
interface EmitStyle {
  winTint: THREE.Color;
  winDensity: number;
  winIntensity: number;
  storefront: number;
  flood: THREE.Color;
}

/**
 * Windowed box (no bottom face) rotated by `ry` around its center, with world-scaled window UVs.
 * `banded` walls get the lit-window strip; non-banded pieces (and the roof face) map to the dark
 * roof cell so they read as flat shades.
 */
function pushBuildingBox(
  out: BoxWriter,
  cx: number,
  cz: number,
  w: number,
  d: number,
  y0: number,
  y1: number,
  ry: number,
  shade: THREE.Color,
  growDelay: number,
  banded: boolean,
  style: EmitStyle,
): void {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const rotX = (x: number, z: number) => cx + x * cos + z * sin;
  const rotZ = (x: number, z: number) => cz - x * sin + z * cos;
  const h = y1 - y0;
  const hw = w / 2;
  const hd = d / 2;

  const face = (
    corners: readonly (readonly [number, number, number])[],
    normal: readonly [number, number],
    uWorld: number,
    vWorld: number,
    roof: boolean,
  ) => {
    const base = out.positions.length / 3;
    const nx = normal[0] * cos + normal[1] * sin;
    const nz = -normal[0] * sin + normal[1] * cos;
    const ny = roof ? 1 : 0;
    const lit = banded && !roof;
    const uRepeat = uWorld / WINDOW_W / TEX_CELLS;
    const vRepeat = vWorld / WINDOW_H / TEX_CELLS;
    const store = roof ? 0 : style.storefront;
    for (let i = 0; i < 4; i += 1) {
      const [x, y, z] = corners[i]!;
      out.positions.push(rotX(x, z), y, rotZ(x, z));
      out.normals.push(roof ? 0 : nx, ny, roof ? 0 : nz);
      if (lit) out.uvs.push((i === 1 || i === 2 ? uRepeat : 0) + 0.013, (i >= 2 ? vRepeat : 0) + 0.013);
      else out.uvs.push(ROOF_U, ROOF_V);
      out.colors.push(shade.r, shade.g, shade.b);
      out.grow.push(growDelay);
      out.winTint.push(style.winTint.r, style.winTint.g, style.winTint.b);
      out.winDensity.push(style.winDensity);
      out.winIntensity.push(style.winIntensity);
      out.storefront.push(store);
      out.flood.push(style.flood.r, style.flood.g, style.flood.b);
    }
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  face([[-hw, y0, hd], [hw, y0, hd], [hw, y1, hd], [-hw, y1, hd]], [0, 1], w, h, false); // front (+z)
  face([[hw, y0, -hd], [-hw, y0, -hd], [-hw, y1, -hd], [hw, y1, -hd]], [0, -1], w, h, false); // back
  face([[hw, y0, hd], [hw, y0, -hd], [hw, y1, -hd], [hw, y1, hd]], [1, 0], d, h, false); // right
  face([[-hw, y0, -hd], [-hw, y0, hd], [-hw, y1, hd], [-hw, y1, -hd]], [-1, 0], d, h, false); // left
  face([[-hw, y1, hd], [hw, y1, hd], [hw, y1, -hd], [-hw, y1, -hd]], [0, 0], 1, 1, true); // roof
}

// --- flat massing shapes (gable/cylinder/dome) into a DoubleSide, window-free writer ---

/** Emit one triangle (local coords rotated by `ry` about the piece center) with a dark UV + flat color. */
function emitTri(
  out: BoxWriter,
  cos: number,
  sin: number,
  cx: number,
  cz: number,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  nLocal: readonly [number, number, number],
  shade: THREE.Color,
  grow: number,
  flood: THREE.Color,
): void {
  const base = out.positions.length / 3;
  const nx = nLocal[0] * cos + nLocal[2] * sin;
  const nz = -nLocal[0] * sin + nLocal[2] * cos;
  for (const v of [a, b, c]) {
    out.positions.push(cx + v[0] * cos + v[2] * sin, v[1], cz - v[0] * sin + v[2] * cos);
    out.normals.push(nx, nLocal[1], nz);
    out.uvs.push(ROOF_U, ROOF_V);
    out.colors.push(shade.r, shade.g, shade.b);
    out.grow.push(grow);
    out.winTint.push(0, 0, 0);
    out.winDensity.push(0);
    out.winIntensity.push(0);
    out.storefront.push(0);
    out.flood.push(flood.r, flood.g, flood.b);
  }
  out.indices.push(base, base + 1, base + 2);
}

function emitQuad(
  out: BoxWriter,
  cos: number,
  sin: number,
  cx: number,
  cz: number,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
  nLocal: readonly [number, number, number],
  shade: THREE.Color,
  grow: number,
  flood: THREE.Color,
): void {
  emitTri(out, cos, sin, cx, cz, a, b, c, nLocal, shade, grow, flood);
  emitTri(out, cos, sin, cx, cz, a, c, d, nLocal, shade, grow, flood);
}

/** Triangular-prism gable roof; ridge along local x, base spanning local z. */
function pushGable(
  out: BoxWriter,
  cx: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  y0: number,
  ry: number,
  shade: THREE.Color,
  grow: number,
  flood: THREE.Color,
): void {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const hw = w / 2;
  const hd = d / 2;
  const y1 = y0 + h;
  const A: [number, number, number] = [-hw, y0, -hd];
  const B: [number, number, number] = [-hw, y0, hd];
  const C: [number, number, number] = [-hw, y1, 0];
  const D: [number, number, number] = [hw, y0, -hd];
  const E: [number, number, number] = [hw, y0, hd];
  const F: [number, number, number] = [hw, y1, 0];
  emitTri(out, cos, sin, cx, cz, A, C, B, [-1, 0, 0], shade, grow, flood); // left end
  emitTri(out, cos, sin, cx, cz, D, E, F, [1, 0, 0], shade, grow, flood); // right end
  emitQuad(out, cos, sin, cx, cz, A, D, F, C, [0, hd, -h], shade, grow, flood); // -z slope
  emitQuad(out, cos, sin, cx, cz, B, C, F, E, [0, hd, h], shade, grow, flood); // +z slope
}

/** Low-segment elliptical cylinder with a top cap. */
function pushCylinder(
  out: BoxWriter,
  cx: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  y0: number,
  ry: number,
  shade: THREE.Color,
  grow: number,
  flood: THREE.Color,
): void {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const rx = w / 2;
  const rz = d / 2;
  const y1 = y0 + h;
  const segs = 16;
  for (let i = 0; i < segs; i += 1) {
    const t0 = (i / segs) * Math.PI * 2;
    const t1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(t0);
    const s0 = Math.sin(t0);
    const c1 = Math.cos(t1);
    const s1 = Math.sin(t1);
    const p0b: [number, number, number] = [rx * c0, y0, rz * s0];
    const p1b: [number, number, number] = [rx * c1, y0, rz * s1];
    const p0t: [number, number, number] = [rx * c0, y1, rz * s0];
    const p1t: [number, number, number] = [rx * c1, y1, rz * s1];
    const mc = Math.cos((t0 + t1) / 2);
    const ms = Math.sin((t0 + t1) / 2);
    emitQuad(out, cos, sin, cx, cz, p0b, p1b, p1t, p0t, [mc, 0, ms], shade, grow, flood);
    emitTri(out, cos, sin, cx, cz, [0, y1, 0], p0t, p1t, [0, 1, 0], shade, grow, flood); // top cap
  }
}

/** Low-poly hemisphere dome. */
function pushDome(
  out: BoxWriter,
  cx: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  y0: number,
  ry: number,
  shade: THREE.Color,
  grow: number,
  flood: THREE.Color,
): void {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const rx = w / 2;
  const rz = d / 2;
  const rings = 4;
  const segs = 12;
  const at = (lat: number, lon: number): [number, number, number] => {
    const a = (lat / rings) * (Math.PI / 2);
    const r = Math.cos(a);
    const t = (lon / segs) * Math.PI * 2;
    return [rx * r * Math.cos(t), y0 + h * Math.sin(a), rz * r * Math.sin(t)];
  };
  const nrm = (lat: number, lon: number): [number, number, number] => {
    const a = (lat / rings) * (Math.PI / 2);
    const t = (lon / segs) * Math.PI * 2;
    return [Math.cos(a) * Math.cos(t), Math.sin(a), Math.cos(a) * Math.sin(t)];
  };
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = at(j, i);
      const b = at(j, i + 1);
      const c = at(j + 1, i + 1);
      const dd = at(j + 1, i);
      const n = nrm(j + 0.5, i + 0.5);
      emitQuad(out, cos, sin, cx, cz, a, b, c, dd, n, shade, grow, flood);
    }
  }
}

interface TrafficStream {
  points: readonly (readonly [number, number])[];
  lengths: number[];
  /** Per-point ground height (from `Street.heights` when the network drapes, else the sampled field). */
  heights: number[];
  total: number;
  y: number;
}

function streamFrom(street: Street, sampleHeight: (x: number, z: number) => number): TrafficStream {
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < street.points.length; i += 1) {
    total += Math.hypot(
      street.points[i]![0] - street.points[i - 1]![0],
      street.points[i]![1] - street.points[i - 1]![1],
    );
    lengths.push(total);
  }
  const perPoint = (street as { heights?: number[] }).heights;
  const heights =
    perPoint !== undefined && perPoint.length === street.points.length
      ? perPoint
      : street.points.map((p) => sampleHeight(p[0], p[1]));
  return { points: street.points, lengths, heights, total, y: ROAD_Y + 0.32 };
}

function sampleStream(stream: TrafficStream, distance: number, out: THREE.Vector3): number {
  const d = ((distance % stream.total) + stream.total) % stream.total;
  let i = 1;
  while (i < stream.lengths.length - 1 && stream.lengths[i]! < d) i += 1;
  const t = (d - stream.lengths[i - 1]!) / Math.max(1e-6, stream.lengths[i]! - stream.lengths[i - 1]!);
  const a = stream.points[i - 1]!;
  const b = stream.points[i]!;
  const h = stream.heights[i - 1]! + (stream.heights[i]! - stream.heights[i - 1]!) * t;
  out.set(a[0] + (b[0] - a[0]) * t, stream.y + h, a[1] + (b[1] - a[1]) * t);
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

/** Role → flat tint resolver for non-banded massing pieces. */
function roleColor(
  role: CityPieceRole,
  wall: THREE.Color,
  roof: THREE.Color,
  trim: THREE.Color,
  accent: THREE.Color,
): THREE.Color {
  switch (role) {
    case "roof":
      return roof;
    case "trim":
      return trim;
    case "accent":
      return accent;
    default:
      return wall;
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Seeded hue/saturation/lightness jitter around a class base color, so buildings of one class read
 * as a family (a street of towers) yet no two are the identical box. Writes into `out`.
 */
function jitterColor(
  out: THREE.Color,
  base: number,
  rng: () => number,
  hueJitter: number,
  lightJitter: number,
  lightBias: number,
): THREE.Color {
  out.set(base);
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl);
  out.setHSL(
    (hsl.h + (rng() - 0.5) * hueJitter + 1) % 1,
    clamp01(hsl.s + (rng() - 0.5) * 0.14),
    clamp01(hsl.l * lightBias + (rng() - 0.5) * lightJitter),
  );
  return out;
}

export function buildCityModel(
  city: GeneratedCity,
  palette: CityPalette,
  options: {
    seed: string;
    instant?: boolean;
    heightScale?: number;
    /** Shared terrain field the whole model drapes off. Falls back to the network's `elevationAt`,
     *  then to a flat plane. Streets, sidewalks, junction surfaces, buildings, traffic, glow, ground. */
    sampleHeight?: (x: number, z: number) => number;
    /** Emit circuit dressing (corner kerbs + a checkered start/finish band) around the main loop. */
    trackDressing?: boolean;
    /** Render connected pedestrian bands around paved streets. Default true. */
    sidewalks?: boolean;
    /** Pedestrian band width beyond each carriageway edge. Default 2.2. */
    sidewalkWidth?: number;
    /** Render lane guidance and stop lines. Default true. */
    laneMarkings?: boolean;
    /** Lane-paint ribbon width. Default 0.18. */
    laneMarkingWidth?: number;
    /** Signed lateral marking offset from the authored centerline. Default 0. */
    laneMarkingOffset?: number;
    /** Painted dash length. Reserved for shared marking style controls. */
    laneMarkingDash?: number;
    /** Gap between painted dashes. Reserved for shared marking style controls. */
    laneMarkingGap?: number;
    /** Decorative arterial glow independent of physical lane guidance. Default true. */
    centerlineGlow?: boolean;
    /**
     * Emit placeholder traffic instances. Default false — colored cuboids read as capture artifacts,
     * not vehicles. Enable only when a future path supplies unmistakable scaled vehicle meshes.
     */
    traffic?: boolean;
    /** Extrude building lots. Default true; set false for unobstructed intersection close-ups. */
    buildings?: boolean;
  },
): CityModel {
  const heightScale = options.heightScale ?? 1;
  const group = new THREE.Group();
  const rng = seededStreams(`${options.seed}:render`);
  const streets = city.network.streets;
  // Everything drapes off ONE height field so roads, buildings, and ground agree. Prefer the caller's
  // field, then the network's shared `elevationAt` (once the core contract lands), then a flat plane.
  const networkElevationAt = (city.network as { elevationAt?: (x: number, z: number) => number }).elevationAt;
  const sampleHeight = options.sampleHeight ?? networkElevationAt ?? (() => 0);

  const levelColors = Object.fromEntries(
    Object.entries(palette.streets).map(([level, hex]) => [level, new THREE.Color(hex)]),
  ) as Record<StreetLevel, THREE.Color>;
  const sidewalkColor = new THREE.Color(palette.sidewalk ?? palette.streets.street).lerp(new THREE.Color(0xffffff), 0.22);
  const markingColor = new THREE.Color(palette.marking ?? 0xf5e6c8);

  let radius = 40;
  for (const street of streets) for (const [x, z] of street.points) radius = Math.max(radius, Math.hypot(x, z));

  // --- streets: welded, trimmed intersections (no z-fighting, no floating discs), draped over relief ---
  const sidewalkWidth = options.sidewalks === false ? 0 : Math.max(0, options.sidewalkWidth ?? 2.2);
  const markingWidth = Math.max(0.04, options.laneMarkingWidth ?? 0.18);
  const intersectionStreets: IntersectionStreet[] = streets.map((street) => ({
    path: street.points,
    width: street.width,
    ...(street.level !== "lane" && sidewalkWidth > 0
      ? { sidewalks: { left: sidewalkWidth, right: sidewalkWidth } }
      : {}),
    ...(street.level !== "lane" && options.laneMarkings !== false
      ? {
          markings: {
            lines: [{ offset: options.laneMarkingOffset ?? 0, width: markingWidth }],
            stopLine: true,
          },
        }
      : {}),
  }));
  const trimmed = buildTrimmedIntersections(intersectionStreets, city.network.junctions, sampleHeight, {
    // Compact carriageway-union mouths; curb returns are exterior corner arcs only (see roads.ts).
    curbReturnRadius: 2,
    apronMargin: 0.25,
    filletSegments: 6,
  });
  const markings = buildIntersectionMarkings(trimmed, sampleHeight, {
    mouthClearance: 1.25,
    dashLength: Math.max(0, options.laneMarkingDash ?? 4.8),
    dashGap: Math.max(0, options.laneMarkingGap ?? 4),
  });

  // Recover each ribbon's street level from an interior point of its trimmed sub-path (interior
  // vertices are original street points, so they map straight back to a level).
  const ribbonLevel = (index: number): StreetLevel =>
    streets[trimmed.trimmedStreetIndices[index]!]?.level ?? "street";

  interface LayerArrays {
    pos: number[];
    col: number[];
    idx: number[];
  }
  const newLayer = (): LayerArrays => ({ pos: [], col: [], idx: [] });
  const sidewalkLayer = newLayer();
  const roadLayer = newLayer();
  const junctionLayer = newLayer();
  const markingLayer = newLayer();
  for (const sidewalk of trimmed.sidewalks) {
    appendRibbon(sidewalkLayer.pos, sidewalkLayer.col, sidewalkLayer.idx, sidewalk, sidewalkColor);
  }
  const sidewalkSweepCount = sidewalkLayer.idx.length;
  for (const apron of trimmed.sidewalkAprons) {
    appendRibbon(sidewalkLayer.pos, sidewalkLayer.col, sidewalkLayer.idx, apron, sidewalkColor);
  }
  // Widest levels first so the sweep reveals arterials before local streets.
  const order = trimmed.ribbons
    .map((_, i) => i)
    .sort((a, b) => LEVEL_ORDER.indexOf(ribbonLevel(a)) - LEVEL_ORDER.indexOf(ribbonLevel(b)));
  for (const i of order) {
    appendRibbon(roadLayer.pos, roadLayer.col, roadLayer.idx, trimmed.ribbons[i]!, levelColors[ribbonLevel(i)]);
  }
  // Cul-de-sac turning bulbs: a kept dead end is a deliberate turnaround, so pave it as one —
  // a disc at the dangling terminus in the street's own color — instead of a bare squared stub.
  const pushDisc = (cx: number, cz: number, radius: number, color: THREE.Color): void => {
    const segs = 20;
    const base = roadLayer.pos.length / 3;
    const baseY = ROAD_Y + sampleHeight(cx, cz);
    roadLayer.pos.push(cx, baseY, cz);
    roadLayer.col.push(color.r, color.g, color.b);
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const px = cx + Math.cos(a) * radius;
      const pz = cz + Math.sin(a) * radius;
      roadLayer.pos.push(px, ROAD_Y + sampleHeight(px, pz), pz);
      roadLayer.col.push(color.r, color.g, color.b);
    }
    for (let i = 0; i < segs; i += 1) roadLayer.idx.push(base, base + 1 + i, base + 2 + i);
  };
  for (const s of streets) {
    if (s.bulb === undefined) continue;
    pushDisc(s.bulb[0], s.bulb[1], Math.max(s.width * 0.85, s.width / 2 + 2), levelColors[s.level]);
  }
  // Welded junction surfaces last (they read as one clean crossing patch).
  trimmed.junctions.forEach((surface, index) => {
    const level = city.network.junctions[trimmed.junctionIndices[index]!]?.level ?? "street";
    const color = palette.junction === undefined ? levelColors[level] : new THREE.Color(palette.junction);
    appendRibbon(junctionLayer.pos, junctionLayer.col, junctionLayer.idx, surface, color);
  });
  for (const marking of markings) {
    appendRibbon(markingLayer.pos, markingLayer.col, markingLayer.idx, marking, markingColor);
  }

  const makeLayer = (name: string, arrays: LayerArrays, polygonOffset = 0) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(arrays.pos, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(arrays.col, 3));
    geometry.setIndex(arrays.idx);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      ...(polygonOffset === 0
        ? {}
        : { polygonOffset: true, polygonOffsetFactor: polygonOffset, polygonOffsetUnits: polygonOffset }),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    return { geometry, material, mesh, count: arrays.idx.length };
  };
  const sidewalkMesh = makeLayer("city-sidewalks", sidewalkLayer);
  const roadMesh = makeLayer("city-roads", roadLayer);
  const junctionMesh = makeLayer("city-junctions", junctionLayer, -1);
  const markingMesh = makeLayer("city-markings", markingLayer, -2);
  markingMesh.mesh.renderOrder = 1;

  // --- boulevard/avenue centerline glow, additive, above markings with polygonOffset ---
  const glowPos: number[] = [];
  const glowCol: number[] = [];
  const glowIdx: number[] = [];
  const glowColor = new THREE.Color(palette.glow);
  for (const street of options.centerlineGlow === false ? [] : streets) {
    if (street.level !== "boulevard" && street.level !== "avenue") continue;
    appendRibbon(
      glowPos,
      glowCol,
      glowIdx,
      buildRoadRibbon(street.points, street.level === "boulevard" ? 0.9 : 0.55, sampleHeight, {
        elevation: GROUND_DECAL_LAYERS.glow,
      }),
      glowColor,
    );
  }
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(glowPos, 3));
  glowGeo.setAttribute("color", new THREE.Float32BufferAttribute(glowCol, 3));
  glowGeo.setIndex(glowIdx);
  const glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.name = "city-glow";
  glowMesh.renderOrder = 2;
  group.add(glowMesh);

  // --- circuit dressing: red/white corner kerbs + a checkered start/finish band on the track ---
  let dressingMesh: THREE.Mesh | null = null;
  if (options.trackDressing === true) {
    const loop = streets.find((s) => s.loop) ?? streets[0];
    if (loop !== undefined && loop.points.length >= 6) {
      dressingMesh = buildTrackDressing(loop, sampleHeight);
      if (dressingMesh !== null) group.add(dressingMesh);
    }
  }

  // --- buildings (skippable for unobstructed intersection inspection) ---
  const boxWriter = makeWriter(); // windowed walls + flat boxes
  const shapeWriter = makeWriter(); // gable/cylinder/dome, DoubleSide, window-free
  const baseWall = new THREE.Color(palette.building);
  const shades = rng("shades");
  const heightsRng = rng("heights");
  const scratchShade = new THREE.Color();
  let tallest = 0;
  const showBuildings = options.buildings !== false;

  const lotContent = city.lotContent;
  if (showBuildings && lotContent !== undefined && lotContent.length > 0) {
    // Real massing pieces per lot, colored by the class's family identity (CLASS_STYLE), jittered
    // per building. Banded walls window per the class; roof/trim/accent take their own hues.
    const wall = new THREE.Color();
    const roof = new THREE.Color();
    const trim = new THREE.Color();
    const accent = new THREE.Color();
    const winTint = new THREE.Color();
    const flood = new THREE.Color();
    const noFlood = new THREE.Color(0, 0, 0);
    for (const resolved of lotContent) {
      const [cx, cz] = resolved.center;
      const baseY = sampleHeight(cx, cz); // lot sits on the terrain, all its pieces share the offset
      const lotRot = resolved.rotationY;
      const lc = Math.cos(lotRot);
      const ls = Math.sin(lotRot);
      const dist = Math.hypot(cx, cz) / Math.max(1, radius);
      const delay = dist * 1.5 + heightsRng() * 0.3;
      const style = CLASS_STYLE[resolved.class as AnyCityClass] ?? FALLBACK_STYLE;
      // Far buildings recede gently into the fog; keep enough to still read the class color.
      const distBias = 1 - dist * 0.18;
      // One jitter seed per building drives the whole family shift so all its pieces agree — enough
      // spread that a street of towers reads as many buildings, not a mirrored box.
      jitterColor(wall, style.wall, shades, 0.06, 0.1, distBias);
      jitterColor(roof, style.roof, shades, 0.05, 0.08, distBias);
      jitterColor(trim, style.trim, shades, 0.05, 0.08, distBias);
      jitterColor(accent, style.accent, shades, 0.05, 0.08, distBias);
      jitterColor(winTint, style.windowTint, shades, 0.03, 0.06, 1);
      if (style.flood !== 0) flood.set(style.flood);
      else flood.copy(noFlood);
      const emit: EmitStyle = {
        winTint,
        // Per-building density/intensity wobble so neighboring towers light up differently.
        winDensity: clamp01(style.windowDensity + (shades() - 0.5) * 0.16),
        winIntensity: style.windowIntensity * (0.85 + shades() * 0.3),
        storefront: style.storefront ? 1 : 0,
        flood,
      };
      resolved.pieces.forEach((piece: CityLotPiece, pi) => {
        // Lot-local piece center → world (rotate offset by lot yaw, add to lot center).
        const ox = piece.offset[0];
        const oz = piece.offset[2];
        const wx = cx + ox * lc + oz * ls;
        const wz = cz - ox * ls + oz * lc;
        const y0 = piece.offset[1] * heightScale + baseY;
        const sh = Math.max(0.2, piece.size[1] * heightScale);
        const ry = lotRot + piece.rotationY;
        const g = delay + pi * 0.05;
        const color = piece.banded ? wall : roleColor(piece.role, wall, roof, trim, accent);
        const top = y0 + sh;
        tallest = Math.max(tallest, top);
        switch (piece.shape) {
          case "box":
            pushBuildingBox(boxWriter, wx, wz, piece.size[0], piece.size[2], y0, top, ry, color, g, piece.banded, emit);
            break;
          case "gable":
            pushGable(shapeWriter, wx, wz, piece.size[0], sh, piece.size[2], y0, ry, color, g, flood);
            break;
          case "cylinder":
            pushCylinder(shapeWriter, wx, wz, piece.size[0], sh, piece.size[2], y0, ry, color, g, flood);
            break;
          case "dome":
            pushDome(shapeWriter, wx, wz, piece.size[0], sh, piece.size[2], y0, ry, color, g, flood);
            break;
        }
      });
    }
  } else if (showBuildings) {
    // Fallback (no resolved content, e.g. the hero world): windowed boxes on bare lots. One shared
    // window behavior tinted by the palette's warm window color — the hero scene has no class data.
    const fallbackEmit: EmitStyle = {
      winTint: new THREE.Color(palette.windowWarm).lerp(new THREE.Color(palette.windowCool), 0.4),
      winDensity: 0.5,
      winIntensity: 1.7,
      storefront: 0,
      flood: new THREE.Color(0, 0, 0),
    };
    const frontage = streets.filter((street) => street.level !== "lane");
    const heightRange: Record<StreetLevel, readonly [number, number]> = {
      boulevard: [18, 58],
      avenue: [10, 30],
      street: [5, 15],
      lane: [4, 9],
    };
    for (const lot of city.lots) {
      const level = frontage[lot.road]?.level ?? "street";
      const [minH, maxH] = heightRange[level];
      const centerBias = 1 - Math.min(1, Math.hypot(lot.center[0], lot.center[1]) / Math.max(1, radius)) * 0.55;
      const h = (minH + heightsRng() * (maxH - minH)) * centerBias * heightScale + 3;
      tallest = Math.max(tallest, h);
      const dim = 0.82 + shades() * 0.35;
      scratchShade.copy(baseWall).multiplyScalar(dim);
      const delay = (Math.hypot(lot.center[0], lot.center[1]) / Math.max(1, radius)) * 1.5 + heightsRng() * 0.3;
      const w = lot.footprint.w * 0.92;
      const d = lot.footprint.d * 0.92;
      const baseY = sampleHeight(lot.center[0], lot.center[1]);
      if (h > 26 && heightsRng() < 0.7) {
        const tiers = h > 42 && heightsRng() < 0.5 ? 3 : 2;
        let y = baseY;
        for (let t = 0; t < tiers; t += 1) {
          const frac = t === tiers - 1 ? 1 : 0.45 + heightsRng() * 0.25;
          const topY = t === tiers - 1 ? baseY + h : y + (baseY + h - y) * frac;
          const scale = 1 - t * (0.16 + heightsRng() * 0.12);
          pushBuildingBox(boxWriter, lot.center[0], lot.center[1], w * scale, d * scale, y, topY, lot.rotationY, scratchShade, delay + t * 0.12, true, fallbackEmit);
          y = topY;
        }
      } else {
        pushBuildingBox(boxWriter, lot.center[0], lot.center[1], w, d, baseY, baseY + h, lot.rotationY, scratchShade, delay, true, fallbackEmit);
      }
    }
  }

  const windows = windowMaskTexture(rng("windows"));
  const growUniform = { value: options.instant === true ? 99 : -0.35 };
  // Vertex prelude: grow-in animation + forward the per-building window/flood attrs. `vY` carries the
  // grown local height so the fragment shader can light only a shop's ground floor as a storefront.
  const growVertex = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uGrow = growUniform;
    shader.vertexShader = `attribute float aGrow;
      attribute vec3 aWinTint;
      attribute float aWinDensity;
      attribute float aWinIntensity;
      attribute float aStorefront;
      attribute vec3 aFlood;
      uniform float uGrow;
      varying float vGrown;
      varying float vY;
      varying vec3 vWinTint;
      varying float vWinDensity;
      varying float vWinIntensity;
      varying float vStorefront;
      varying vec3 vFlood;
      ${shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      float growT = clamp((uGrow - aGrow) / 0.8, 0.0, 1.0);
      float grown = 1.0 - pow(1.0 - growT, 3.0);
      vGrown = grown;
      transformed.y *= grown;
      vY = transformed.y;
      vWinTint = aWinTint;
      vWinDensity = aWinDensity;
      vWinIntensity = aWinIntensity;
      vStorefront = aStorefront;
      vFlood = aFlood;`,
      )}`;
  };

  const buildingMesh = buildMeshFromWriter(boxWriter);
  const buildingMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.08,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: windows,
    emissiveIntensity: 1.0,
  });
  buildingMat.onBeforeCompile = (shader) => {
    growVertex(shader);
    // The emissive map is a grayscale "lit rank"; gate windows per building by density, color the
    // survivors with the class window tint, and add a ground-floor storefront band + landmark flood.
    shader.fragmentShader = `varying float vGrown;
      varying float vY;
      varying vec3 vWinTint;
      varying float vWinDensity;
      varying float vWinIntensity;
      varying float vStorefront;
      varying vec3 vFlood;
      ${shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
      float winRank = totalEmissiveRadiance.r;
      float lit = step(0.001, winRank) * step(1.0 - vWinDensity, winRank);
      vec3 win = lit * vWinTint * vWinIntensity;
      float band = vStorefront * (1.0 - smoothstep(2.5, 7.0, vY));
      win += band * vWinTint * 2.4;
      totalEmissiveRadiance = (win + vFlood) * vGrown * vGrown;`,
      )}`;
  };
  buildingMesh.material = buildingMat;
  group.add(buildingMesh);

  const shapeMesh = buildMeshFromWriter(shapeWriter);
  const shapeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  shapeMat.onBeforeCompile = (shader) => {
    growVertex(shader);
    // Non-windowed shapes (gable/cylinder/dome) still glow when they belong to a flood-lit landmark.
    shader.fragmentShader = `varying float vGrown;
      varying vec3 vFlood;
      ${shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
      totalEmissiveRadiance += vFlood * vGrown * vGrown;`,
      )}`;
  };
  shapeMesh.material = shapeMat;
  group.add(shapeMesh);

  // --- traffic: only when explicitly requested. Default off — BoxGeometry stand-ins look like
  // capture artifacts, not vehicles, and fail visual review for intersection evidence.
  const showTraffic = options.traffic === true;
  const streams = showTraffic
    ? streets
        .filter((street) => street.points.length >= 2 && street.level !== "lane")
        .map((street) => streamFrom(street, sampleHeight))
    : [];
  const totalLength = streams.reduce((sum, stream) => sum + stream.total, 0);
  const vehicleCount = showTraffic ? Math.min(220, Math.max(24, Math.floor(totalLength / 16))) : 0;
  const vehicles: { stream: TrafficStream; offset: number; speed: number }[] = [];
  const traffic = rng("traffic");
  const colorA = new THREE.Color(palette.trafficA);
  const colorB = new THREE.Color(palette.trafficB);
  const vehicleGeo = new THREE.BoxGeometry(1.25, 0.5, 2.8);
  const vehicleMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const vehicleMesh = new THREE.InstancedMesh(vehicleGeo, vehicleMat, Math.max(1, vehicleCount));
  if (showTraffic) {
    for (let i = 0; i < vehicleCount && streams.length > 0; i += 1) {
      const pickAt = traffic() * totalLength;
      let acc = 0;
      let stream = streams[0]!;
      for (const candidate of streams) {
        acc += candidate.total;
        if (pickAt <= acc) {
          stream = candidate;
          break;
        }
      }
      const forward = traffic() < 0.5;
      vehicles.push({ stream, offset: traffic() * stream.total, speed: (forward ? 1 : -1) * (9 + traffic() * 14) });
      vehicleMesh.setColorAt(i, forward ? colorA : colorB);
    }
    vehicleMesh.count = vehicles.length;
    vehicleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (vehicleMesh.instanceColor !== null) vehicleMesh.instanceColor.needsUpdate = true;
    vehicleMesh.name = "city-traffic";
    vehicleMesh.frustumCulled = false;
    group.add(vehicleMesh);
  } else {
    vehicleMesh.count = 0;
  }

  // --- accent lights on the two busiest junctions ---
  const junctions = [...city.network.junctions].sort((a, b) => b.arms.length - a.arms.length);
  const lightColors = [palette.lightA, palette.lightB];
  junctions.slice(0, 2).forEach((junction, i) => {
    const light = new THREE.PointLight(lightColors[i], 8000, 260, 2);
    light.position.set(junction.x, 26 + sampleHeight(junction.x, junction.z), junction.z);
    group.add(light);
  });

  const roadCount = roadMesh.count;
  const scratch = new THREE.Vector3();
  const scratchRotation = new THREE.Quaternion();
  const scratchMatrix = new THREE.Matrix4();
  const vehicleScale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let settledAt = Number.POSITIVE_INFINITY;

  const update = (dt: number, elapsed: number) => {
    const reveal = cityRevealState(elapsed, options.instant === true);
    const revealedRoad = Math.min(Math.ceil((roadCount / 6) * reveal.ribbonProgress) * 6, roadCount);
    const revealedSidewalk = Math.min(Math.ceil((sidewalkSweepCount / 6) * reveal.ribbonProgress) * 6, sidewalkSweepCount);
    roadMesh.geometry.setDrawRange(0, revealedRoad);
    sidewalkMesh.geometry.setDrawRange(0, reveal.junctionsVisible ? sidewalkMesh.count : revealedSidewalk);
    junctionMesh.mesh.visible = reveal.junctionsVisible;
    markingMesh.mesh.visible = reveal.junctionsVisible;
    glowMesh.visible = reveal.junctionsVisible;
    if (showTraffic) vehicleMesh.visible = reveal.junctionsVisible;
    if (options.instant !== true) growUniform.value = elapsed - BUILD_SWEEP_SECONDS * 0.55;
    glowMat.opacity = reveal.dressingOpacity * (0.34 + Math.sin(elapsed * 1.7) * 0.07);
    if (showTraffic) {
      vehicleMat.opacity = reveal.dressingOpacity * 0.9;
      for (let i = 0; i < vehicles.length; i += 1) {
        const vehicle = vehicles[i]!;
        vehicle.offset += vehicle.speed * dt;
        const yaw = sampleStream(vehicle.stream, vehicle.offset, scratch) + (vehicle.speed < 0 ? Math.PI : 0);
        scratchRotation.setFromAxisAngle(up, yaw);
        scratchMatrix.compose(scratch, scratchRotation, vehicleScale);
        vehicleMesh.setMatrixAt(i, scratchMatrix);
      }
      vehicleMesh.instanceMatrix.needsUpdate = true;
    }
    if (settledAt === Number.POSITIVE_INFINITY && growUniform.value > 2.6) settledAt = elapsed;
  };

  return {
    group,
    stats: {
      streets: city.network.streets.length,
      lots: lotContent !== undefined ? lotContent.length : city.lots.length,
      loops: city.network.loops,
      junctions: city.network.junctions.length,
    },
    radius,
    settled: () => options.instant === true || settledAt !== Number.POSITIVE_INFINITY,
    update,
    dispose() {
      group.parent?.remove(group);
      for (const layer of [sidewalkMesh, roadMesh, junctionMesh, markingMesh]) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
      glowGeo.dispose();
      buildingMesh.geometry.dispose();
      shapeMesh.geometry.dispose();
      vehicleGeo.dispose();
      if (dressingMesh !== null) {
        dressingMesh.geometry.dispose();
        (dressingMesh.material as THREE.Material).dispose();
      }
      windows.dispose();
      glowMat.dispose();
      buildingMat.dispose();
      shapeMat.dispose();
      vehicleMat.dispose();
    },
  };
}

/** Build an indexed BufferGeometry from a writer's flat arrays. */
function buildMeshFromWriter(writer: BoxWriter): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(writer.positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(writer.normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(writer.uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(writer.colors, 3));
  geo.setAttribute("aGrow", new THREE.Float32BufferAttribute(writer.grow, 1));
  geo.setAttribute("aWinTint", new THREE.Float32BufferAttribute(writer.winTint, 3));
  geo.setAttribute("aWinDensity", new THREE.Float32BufferAttribute(writer.winDensity, 1));
  geo.setAttribute("aWinIntensity", new THREE.Float32BufferAttribute(writer.winIntensity, 1));
  geo.setAttribute("aStorefront", new THREE.Float32BufferAttribute(writer.storefront, 1));
  geo.setAttribute("aFlood", new THREE.Float32BufferAttribute(writer.flood, 3));
  geo.setIndex(writer.indices);
  return new THREE.Mesh(geo);
}

/**
 * A radially-segmented disc geometry laid in the XZ plane, its vertices displaced in Y by
 * `sampleHeight` so the ground rolls with the terrain field. `y` carries the two coplanar layers
 * (dark disc below, grid above) apart without a per-mesh offset that a slope could invert.
 */
function displacedDisc(radius: number, rings: number, segments: number, sampleHeight: (x: number, z: number) => number, y: number): THREE.BufferGeometry {
  const pos: number[] = [0, sampleHeight(0, 0) + y, 0];
  for (let r = 1; r <= rings; r += 1) {
    const rad = (radius * r) / rings;
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      pos.push(x, sampleHeight(x, z) + y, z);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < segments; s += 1) idx.push(0, 1 + ((s + 1) % segments), 1 + s); // inner fan, +Y wound
  for (let r = 1; r < rings; r += 1) {
    const base = 1 + (r - 1) * segments;
    const next = 1 + r * segments;
    for (let s = 0; s < segments; s += 1) {
      const a = base + s;
      const b = base + ((s + 1) % segments);
      const c = next + s;
      const d = next + ((s + 1) % segments);
      idx.push(a, d, c, a, b, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Faded emerald grid ground shared by the hero and playground worlds; drapes over `sampleHeight` when given. */
export function buildGround(radius: number, gridColor: number, sampleHeight?: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group();
  const rolling = sampleHeight !== undefined;
  // The disc sits WELL below the draped road decals: it is sampled coarsely, so at real relief its flat
  // triangles would otherwise poke up through the finely-draped ribbons and z-fight them. A clear gap
  // (roads live at ~+0.06) keeps the opaque base always under the road, no depth fighting at grazing angles.
  const discGeo = rolling
    ? displacedDisc(radius, 96, 120, sampleHeight, -0.45)
    : new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(
    discGeo,
    new THREE.MeshStandardMaterial({ color: 0x070b13, roughness: 1, metalness: 0, side: rolling ? THREE.DoubleSide : THREE.FrontSide }),
  );
  if (!rolling) disc.position.y = -0.02;
  group.add(disc);

  const gridGeo = rolling
    ? displacedDisc(radius, 96, 120, sampleHeight, 0.02)
    : new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2);
  const grid = new THREE.Mesh(
    gridGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: rolling ? THREE.DoubleSide : THREE.FrontSide,
      uniforms: {
        uColor: { value: new THREE.Color(gridColor) },
        uRadius: { value: radius },
      },
      vertexShader: `varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor;
        uniform float uRadius;
        varying vec3 vPos;
        void main() {
          vec2 cell = vPos.xz / 14.0;
          vec2 g = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float fade = 1.0 - smoothstep(0.25, 1.0, length(vPos.xz) / uRadius);
          gl_FragColor = vec4(uColor, line * fade * 0.33);
        }`,
    }),
  );
  if (!rolling) grid.position.y = 0.01;
  group.add(grid);
  return group;
}

// --- circuit dressing + shared terrain field ------------------------------------------------------

/** One detected corner along a closed track loop: its apex point, fitted radius, and turn direction. */
export interface TrackCorner {
  /** Index of the apex (tightest) point in the loop's `points` array. */
  apexIndex: number;
  /** First/last point index of the high-curvature run. */
  startIndex: number;
  endIndex: number;
  /** Fitted apex radius in world units (≈ meters). */
  radius: number;
  apex: readonly [number, number];
  /** +1 left-hand corner, -1 right-hand. */
  turnSign: number;
}

/**
 * Detect corners along a closed loop centerline by fitting a circumradius over each sliding point
 * triple and grouping consecutive high-curvature (radius &lt; `maxRadius`) runs into one corner.
 * Deterministic, bounded by the point count. `points` may be the closed street points (first === last);
 * indices returned are into that array's unique-point prefix. Corners come back in travel order.
 */
export function analyzeTrackCorners(
  points: readonly (readonly [number, number])[],
  options: { maxRadius?: number; mergeGap?: number } = {},
): TrackCorner[] {
  const maxRadius = options.maxRadius ?? 130;
  const mergeGap = options.mergeGap ?? 2;
  const isClosed =
    points.length > 2 &&
    Math.hypot(points[0]![0] - points[points.length - 1]![0], points[0]![1] - points[points.length - 1]![1]) < 1e-6;
  const pts = isClosed ? points.slice(0, -1) : points.slice();
  const n = pts.length;
  if (n < 6) return [];
  const radius = new Float64Array(n);
  const sign = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const lc = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const area = Math.abs(cross) / 2;
    radius[i] = area < 1e-6 ? Infinity : (la * lb * lc) / (4 * area);
    sign[i] = Math.sign(cross);
  }
  // Effective corner radius from the whole run: arc length / total heading change (R = L / Δθ) reads
  // as the radius you'd actually drive, unlike a single filleted-apex triple whose circumradius spikes.
  const turnAt = (j: number): number => {
    const a = pts[(j - 1 + n) % n]!;
    const b = pts[j]!;
    const c = pts[(j + 1) % n]!;
    const ux = b[0] - a[0];
    const uz = b[1] - a[1];
    const vx = c[0] - b[0];
    const vz = c[1] - b[1];
    const lu = Math.hypot(ux, uz);
    const lv = Math.hypot(vx, vz);
    if (lu < 1e-6 || lv < 1e-6) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv))));
  };
  const corner = Array.from({ length: n }, (_, i) => radius[i]! < maxRadius);
  // Group linearly (index 0 sits on the straightest edge — the start/finish — so no run wraps it),
  // tolerating up to `mergeGap` shallow samples inside one corner.
  const corners: TrackCorner[] = [];
  let i = 0;
  while (i < n) {
    if (!corner[i]) {
      i += 1;
      continue;
    }
    let last = i;
    let gap = 0;
    let k = i;
    while (k < n) {
      if (corner[k]) {
        last = k;
        gap = 0;
      } else if (++gap > mergeGap) {
        break;
      }
      k += 1;
    }
    let apexIndex = i;
    for (let j = i; j <= last; j += 1) if (radius[j]! < radius[apexIndex]!) apexIndex = j;
    let arc = 0;
    let turn = 0;
    for (let j = i; j <= last; j += 1) {
      const b = pts[j]!;
      const c = pts[(j + 1) % n]!;
      arc += Math.hypot(c[0] - b[0], c[1] - b[1]);
      turn += turnAt(j);
    }
    const fitted = turn > 1e-2 ? Math.min(400, arc / turn) : radius[apexIndex]!;
    corners.push({
      apexIndex,
      startIndex: i,
      endIndex: last,
      radius: Math.max(8, Math.round(fitted)),
      apex: [pts[apexIndex]![0], pts[apexIndex]![1]],
      turnSign: sign[apexIndex]! || 1,
    });
    i = last + 1;
  }
  return corners;
}

/**
 * A smooth, deterministic multi-octave terrain field the playground drapes off when the street network
 * does not (yet) publish a shared `elevationAt`. `amplitude` is the peak height in world units and
 * `wavelength` the broad hump spacing; both are chosen by the caller from the elevation dial + mode.
 */
export function makeElevationField(seed: string, amplitude: number, wavelength: number): (x: number, z: number) => number {
  if (amplitude <= 0 || wavelength <= 0) return () => 0;
  const s = seededStreams(`${seed}:elevation`)("field");
  const k1 = (Math.PI * 2) / (wavelength * (0.9 + s() * 0.4));
  const k2 = (Math.PI * 2) / (wavelength * (0.9 + s() * 0.4));
  const k3 = (Math.PI * 2) / (wavelength * (1.6 + s() * 0.8));
  const p1 = s() * Math.PI * 2;
  const p2 = s() * Math.PI * 2;
  const p3 = s() * Math.PI * 2;
  const p4 = s() * Math.PI * 2;
  const ang = s() * Math.PI * 2;
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  return (x, z) => {
    const broad = Math.sin(x * k1 + p1) * Math.cos(z * k2 + p2);
    const ridge = Math.sin((x * dx + z * dz) * k3 + p3);
    const fine = Math.sin(x * k2 * 1.7 + p4) * Math.sin(z * k1 * 1.7 + p3) * 0.5;
    return amplitude * (0.55 * broad + 0.4 * ridge + 0.15 * fine);
  };
}

const KERB_RED = new THREE.Color(0xd23a34);
const KERB_WHITE = new THREE.Color(0xe8e8ea);
const CHECK_DARK = new THREE.Color(0x101015);
const CHECK_LIGHT = new THREE.Color(0xe8e8ea);

/**
 * Build the playground-local circuit dressing for a loop street: alternating red/white kerb strips
 * hugging the OUTER edge of every detected corner, plus a checkered start/finish band laid across the
 * track at `points[0]`. Pure vertex-color geometry draped over `sampleHeight`, subtle enough to keep
 * the neon-night read. Returns null if the loop has no corners worth dressing.
 */
function buildTrackDressing(loop: Street, sampleHeight: (x: number, z: number) => number): THREE.Mesh | null {
  const pts = loop.points;
  const closed =
    pts.length > 2 && Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1]) < 1e-6;
  const uniq = closed ? pts.slice(0, -1) : pts.slice();
  const n = uniq.length;
  if (n < 6) return null;
  const half = loop.width / 2;
  const kerbW = 1.15;
  const y = ROAD_Y + 0.04;

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const quad = (
    ax: number, az: number, bx: number, bz: number, cx: number, cz: number, ex: number, ez: number,
    color: THREE.Color,
  ): void => {
    const base = pos.length / 3;
    const push = (x: number, z: number) => {
      pos.push(x, sampleHeight(x, z) + y, z);
      col.push(color.r, color.g, color.b);
    };
    push(ax, az); push(bx, bz); push(cx, cz); push(ex, ez);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const normalAtIdx = (i: number): [number, number] => {
    const p = uniq[(i - 1 + n) % n]!;
    const q = uniq[(i + 1) % n]!;
    let tx = q[0] - p[0];
    let tz = q[1] - p[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    return [-tz, tx]; // left normal
  };

  // Kerbs on the outer edge of every real corner (tighter threshold than labels — only true corners).
  const corners = analyzeTrackCorners(pts, { maxRadius: 95 });
  let kerbSeg = 0;
  for (const c of corners) {
    for (let i = c.startIndex; i < c.endIndex; i += 1) {
      const a = uniq[i]!;
      const b = uniq[(i + 1) % n]!;
      const [nax, naz] = normalAtIdx(i);
      const [nbx, nbz] = normalAtIdx((i + 1) % n);
      // Outer side = away from the turn centre (opposite the left normal for a left-hand corner).
      const outer = -c.turnSign;
      const a0x = a[0] + nax * outer * half;
      const a0z = a[1] + naz * outer * half;
      const a1x = a[0] + nax * outer * (half + kerbW);
      const a1z = a[1] + naz * outer * (half + kerbW);
      const b0x = b[0] + nbx * outer * half;
      const b0z = b[1] + nbz * outer * half;
      const b1x = b[0] + nbx * outer * (half + kerbW);
      const b1z = b[1] + nbz * outer * (half + kerbW);
      quad(a0x, a0z, a1x, a1z, b1x, b1z, b0x, b0z, kerbSeg % 2 === 0 ? KERB_RED : KERB_WHITE);
      kerbSeg += 1;
    }
  }

  // Checkered start/finish band across the track at points[0].
  const s0 = uniq[0]!;
  const [snx, snz] = normalAtIdx(0);
  let tx = uniq[1]![0] - uniq[n - 1]![0];
  let tz = uniq[1]![1] - uniq[n - 1]![1];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  const cols = 10;
  const rows = 2;
  const depth = 5;
  for (let r = 0; r < rows; r += 1) {
    for (let cI = 0; cI < cols; cI += 1) {
      const u0 = -half + (cI / cols) * 2 * half;
      const u1 = -half + ((cI + 1) / cols) * 2 * half;
      const v0 = -depth / 2 + (r / rows) * depth;
      const v1 = -depth / 2 + ((r + 1) / rows) * depth;
      const color = (cI + r) % 2 === 0 ? CHECK_DARK : CHECK_LIGHT;
      const px = (u: number, v: number): [number, number] => [s0[0] + snx * u + tx * v, s0[1] + snz * u + tz * v];
      const [aX, aZ] = px(u0, v0);
      const [bX, bZ] = px(u1, v0);
      const [cX, cZ] = px(u1, v1);
      const [dX, dZ] = px(u0, v1);
      quad(aX, aZ, bX, bZ, cX, cZ, dX, dZ, color);
    }
  }

  if (idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  return mesh;
}
