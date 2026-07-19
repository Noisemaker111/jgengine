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
import type { CityLotPiece, CityPieceRole } from "@jgengine/core/world/cityContent";
import type { Street, StreetLevel } from "@jgengine/core/world/streetGenerator";
import {
  buildTrimmedIntersections,
  GROUND_DECAL_LAYERS,
  isOnRoad,
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

/** Street ribbon strip along a polyline; used for the additive glow + sidewalk bands. */
function pushRibbon(
  positions: number[],
  colors: number[],
  indices: number[],
  points: readonly (readonly [number, number])[],
  width: number,
  y: number,
  color: THREE.Color,
): void {
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
    positions.push(px - dz * half, y, pz + dx * half, px + dz * half, y, pz - dx * half);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = base + i * 2;
    // Wound so the face normal points +y (visible from above).
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
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

/** One shared emissive window texture: a grid of lit/dark cells; cell (0,0) stays dark for roofs. */
function windowTexture(seedRng: () => number, warm: number, cool: number): THREE.CanvasTexture {
  const size = 256;
  const cell = size / TEX_CELLS;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const warmColor = new THREE.Color(warm);
  const coolColor = new THREE.Color(cool);
  for (let row = 0; row < TEX_CELLS; row += 1) {
    for (let col = 0; col < TEX_CELLS; col += 1) {
      if (row === TEX_CELLS - 1 && col === 0) continue; // roof cell (uv origin) stays dark
      const roll = seedRng();
      if (roll > 0.4) continue;
      const tint = roll > 0.32 ? coolColor : warmColor;
      const bright = 0.7 + seedRng() * 0.3;
      ctx.fillStyle = `rgb(${Math.round(tint.r * 255 * bright)},${Math.round(tint.g * 255 * bright)},${Math.round(
        tint.b * 255 * bright,
      )})`;
      const x = col * cell;
      const y = row * cell;
      ctx.fillRect(x + cell * 0.22, y + cell * 0.16, cell * 0.56, cell * 0.68);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface BoxWriter {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  grow: number[];
  indices: number[];
}

function makeWriter(): BoxWriter {
  return { positions: [], normals: [], uvs: [], colors: [], grow: [], indices: [] };
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
    for (let i = 0; i < 4; i += 1) {
      const [x, y, z] = corners[i]!;
      out.positions.push(rotX(x, z), y, rotZ(x, z));
      out.normals.push(roof ? 0 : nx, ny, roof ? 0 : nz);
      if (lit) out.uvs.push((i === 1 || i === 2 ? uRepeat : 0) + 0.013, (i >= 2 ? vRepeat : 0) + 0.013);
      else out.uvs.push(ROOF_U, ROOF_V);
      out.colors.push(shade.r, shade.g, shade.b);
      out.grow.push(growDelay);
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
): void {
  emitTri(out, cos, sin, cx, cz, a, b, c, nLocal, shade, grow);
  emitTri(out, cos, sin, cx, cz, a, c, d, nLocal, shade, grow);
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
  emitTri(out, cos, sin, cx, cz, A, C, B, [-1, 0, 0], shade, grow); // left end
  emitTri(out, cos, sin, cx, cz, D, E, F, [1, 0, 0], shade, grow); // right end
  emitQuad(out, cos, sin, cx, cz, A, D, F, C, [0, hd, -h], shade, grow); // -z slope
  emitQuad(out, cos, sin, cx, cz, B, C, F, E, [0, hd, h], shade, grow); // +z slope
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
    emitQuad(out, cos, sin, cx, cz, p0b, p1b, p1t, p0t, [mc, 0, ms], shade, grow);
    emitTri(out, cos, sin, cx, cz, [0, y1, 0], p0t, p1t, [0, 1, 0], shade, grow); // top cap
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
      emitQuad(out, cos, sin, cx, cz, a, b, c, dd, n, shade, grow);
    }
  }
}

interface TrafficStream {
  points: readonly (readonly [number, number])[];
  lengths: number[];
  total: number;
  y: number;
}

function streamFrom(street: Street): TrafficStream {
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < street.points.length; i += 1) {
    total += Math.hypot(
      street.points[i]![0] - street.points[i - 1]![0],
      street.points[i]![1] - street.points[i - 1]![1],
    );
    lengths.push(total);
  }
  return { points: street.points, lengths, total, y: ROAD_Y + 0.5 };
}

function sampleStream(stream: TrafficStream, distance: number, out: THREE.Vector3): void {
  const d = ((distance % stream.total) + stream.total) % stream.total;
  let i = 1;
  while (i < stream.lengths.length - 1 && stream.lengths[i]! < d) i += 1;
  const t = (d - stream.lengths[i - 1]!) / Math.max(1e-6, stream.lengths[i]! - stream.lengths[i - 1]!);
  const a = stream.points[i - 1]!;
  const b = stream.points[i]!;
  out.set(a[0] + (b[0] - a[0]) * t, stream.y, a[1] + (b[1] - a[1]) * t);
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

export function buildCityModel(
  city: GeneratedCity,
  palette: CityPalette,
  options: { seed: string; instant?: boolean; heightScale?: number },
): CityModel {
  const heightScale = options.heightScale ?? 1;
  const group = new THREE.Group();
  const rng = seededStreams(`${options.seed}:render`);
  const streets = city.network.streets;

  const levelColors = Object.fromEntries(
    Object.entries(palette.streets).map(([level, hex]) => [level, new THREE.Color(hex)]),
  ) as Record<StreetLevel, THREE.Color>;
  const junctionColor = new THREE.Color(palette.junction ?? palette.streets.boulevard).multiplyScalar(0.82);
  const sidewalkColor = new THREE.Color(palette.sidewalk ?? palette.streets.street).lerp(new THREE.Color(0xffffff), 0.22);

  let radius = 40;
  for (const street of streets) for (const [x, z] of street.points) radius = Math.max(radius, Math.hypot(x, z));

  // --- streets: welded, trimmed intersections (no z-fighting, no floating discs) ---
  const flat = () => 0;
  const intersectionStreets: IntersectionStreet[] = streets.map((s) => ({ path: s.points, width: s.width }));
  const trimmed = buildTrimmedIntersections(intersectionStreets, city.network.junctions, flat);

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

  const streetPos: number[] = [];
  const streetCol: number[] = [];
  const streetIdx: number[] = [];
  // Widest levels first so the sweep reveals arterials before local streets.
  const order = trimmed.ribbons
    .map((_, i) => i)
    .sort((a, b) => LEVEL_ORDER.indexOf(ribbonLevel(trimmed.trimmed[a]!.path)) - LEVEL_ORDER.indexOf(ribbonLevel(trimmed.trimmed[b]!.path)));
  for (const i of order) {
    appendRibbon(streetPos, streetCol, streetIdx, trimmed.ribbons[i]!, levelColors[ribbonLevel(trimmed.trimmed[i]!.path)]);
  }
  // Sidewalk bands flanking the arterials, at the road layer, a touch lighter — trimmed into
  // spans wherever the band would plow across another street's pavement (crossings, junctions),
  // so no white strip ever runs over a road and dead-stops on the far side.
  const SIDEWALK_W = 2.2;
  const streetBounds = streets.map((s) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of s.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const pad = s.width / 2 + SIDEWALK_W + 6;
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  });
  for (let si = 0; si < streets.length; si += 1) {
    const s = streets[si]!;
    if (s.level === "lane" || s.sidewalks === undefined) continue;
    const near = streetBounds[si]!;
    const crossers = streets.filter((_, ti) => {
      if (ti === si) return false;
      const b = streetBounds[ti]!;
      return !(b.maxX < near.minX || b.minX > near.maxX || b.maxZ < near.minZ || b.minZ > near.maxZ);
    });
    for (const band of [s.sidewalks.left, s.sidewalks.right]) {
      let run: (readonly [number, number])[] = [];
      for (const p of band) {
        const blocked = crossers.some((t) => isOnRoad(t.points, t.width + SIDEWALK_W, p[0], p[1]));
        if (blocked) {
          if (run.length >= 2) pushRibbon(streetPos, streetCol, streetIdx, run, SIDEWALK_W, ROAD_Y, sidewalkColor);
          run = [];
        } else {
          run.push(p);
        }
      }
      if (run.length >= 2) pushRibbon(streetPos, streetCol, streetIdx, run, SIDEWALK_W, ROAD_Y, sidewalkColor);
    }
  }
  // Cul-de-sac turning bulbs: a kept dead end is a deliberate turnaround, so pave it as one —
  // a disc at the dangling terminus in the street's own color — instead of a bare squared stub.
  const pushDisc = (cx: number, cz: number, radius: number, color: THREE.Color): void => {
    const segs = 20;
    const base = streetPos.length / 3;
    streetPos.push(cx, ROAD_Y, cz);
    streetCol.push(color.r, color.g, color.b);
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      streetPos.push(cx + Math.cos(a) * radius, ROAD_Y, cz + Math.sin(a) * radius);
      streetCol.push(color.r, color.g, color.b);
    }
    for (let i = 0; i < segs; i += 1) streetIdx.push(base, base + 1 + i, base + 2 + i);
  };
  for (const s of streets) {
    if (s.bulb === undefined) continue;
    pushDisc(s.bulb[0], s.bulb[1], Math.max(s.width * 0.85, s.width / 2 + 2), levelColors[s.level]);
  }
  // Welded junction surfaces last (they read as one clean crossing patch).
  const streetSweepCount = streetIdx.length;
  for (const surface of trimmed.junctions) appendRibbon(streetPos, streetCol, streetIdx, surface, junctionColor);

  const streetGeo = new THREE.BufferGeometry();
  streetGeo.setAttribute("position", new THREE.Float32BufferAttribute(streetPos, 3));
  streetGeo.setAttribute("color", new THREE.Float32BufferAttribute(streetCol, 3));
  streetGeo.setIndex(streetIdx);
  const streetMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const streetMesh = new THREE.Mesh(streetGeo, streetMat);
  group.add(streetMesh);

  // --- boulevard/avenue centerline glow, additive, above markings with polygonOffset ---
  const glowPos: number[] = [];
  const glowCol: number[] = [];
  const glowIdx: number[] = [];
  const glowColor = new THREE.Color(palette.glow);
  for (const street of streets) {
    if (street.level !== "boulevard" && street.level !== "avenue") continue;
    pushRibbon(glowPos, glowCol, glowIdx, street.points, street.level === "boulevard" ? 1.1 : 0.7, GROUND_DECAL_LAYERS.glow, glowColor);
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
  glowMesh.renderOrder = 2;
  group.add(glowMesh);

  // --- buildings ---
  const boxWriter = makeWriter(); // windowed walls + flat boxes
  const shapeWriter = makeWriter(); // gable/cylinder/dome, DoubleSide, window-free
  const baseWall = new THREE.Color(palette.building);
  const roofBase = new THREE.Color(palette.roof ?? baseWall.clone().multiplyScalar(0.55).getHex());
  const trimBase = new THREE.Color(palette.trim ?? baseWall.clone().lerp(new THREE.Color(0xffffff), 0.28).getHex());
  const accentBase = new THREE.Color(palette.accent ?? baseWall.clone().lerp(new THREE.Color(0xff8a5c), 0.35).getHex());
  const shades = rng("shades");
  const heightsRng = rng("heights");
  const scratchShade = new THREE.Color();
  let tallest = 0;

  const lotContent = city.lotContent;
  if (lotContent !== undefined && lotContent.length > 0) {
    // Real massing pieces per lot: walls windowed when banded, everything else flat.
    for (const resolved of lotContent) {
      const [cx, cz] = resolved.center;
      const lotRot = resolved.rotationY;
      const lc = Math.cos(lotRot);
      const ls = Math.sin(lotRot);
      const dist = Math.hypot(cx, cz) / Math.max(1, radius);
      const dim = 0.82 + shades() * 0.35;
      const delay = dist * 1.5 + heightsRng() * 0.3;
      const wall = scratchShade.copy(baseWall).multiplyScalar(dim).clone();
      const roof = roofBase.clone().multiplyScalar(dim);
      const trim = trimBase.clone().multiplyScalar(dim);
      const accent = accentBase.clone().multiplyScalar(dim);
      resolved.pieces.forEach((piece: CityLotPiece, pi) => {
        // Lot-local piece center → world (rotate offset by lot yaw, add to lot center).
        const ox = piece.offset[0];
        const oz = piece.offset[2];
        const wx = cx + ox * lc + oz * ls;
        const wz = cz - ox * ls + oz * lc;
        const y0 = piece.offset[1] * heightScale;
        const sh = Math.max(0.2, piece.size[1] * heightScale);
        const ry = lotRot + piece.rotationY;
        const g = delay + pi * 0.05;
        const color = piece.banded ? wall : roleColor(piece.role, wall, roof, trim, accent);
        const top = y0 + sh;
        tallest = Math.max(tallest, top);
        switch (piece.shape) {
          case "box":
            pushBuildingBox(boxWriter, wx, wz, piece.size[0], piece.size[2], y0, top, ry, color, g, piece.banded);
            break;
          case "gable":
            pushGable(shapeWriter, wx, wz, piece.size[0], sh, piece.size[2], y0, ry, color, g);
            break;
          case "cylinder":
            pushCylinder(shapeWriter, wx, wz, piece.size[0], sh, piece.size[2], y0, ry, color, g);
            break;
          case "dome":
            pushDome(shapeWriter, wx, wz, piece.size[0], sh, piece.size[2], y0, ry, color, g);
            break;
        }
      });
    }
  } else {
    // Fallback (no resolved content, e.g. the hero world): windowed boxes on bare lots.
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
      if (h > 26 && heightsRng() < 0.7) {
        const tiers = h > 42 && heightsRng() < 0.5 ? 3 : 2;
        let y = 0;
        for (let t = 0; t < tiers; t += 1) {
          const frac = t === tiers - 1 ? 1 : 0.45 + heightsRng() * 0.25;
          const topY = t === tiers - 1 ? h : y + (h - y) * frac;
          const scale = 1 - t * (0.16 + heightsRng() * 0.12);
          pushBuildingBox(boxWriter, lot.center[0], lot.center[1], w * scale, d * scale, y, topY, lot.rotationY, scratchShade, delay + t * 0.12, true);
          y = topY;
        }
      } else {
        pushBuildingBox(boxWriter, lot.center[0], lot.center[1], w, d, 0, h, lot.rotationY, scratchShade, delay, true);
      }
    }
  }

  const windows = windowTexture(rng("windows"), palette.windowWarm, palette.windowCool);
  const growUniform = { value: options.instant === true ? 99 : -0.35 };
  const growVertex = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uGrow = growUniform;
    shader.vertexShader = `attribute float aGrow;\nuniform float uGrow;\nvarying float vGrown;\n${shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float growT = clamp((uGrow - aGrow) / 0.8, 0.0, 1.0);
      float grown = 1.0 - pow(1.0 - growT, 3.0);
      vGrown = grown;
      transformed.y *= grown;`,
    )}`;
  };

  const buildingMesh = buildMeshFromWriter(boxWriter);
  const buildingMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.08,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: windows,
    emissiveIntensity: 1.7,
  });
  buildingMat.onBeforeCompile = (shader) => {
    growVertex(shader);
    shader.fragmentShader = `varying float vGrown;\n${shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vGrown * vGrown;`,
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
  };
  shapeMesh.material = shapeMat;
  group.add(shapeMesh);

  // --- traffic: light dots flowing along street chains ---
  const streams = streets.filter((street) => street.points.length >= 2 && street.level !== "lane").map(streamFrom);
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
    light.position.set(junction.x, 26, junction.z);
    group.add(light);
  });

  const totalIndices = streetSweepCount;
  const junctionStart = streetSweepCount;
  const junctionCount = streetIdx.length - streetSweepCount;
  const scratch = new THREE.Vector3();
  let settledAt = Number.POSITIVE_INFINITY;

  const update = (dt: number, elapsed: number) => {
    const sweep = options.instant === true ? 1 : Math.min(1, elapsed / BUILD_SWEEP_SECONDS);
    const eased = 1 - (1 - sweep) * (1 - sweep);
    const revealed = Math.ceil((totalIndices / 6) * eased) * 6;
    // Reveal the swept ribbons, then the welded junction patches once the sweep completes.
    streetGeo.setDrawRange(0, sweep >= 1 ? totalIndices + junctionCount : Math.min(revealed, junctionStart));
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
      streetGeo.dispose();
      glowGeo.dispose();
      buildingMesh.geometry.dispose();
      shapeMesh.geometry.dispose();
      dotGeo.dispose();
      windows.dispose();
      streetMat.dispose();
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
  geo.setIndex(writer.indices);
  return new THREE.Mesh(geo);
}

/** Faded emerald grid ground shared by the hero and playground worlds. */
export function buildGround(radius: number, gridColor: number): THREE.Group {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x070b13, roughness: 1, metalness: 0 }),
  );
  disc.position.y = -0.02;
  group.add(disc);

  const grid = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
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
  grid.position.y = 0.01;
  group.add(grid);
  return group;
}
