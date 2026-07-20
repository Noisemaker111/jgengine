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
  buildTrimmedIntersections,
  GROUND_DECAL_LAYERS,
  trimBandAtJunctions,
  trimPathAtJunctions,
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

/**
 * Drop micro-steps and direction reversals from a polyline. Offset bands (sidewalks) hook back on
 * themselves where a junction cut lands inside an offset arc; ribboning the fold emits crisscross
 * sliver quads that read as z-fighting. Cheap two-pass cleanup, order-preserving.
 */
function sanitizePolyline(points: readonly (readonly [number, number])[]): (readonly [number, number])[] {
  const spaced: (readonly [number, number])[] = [];
  for (const p of points) {
    const prev = spaced[spaced.length - 1];
    if (prev !== undefined && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 0.35) continue;
    spaced.push(p);
  }
  const out: (readonly [number, number])[] = [];
  for (const p of spaced) {
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const ux = b[0] - a[0];
      const uz = b[1] - a[1];
      const vx = p[0] - b[0];
      const vz = p[1] - b[1];
      // Reversal: the next step heads back the way we came — the fold's middle vertex goes.
      if (ux * vx + uz * vz < -0.2 * Math.hypot(ux, uz) * Math.hypot(vx, vz)) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

/** Street ribbon strip along a polyline; used for the additive glow + sidewalk bands. */
function pushRibbon(
  positions: number[],
  colors: number[],
  indices: number[],
  rawPoints: readonly (readonly [number, number])[],
  width: number,
  y: number,
  color: THREE.Color,
  sampleHeight?: (x: number, z: number) => number,
): void {
  const sanitized = sanitizePolyline(rawPoints);
  if (sanitized.length < 2) return;
  // Subdivide long segments so the ribbon DRAPES the height field like buildRoadRibbon does — a
  // 60 m straight band as one quad knifes through rolling terrain and every draped surface on it.
  const MAX_STEP = 4;
  const points: (readonly [number, number])[] = [sanitized[0]!];
  for (let i = 1; i < sanitized.length; i += 1) {
    const a = sanitized[i - 1]!;
    const b = sanitized[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = sampleHeight !== undefined ? Math.ceil(len / MAX_STEP) : 1;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (points.length < 2) return;
  const base = positions.length / 3;
  const half = width / 2;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const px = points[i]![0];
    const pz = points[i]![1];
    const lx = px - dz * half;
    const lz = pz + dx * half;
    const rx = px + dz * half;
    const rz = pz - dx * half;
    const ly = sampleHeight ? sampleHeight(lx, lz) + y : y;
    const ry = sampleHeight ? sampleHeight(rx, rz) + y : y;
    positions.push(lx, ly, lz, rx, ry, rz);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = base + i * 2;
    // Wound so the face normal points +y (visible from above).
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}

/**
 * Subdivide a junction surface's triangles until no edge exceeds `maxEdge`, re-draping every new
 * vertex on the shared height field. The core surface drapes only its boundary + center, so on
 * rolling terrain its big fan triangles sag up to ~20 cm away from the finely-draped ribbons
 * crossing near them — a genuine interpenetration no polygonOffset can hide. Draping the interior
 * to the same resolution as the ribbons (4 m steps) removes it.
 */
function drapeSurface(
  surface: RoadRibbon,
  sampleHeight: (x: number, z: number) => number,
  lift: number,
  maxEdge = 5,
): RoadRibbon {
  const src = surface.positions;
  const ind = surface.indices;
  // Boundary edges (used by exactly one triangle) must stay STRAIGHT: they are bitwise-welded to
  // the ribbons' terminal cross-sections, and re-draping them would crack the seam. Their split
  // midpoints interpolate linearly; only interior edges re-drape onto the height field.
  const edgeUse = new Map<string, number>();
  const ekey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let i = 0; i < ind.length; i += 3) {
    for (const [a, b] of [
      [ind[i]!, ind[i + 1]!],
      [ind[i + 1]!, ind[i + 2]!],
      [ind[i + 2]!, ind[i]!],
    ] as const) {
      const k = ekey(a, b);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }
  interface Tri {
    v: [number, number, number, number, number, number, number, number, number];
    /** Per-edge boundary flag: [v0v1, v1v2, v2v0]. */
    b: [boolean, boolean, boolean];
  }
  const queue: Tri[] = [];
  for (let i = 0; i < ind.length; i += 3) {
    const ia = ind[i]!;
    const ib = ind[i + 1]!;
    const ic = ind[i + 2]!;
    queue.push({
      v: [
        src[ia * 3]!, src[ia * 3 + 1]!, src[ia * 3 + 2]!,
        src[ib * 3]!, src[ib * 3 + 1]!, src[ib * 3 + 2]!,
        src[ic * 3]!, src[ic * 3 + 1]!, src[ic * 3 + 2]!,
      ],
      b: [edgeUse.get(ekey(ia, ib)) === 1, edgeUse.get(ekey(ib, ic)) === 1, edgeUse.get(ekey(ic, ia)) === 1],
    });
  }
  const out: number[] = [];
  const maxEdge2 = maxEdge * maxEdge;
  let guard = 0;
  while (queue.length > 0 && guard < 20000) {
    guard += 1;
    const { v, b } = queue.pop()!;
    const e = [
      (v[0] - v[3]) ** 2 + (v[2] - v[5]) ** 2,
      (v[3] - v[6]) ** 2 + (v[5] - v[8]) ** 2,
      (v[6] - v[0]) ** 2 + (v[8] - v[2]) ** 2,
    ];
    const longest = e[0]! >= e[1]! && e[0]! >= e[2]! ? 0 : e[1]! >= e[2]! ? 1 : 2;
    if (e[longest]! <= maxEdge2) {
      out.push(...v);
      continue;
    }
    const i0 = longest * 3;
    const i1 = ((longest + 1) % 3) * 3;
    const i2 = ((longest + 2) % 3) * 3;
    const onBoundary = b[longest]!;
    const mx = (v[i0]! + v[i1]!) / 2;
    const mz = (v[i0 + 2]! + v[i1 + 2]!) / 2;
    const my = onBoundary ? (v[i0 + 1]! + v[i1 + 1]!) / 2 : sampleHeight(mx, mz) + lift;
    const bNext = b[(longest + 1) % 3]!;
    const bPrev = b[(longest + 2) % 3]!;
    queue.push(
      { v: [v[i0]!, v[i0 + 1]!, v[i0 + 2]!, mx, my, mz, v[i2]!, v[i2 + 1]!, v[i2 + 2]!], b: [onBoundary, false, bPrev] },
      { v: [mx, my, mz, v[i1]!, v[i1 + 1]!, v[i1 + 2]!, v[i2]!, v[i2 + 1]!, v[i2 + 2]!], b: [onBoundary, bNext, false] },
    );
  }
  while (queue.length > 0) out.push(...queue.pop()!.v); // guard tripped — emit unsplit remainder
  const positions = new Float32Array(out);
  const indices = new Uint32Array(out.length / 3);
  for (let i = 0; i < indices.length; i += 1) indices[i] = i;
  return { positions, indices };
}

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
  return { points: street.points, lengths, heights, total, y: ROAD_Y + 0.5 };
}

function sampleStream(stream: TrafficStream, distance: number, out: THREE.Vector3): void {
  const d = ((distance % stream.total) + stream.total) % stream.total;
  let i = 1;
  while (i < stream.lengths.length - 1 && stream.lengths[i]! < d) i += 1;
  const t = (d - stream.lengths[i - 1]!) / Math.max(1e-6, stream.lengths[i]! - stream.lengths[i - 1]!);
  const a = stream.points[i - 1]!;
  const b = stream.points[i]!;
  const h = stream.heights[i - 1]! + (stream.heights[i]! - stream.heights[i - 1]!) * t;
  out.set(a[0] + (b[0] - a[0]) * t, stream.y + h, a[1] + (b[1] - a[1]) * t);
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
  const junctionColor = new THREE.Color(palette.junction ?? palette.streets.boulevard);
  const sidewalkColor = new THREE.Color(palette.sidewalk ?? palette.streets.street).lerp(new THREE.Color(0xffffff), 0.22);

  let radius = 40;
  for (const street of streets) for (const [x, z] of street.points) radius = Math.max(radius, Math.hypot(x, z));

  // --- streets: welded, trimmed intersections (no z-fighting, no floating discs), draped over relief ---
  const intersectionStreets: IntersectionStreet[] = streets.map((s) => ({ path: s.points, width: s.width }));
  const trimmed = buildTrimmedIntersections(intersectionStreets, city.network.junctions, sampleHeight);

  // Recover each ribbon's street level from an interior point of its trimmed sub-path (interior
  // vertices are original street points, so they map straight back to a level).
  const pointLevel = new Map<string, StreetLevel>();
  const key = (x: number, z: number) => `${x},${z}`;
  for (const s of streets) for (const [x, z] of s.points) if (!pointLevel.has(key(x, z))) pointLevel.set(key(x, z), s.level);
  const ribbonLevel = (path: readonly (readonly [number, number])[]): StreetLevel => {
    for (let i = 1; i < path.length - 1; i += 1) {
      const l = pointLevel.get(key(path[i]![0], path[i]![1]));
      if (l !== undefined) return l;
    }
    for (const [x, z] of path) {
      const l = pointLevel.get(key(x, z));
      if (l !== undefined) return l;
    }
    return "street";
  };

  // Coplanar street surfaces separated by polygonOffset DEPTH PRIORITY instead of shared-buffer
  // luck: sidewalks at the base, then road ribbons and junction patches each split PER HIERARCHY
  // LEVEL (lane < street < avenue < boulevard), junctions above ribbons. Every residual coplanar
  // overlap — curved corners, a clamped short ribbon inside a crossing, two junction aprons
  // touching, weld epsilon — resolves to the wider road deterministically instead of z-fighting.
  interface LayerArrays {
    pos: number[];
    col: number[];
    idx: number[];
  }
  const newArrays = (): LayerArrays => ({ pos: [], col: [], idx: [] });
  const sidewalkArrays = newArrays();
  const streetArrays: Record<StreetLevel, LayerArrays> = {
    lane: newArrays(),
    street: newArrays(),
    avenue: newArrays(),
    boulevard: newArrays(),
  };
  const junctionArrays: Record<StreetLevel, LayerArrays> = {
    lane: newArrays(),
    street: newArrays(),
    avenue: newArrays(),
    boulevard: newArrays(),
  };
  // Widest levels first so the sweep reveals arterials before local streets.
  const order = trimmed.ribbons
    .map((_, i) => i)
    .sort((a, b) => LEVEL_ORDER.indexOf(ribbonLevel(trimmed.trimmed[a]!.path)) - LEVEL_ORDER.indexOf(ribbonLevel(trimmed.trimmed[b]!.path)));
  for (const i of order) {
    const level = ribbonLevel(trimmed.trimmed[i]!.path);
    const layer = streetArrays[level];
    appendRibbon(layer.pos, layer.col, layer.idx, trimmed.ribbons[i]!, levelColors[level]);
  }
  // Sidewalk bands flanking the arterials, a touch lighter — clipped out of every junction apron so
  // they end at the crossing instead of sailing through it, and out of the street's own cul-de-sac
  // bulb so they don't plough across the turning circle.
  const splitBandOutsideDisc = (
    band: readonly (readonly [number, number])[],
    center: readonly [number, number],
    clearance: number,
  ): (readonly [number, number])[][] => {
    const runs: (readonly [number, number])[][] = [];
    let current: (readonly [number, number])[] = [];
    for (const p of band) {
      if (Math.hypot(p[0] - center[0], p[1] - center[1]) > clearance) {
        current.push(p);
      } else if (current.length > 0) {
        if (current.length >= 2) runs.push(current);
        current = [];
      }
    }
    if (current.length >= 2) runs.push(current);
    return runs;
  };
  const bandLength = (pts: readonly (readonly [number, number])[]): number => {
    let sum = 0;
    for (let i = 0; i + 1 < pts.length; i += 1) sum += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
    return sum;
  };
  for (const s of streets) {
    if (s.level === "lane" || s.sidewalks === undefined) continue;
    for (const band of [s.sidewalks.left, s.sidewalks.right]) {
      for (const sub of trimBandAtJunctions(band, 2.2, city.network.junctions)) {
        const pieces = s.bulb !== undefined ? splitBandOutsideDisc(sub, s.bulb, s.width * 0.95 + 1.4) : [sub];
        for (const piece of pieces) {
          // A leftover stub shorter than a stride renders as a crumpled sliver fan — drop it.
          if (bandLength(piece) < 3) continue;
          pushRibbon(sidewalkArrays.pos, sidewalkArrays.col, sidewalkArrays.idx, piece, 2.2, ROAD_Y, sidewalkColor, sampleHeight);
        }
      }
    }
  }
  // Welded junction surfaces, colored like the crossing's widest street so the patch reads as road
  // surface, not a foreign blob. A caller-supplied palette.junction still overrides.
  const scratchJunction = new THREE.Color();
  trimmed.junctions.forEach((surface, i) => {
    const level = city.network.junctions[trimmed.junctionIndices[i]!]?.level ?? "street";
    scratchJunction.copy(palette.junction !== undefined ? junctionColor : levelColors[level]);
    const layer = junctionArrays[level];
    appendRibbon(layer.pos, layer.col, layer.idx, drapeSurface(surface, sampleHeight, ROAD_Y), scratchJunction);
  });
  // Cul-de-sac turning bulbs: a draped disc fan capping each dangling street, in its level's
  // junction layer so it overlays its own ribbon without z-fighting.
  for (const s of streets) {
    if (s.bulb === undefined) continue;
    const [bx, bz] = s.bulb;
    const r = s.width * 0.95;
    const color = levelColors[s.level];
    const layer = junctionArrays[s.level];
    const base = layer.pos.length / 3;
    layer.pos.push(bx, ROAD_Y + sampleHeight(bx, bz), bz);
    layer.col.push(color.r, color.g, color.b);
    const SEGS = 18;
    for (let k = 0; k < SEGS; k += 1) {
      const a = (k / SEGS) * Math.PI * 2;
      const px = bx + Math.cos(a) * r;
      const pz = bz + Math.sin(a) * r;
      layer.pos.push(px, ROAD_Y + sampleHeight(px, pz), pz);
      layer.col.push(color.r, color.g, color.b);
    }
    for (let k = 0; k < SEGS; k += 1) {
      layer.idx.push(base, base + 1 + k, base + 1 + ((k + 1) % SEGS));
    }
  }

  const makeRoadLayer = (
    arrays: LayerArrays,
    offset: number,
  ): { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial; mesh: THREE.Mesh } => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arrays.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(arrays.col, 3));
    geo.setIndex(arrays.idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      ...(offset !== 0 ? { polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset } : {}),
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    return { geo, mat, mesh };
  };
  // Depth priority ladder (closer to camera = wins overlaps): sidewalks 0, ribbons -1.0…-1.75 by
  // level, junction patches -2.0…-2.75 by level, glow -4.
  const RIBBON_OFFSET: Record<StreetLevel, number> = { lane: -1, street: -1.25, avenue: -1.5, boulevard: -1.75 };
  const JUNCTION_OFFSET: Record<StreetLevel, number> = { lane: -2, street: -2.25, avenue: -2.5, boulevard: -2.75 };
  const sidewalkLayer = makeRoadLayer(sidewalkArrays, 0);
  const streetLayers = LEVEL_ORDER.map((level) => makeRoadLayer(streetArrays[level], RIBBON_OFFSET[level]));
  const junctionLayers = LEVEL_ORDER.map((level) => makeRoadLayer(junctionArrays[level], JUNCTION_OFFSET[level]));

  // --- boulevard/avenue centerline glow, additive, above markings with polygonOffset ---
  const glowPos: number[] = [];
  const glowCol: number[] = [];
  const glowIdx: number[] = [];
  const glowColor = new THREE.Color(palette.glow);
  for (const street of streets) {
    if (street.level !== "boulevard" && street.level !== "avenue") continue;
    // Trimmed out of junction aprons: on sloped ground a glow line crossing another road's ribbon
    // genuinely interpenetrates it (different drape heights), which reads as z-fighting sparkle.
    for (const sub of trimPathAtJunctions(street.points, street.width, city.network.junctions)) {
      pushRibbon(glowPos, glowCol, glowIdx, sub.path, street.level === "boulevard" ? 1.1 : 0.7, GROUND_DECAL_LAYERS.glow, glowColor, sampleHeight);
    }
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
    // Deeper than every street layer (sidewalk 0 / ribbon -1 / junction -2) so the additive
    // centerline never depth-ties with the surface it decorates.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
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

  // --- buildings ---
  const boxWriter = makeWriter(); // windowed walls + flat boxes
  const shapeWriter = makeWriter(); // gable/cylinder/dome, DoubleSide, window-free
  const baseWall = new THREE.Color(palette.building);
  const shades = rng("shades");
  const heightsRng = rng("heights");
  const scratchShade = new THREE.Color();
  let tallest = 0;

  const lotContent = city.lotContent;
  if (lotContent !== undefined && lotContent.length > 0) {
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
  } else {
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

  // --- traffic: light dots flowing along street chains ---
  const streams = streets
    .filter((street) => street.points.length >= 2 && street.level !== "lane")
    .map((street) => streamFrom(street, sampleHeight));
  const totalLength = streams.reduce((sum, stream) => sum + stream.total, 0);
  const dotCount = Math.min(220, Math.max(24, Math.floor(totalLength / 16)));
  const dots: { stream: TrafficStream; offset: number; speed: number }[] = [];
  const traffic = rng("traffic");
  const dotPos = new Float32Array(dotCount * 3);
  const dotCol = new Float32Array(dotCount * 3);
  const colorA = new THREE.Color(palette.trafficA);
  const colorB = new THREE.Color(palette.trafficB);
  for (let i = 0; i < dotCount && streams.length > 0; i += 1) {
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
    dots.push({ stream, offset: traffic() * stream.total, speed: (forward ? 1 : -1) * (9 + traffic() * 14) });
    const tint = forward ? colorA : colorB;
    dotCol[i * 3] = tint.r;
    dotCol[i * 3 + 1] = tint.g;
    dotCol[i * 3 + 2] = tint.b;
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  dotGeo.setAttribute("color", new THREE.BufferAttribute(dotCol, 3));
  const dotMat = new THREE.PointsMaterial({
    size: 2.1,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dotMesh = new THREE.Points(dotGeo, dotMat);
  dotMesh.frustumCulled = false;
  group.add(dotMesh);

  // --- accent lights on the two busiest junctions ---
  const junctions = [...city.network.junctions].sort((a, b) => b.arms.length - a.arms.length);
  const lightColors = [palette.lightA, palette.lightB];
  junctions.slice(0, 2).forEach((junction, i) => {
    const light = new THREE.PointLight(lightColors[i], 8000, 260, 2);
    light.position.set(junction.x, 26 + sampleHeight(junction.x, junction.z), junction.z);
    group.add(light);
  });

  const sweepLayers = [sidewalkLayer, ...streetLayers].map((layer) => ({
    geo: layer.geo,
    total: layer.geo.getIndex()?.count ?? 0,
  }));
  const scratch = new THREE.Vector3();
  let settledAt = Number.POSITIVE_INFINITY;

  const update = (dt: number, elapsed: number) => {
    const sweep = options.instant === true ? 1 : Math.min(1, elapsed / BUILD_SWEEP_SECONDS);
    const eased = 1 - (1 - sweep) * (1 - sweep);
    // Reveal the swept ribbons + sidewalks, then the welded junction patches once the sweep completes.
    for (const layer of sweepLayers) {
      layer.geo.setDrawRange(0, Math.min(Math.ceil((layer.total / 6) * eased) * 6, layer.total));
    }
    for (const layer of junctionLayers) layer.mesh.visible = sweep >= 1;
    if (options.instant !== true) growUniform.value = elapsed - BUILD_SWEEP_SECONDS * 0.55;
    const fadeIn = options.instant === true ? 1 : Math.max(0, Math.min(1, (elapsed - 0.9) / 1.2));
    glowMat.opacity = fadeIn * (0.42 + Math.sin(elapsed * 1.7) * 0.1);
    dotMat.opacity = fadeIn * 0.9;
    for (let i = 0; i < dots.length; i += 1) {
      const dot = dots[i]!;
      dot.offset += dot.speed * dt;
      sampleStream(dot.stream, dot.offset, scratch);
      dotPos[i * 3] = scratch.x;
      dotPos[i * 3 + 1] = scratch.y;
      dotPos[i * 3 + 2] = scratch.z;
    }
    dotGeo.attributes.position!.needsUpdate = true;
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
      for (const layer of [sidewalkLayer, ...streetLayers, ...junctionLayers]) {
        layer.geo.dispose();
        layer.mat.dispose();
      }
      glowGeo.dispose();
      buildingMesh.geometry.dispose();
      shapeMesh.geometry.dispose();
      dotGeo.dispose();
      if (dressingMesh !== null) {
        dressingMesh.geometry.dispose();
        (dressingMesh.material as THREE.Material).dispose();
      }
      windows.dispose();
      glowMat.dispose();
      buildingMat.dispose();
      shapeMat.dispose();
      dotMat.dispose();
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
