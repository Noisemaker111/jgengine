/**
 * City content synthesis: the zone/class/massing layer of the `city` studio. Where `cityKind`
 * synthesizes the street NETWORK, this module decides what stands on it — which zone band a lot
 * falls in (core/mid/edge, invertible), which building class the band's weighted mix picks
 * (tower, slab, shop, rowhouse, house, mansion, farmhouse, barn, silo, warehouse), which of the
 * class's named massing TEMPLATES it uses (podium tower, mansard block, Dutch-gabled terrace, hipped
 * bungalow, sawtooth shed…), and the deterministic PIECES that template composes (boxes, gable and
 * hip roofs, cylinders, domes with palette roles). Pure data + seeded math — the shell renderer just
 * instances the piece shapes, so every visual variant is core-owned, testable, and identical per seed.
 *
 * @capability city-district zone bands, weighted building-class mixes, and per-class massing pieces
 */
import type { WeightedParamEntry } from "../generator/paramSchema";
import { pickWeighted } from "../random/pick";

/** A building class a zone mix can weight — drives lot size, floors, setback, and massing. */
export type CityLotClass =
  | "tower"
  | "slab"
  | "shop"
  | "rowhouse"
  | "house"
  | "mansion"
  | "farmhouse"
  | "barn"
  | "silo"
  | "warehouse";

/** All classes, for schema hints and validation. */
export const CITY_LOT_CLASSES: readonly CityLotClass[] = [
  "tower",
  "slab",
  "shop",
  "rowhouse",
  "house",
  "mansion",
  "farmhouse",
  "barn",
  "silo",
  "warehouse",
];

/** Zone band a lot falls in: dense core, middle ring, or the district edge. */
export type CityZoneBand = "core" | "mid" | "edge";

/** How the zone metric maps to bands. */
export type CityZoneProfile = "core-out" | "inverted" | "uniform";

/**
 * Primitive shapes massing pieces instance — the renderer keeps one InstancedMesh per shape. A
 * `gable` and a `hip` both keep their ridge along the piece's local x; the hip's ridge is half the
 * piece length, its ends sloping down to the eaves.
 */
export type CityPieceShape = "box" | "gable" | "hip" | "cylinder" | "dome";

/** Palette role a piece colors from (wall/roof/trim/accent map onto the district's style palette). */
export type CityPieceRole = "wall" | "roof" | "trim" | "accent";

/** One massing piece in LOT-LOCAL space: x along frontage width, z into the block, y up from grade. */
export interface CityLotPiece {
  shape: CityPieceShape;
  /** Piece-center offset from the lot center; y is the piece BASE height above grade. */
  offset: readonly [number, number, number];
  /** Full extents: width (x), height (y), depth (z). */
  size: readonly [number, number, number];
  /** Extra local yaw (crossing gables); 0 keeps the ridge along the lot width. */
  rotationY: number;
  role: CityPieceRole;
  /** Grounded pieces grow a foundation down to the lowest terrain corner under the lot. */
  grounded: boolean;
  /** Banded walls receive the window-strip treatment in the renderer. */
  banded: boolean;
}

/** Per-class placement/massing profile. */
interface ClassProfile {
  /** Frontage width range in meters (before `lotScale`). */
  width: readonly [number, number];
  /** Depth range in meters (before `lotScale`). */
  depth: readonly [number, number];
  /** Multiplier on the district's `buildingRoadSetback` — estates and farms sit further back. */
  setbackFactor: number;
  /** Multiplier on the district's `buildingSpacing` — rowhouses nearly touch, farms spread out. */
  spacingFactor: number;
  /** Floor-count range: development intensity 0 rolls near the low end, 1 near the high end. */
  floors: readonly [number, number];
}

const CLASS_PROFILES: Record<CityLotClass, ClassProfile> = {
  tower: { width: [16, 28], depth: [14, 26], setbackFactor: 0.15, spacingFactor: 0.35, floors: [8, 60] },
  slab: { width: [12, 24], depth: [11, 18], setbackFactor: 0.2, spacingFactor: 0.4, floors: [3, 16] },
  shop: { width: [6, 13], depth: [9, 14], setbackFactor: 0.05, spacingFactor: 0.15, floors: [1, 3] },
  rowhouse: { width: [5, 8], depth: [9, 13], setbackFactor: 0.2, spacingFactor: 0.05, floors: [2, 4] },
  house: { width: [10, 15], depth: [10, 14], setbackFactor: 1, spacingFactor: 1, floors: [1, 2] },
  mansion: { width: [18, 28], depth: [14, 22], setbackFactor: 2, spacingFactor: 1.6, floors: [2, 3] },
  farmhouse: { width: [10, 14], depth: [8, 12], setbackFactor: 2.8, spacingFactor: 4, floors: [1, 2] },
  barn: { width: [12, 18], depth: [9, 14], setbackFactor: 3.6, spacingFactor: 5, floors: [1, 1] },
  silo: { width: [5, 7], depth: [5, 7], setbackFactor: 4, spacingFactor: 3, floors: [1, 1] },
  warehouse: { width: [18, 36], depth: [16, 30], setbackFactor: 0.8, spacingFactor: 1.4, floors: [1, 2] },
};

/** Classes that form a street wall: dense districts let them claim their whole parcel. @internal */
export const STREETWALL_CLASSES: ReadonlySet<CityLotClass> = new Set(["tower", "slab", "shop", "rowhouse", "warehouse"]);

/** Placement numbers a resolved lot carries out of the class profile. @internal */
export interface ClassPlacement {
  width: number;
  depth: number;
  setback: number;
  gap: number;
  floors: number;
}

function range(rng: () => number, [lo, hi]: readonly [number, number]): number {
  return lo + rng() * (hi - lo);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Roll a class's lot dimensions/setback/floors from the district's placement dials. Setback keeps
 * only a whisper of jitter around `setbackBase × class factor`, so a street's frontage reads as an
 * aligned building wall; spacing likewise, so neighbors form rhythmic rows instead of scatter.
 * `intensity` (0..1, the district's development field at the lot) slides the floor count through the
 * class range, so heights rise and fall with the city's centres instead of stepping by zone band.
 * @internal
 */
export function rollClassPlacement(
  cls: CityLotClass,
  rng: () => number,
  lotScale: number,
  floorsMin: number,
  floorsMax: number,
  setbackBase: number,
  spacingBase: number,
  widthStretch = 1,
  intensity = 0.5,
): ClassPlacement {
  const profile = CLASS_PROFILES[cls];
  const [lo, hi] = profile.floors;
  const level = clamp01(Math.pow(clamp01(intensity), 1.35) * (0.72 + rng() * 0.56));
  const floors = Math.round(lo + (hi - lo) * level);
  return {
    width: range(rng, profile.width) * lotScale * widthStretch,
    depth: range(rng, profile.depth) * lotScale,
    setback: setbackBase * profile.setbackFactor * (0.9 + rng() * 0.2),
    gap: Math.max(0.2, spacingBase * profile.spacingFactor * (0.7 + rng() * 0.6)),
    floors: Math.max(floorsMin, Math.min(floorsMax, floors)),
  };
}

/** Map a zone metric to a band under a profile; `uniform` rolls a band from the extents instead. @internal */
export function zoneBand(
  metric: number,
  profile: CityZoneProfile,
  coreExtent: number,
  midExtent: number,
  roll: number,
): CityZoneBand {
  const mid = Math.max(coreExtent, midExtent);
  if (profile === "uniform") {
    const coreW = Math.max(0.001, coreExtent);
    const midW = Math.max(0.001, mid - coreExtent);
    const edgeW = Math.max(0.001, 1 - mid);
    const total = coreW + midW + edgeW;
    const pick = roll * total;
    return pick < coreW ? "core" : pick < coreW + midW ? "mid" : "edge";
  }
  const t = profile === "inverted" ? 1 - metric : metric;
  return t < coreExtent ? "core" : t < mid ? "mid" : "edge";
}

const CLASS_SET = new Set<string>(CITY_LOT_CLASSES);

/**
 * Pick a class from a weighted mix; unknown items are ignored, an empty mix falls back to `house`.
 * `bias` multiplies each class's weight (a district's character); when it zeroes every entry the
 * plain mix decides. @internal
 */
export function pickClass(mix: readonly WeightedParamEntry[], roll: number, bias?: Partial<Record<CityLotClass, number>>): CityLotClass {
  const known = mix.filter((e) => CLASS_SET.has(e.item));
  const weightOf = (e: WeightedParamEntry): number => e.weight * (bias?.[e.item as CityLotClass] ?? 1);
  const biased = bias !== undefined && known.some((e) => weightOf(e) > 0);
  const entry = pickWeighted(() => roll, known, biased ? weightOf : (e) => e.weight);
  return entry === undefined ? "house" : (entry.item as CityLotClass);
}

function box(
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: CityPieceRole,
  options: { rotationY?: number; grounded?: boolean; banded?: boolean } = {},
): CityLotPiece {
  return {
    shape: "box",
    offset,
    size,
    rotationY: options.rotationY ?? 0,
    role,
    grounded: options.grounded ?? false,
    banded: options.banded ?? false,
  };
}

function gable(offset: readonly [number, number, number], size: readonly [number, number, number], rotationY = 0): CityLotPiece {
  return { shape: "gable", offset, size, rotationY, role: "roof", grounded: false, banded: false };
}

function hip(offset: readonly [number, number, number], size: readonly [number, number, number], rotationY = 0): CityLotPiece {
  return { shape: "hip", offset, size, rotationY, role: "roof", grounded: false, banded: false };
}

function cylinder(
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: CityPieceRole,
  grounded: boolean,
): CityLotPiece {
  return { shape: "cylinder", offset, size, rotationY: 0, role, grounded, banded: false };
}

function dome(offset: readonly [number, number, number], size: readonly [number, number, number]): CityLotPiece {
  return { shape: "dome", offset, size, rotationY: 0, role: "roof", grounded: false, banded: false };
}

/**
 * Finish a flat roof at height `top` over a `width`×`depth` deck centred at lot-local (`x`, `z`): a
 * recessed dark deck, a parapet upstand on all four edges, and seeded rooftop plant (mechanical units,
 * a stair bulkhead, a tank). A city skyline is mostly roofs seen from above, so every flat-capped
 * mass runs through here instead of a bare slab.
 */
function flatRoofTop(
  pieces: CityLotPiece[],
  width: number,
  depth: number,
  top: number,
  rng: () => number,
  x = 0,
  z = 0,
): void {
  const rail = Math.min(1.15, 0.55 + rng() * 0.55);
  const wall = Math.min(0.55, Math.max(0.18, Math.min(width, depth) * 0.035));
  const innerW = Math.max(0.4, width - wall * 2);
  const innerD = Math.max(0.4, depth - wall * 2);
  pieces.push(box([x, top, z], [innerW, 0.14, innerD], "roof"));
  pieces.push(box([x, top, z + (depth - wall) / 2], [width, rail, wall], "trim"));
  pieces.push(box([x, top, z - (depth - wall) / 2], [width, rail, wall], "trim"));
  pieces.push(box([x + (width - wall) / 2, top, z], [wall, rail, innerD], "trim"));
  pieces.push(box([x - (width - wall) / 2, top, z], [wall, rail, innerD], "trim"));
  const deck = top + 0.14;
  const units = innerW * innerD > 110 ? 1 + Math.floor(rng() * 3) : rng() < 0.7 ? 1 : 0;
  for (let i = 0; i < units; i += 1) {
    const uw = Math.min(innerW * 0.34, 1.6 + rng() * 2.4);
    const ud = Math.min(innerD * 0.34, 1.4 + rng() * 2);
    pieces.push(box([x + (rng() - 0.5) * Math.max(0, innerW - uw), deck, z + (rng() - 0.5) * Math.max(0, innerD - ud)], [uw, 0.6 + rng() * 0.9, ud], "roof"));
  }
  if (rng() < 0.55) {
    const bw = Math.min(innerW * 0.34, 2.2 + rng() * 1.6);
    const bd = Math.min(innerD * 0.36, 2 + rng() * 1.4);
    pieces.push(box([x + (rng() - 0.5) * Math.max(0, innerW - bw), deck, z + (rng() - 0.5) * Math.max(0, innerD - bd)], [bw, 1.9 + rng() * 1.1, bd], "trim"));
  }
  if (rng() < 0.4) {
    const r = Math.min(2.2, Math.min(innerW, innerD) * 0.26);
    pieces.push(cylinder([x + (rng() - 0.5) * Math.max(0, innerW - r), deck, z + (rng() - 0.5) * Math.max(0, innerD - r)], [r, 1.4 + rng() * 1.2, r], "trim", false));
  }
}

/** A plain flat cap — deck plus a cornice line — for small masses that need no rooftop plant. */
function flatCap(pieces: CityLotPiece[], width: number, depth: number, top: number, x = 0, z = 0): void {
  pieces.push(box([x, top, z], [width * 0.96, 0.16, depth * 0.96], "roof"));
  pieces.push(box([x, top, z + depth / 2 - 0.15], [width, 0.5, 0.3], "trim"));
}

/**
 * Street-level treatment for a commercial frontage: a plinth course wrapping the base, a recessed
 * dark entrance on the street face, and a canopy over the sidewalk — so floor 1 never reads like
 * floor 30. `overhang` is the plinth's outward step (0 keeps it flush for terraced classes).
 */
function streetLevel(pieces: CityLotPiece[], width: number, depth: number, bandHeight: number, overhang: number, rng: () => number, z = 0): void {
  pieces.push(box([0, 0, z], [width + overhang, bandHeight, depth + overhang], "trim", { grounded: true }));
  const doorW = Math.min(width * 0.32, 3.4);
  const doorX = (rng() - 0.5) * Math.max(0, width - doorW * 1.6) * 0.5;
  const face = z + depth / 2 + overhang / 2;
  pieces.push(box([doorX, 0, face], [doorW, bandHeight * 0.76, 0.5], "roof", { grounded: true }));
  pieces.push(box([doorX, bandHeight * 0.8, face + 0.6], [doorW * 1.5, 0.22, 1.3], "accent"));
}

/** Everything one massing template reads: the lot box, its floors, and the lot's own stream. */
interface MassingContext {
  w: number;
  d: number;
  floors: number;
  fh: number;
  /** Total height, floors × floor height. */
  H: number;
  rng: () => number;
  out: CityLotPiece[];
}

/** One named massing recipe for a class: its pick weight, the lots it suits, and its pieces. */
interface LotTemplate {
  id: string;
  weight: number;
  fits?: (w: number, d: number, floors: number) => boolean;
  /** Leaves part of the lot open at grade (a light court, an L's empty corner): rare where blocks fill solid. */
  open?: boolean;
  build: (m: MassingContext) => void;
}

const shaft = (m: MassingContext, w: number, d: number, h: number, x = 0, z = 0, y = 0): void => {
  m.out.push(box([x, y, z], [w, h, d], "wall", { grounded: y === 0, banded: true }));
};

const TOWER_TEMPLATES: readonly LotTemplate[] = [
  {
    // Wedding-cake tiers: full-footprint shaft, then two setback tiers, parapet, maybe a mast.
    id: "setback",
    weight: 3,
    fits: (_w, _d, floors) => floors >= 10,
    build: (m) => {
      const { w, d, H, rng } = m;
      const h1 = H * (0.5 + rng() * 0.12);
      const h2 = H * (0.24 + rng() * 0.08);
      shaft(m, w, d, h1);
      const w2 = w * (0.78 + rng() * 0.08);
      const d2 = d * (0.78 + rng() * 0.08);
      shaft(m, w2, d2, h2, 0, 0, h1);
      const w3 = w * (0.55 + rng() * 0.1);
      const d3 = d * (0.55 + rng() * 0.1);
      shaft(m, w3, d3, H - h1 - h2, 0, 0, h1 + h2);
      flatRoofTop(m.out, w3 * 1.04, d3 * 1.04, H, rng);
      if (rng() < 0.35) m.out.push(box([0, H + 0.5, 0], [1.2, 3 + rng() * 5, 1.2], "trim"));
      streetLevel(m.out, w, d, Math.min(m.fh * 1.1, H * 0.5), 0.35, rng);
    },
  },
  {
    // Tower on a podium: a street-wall base fills the lot, the shaft rises set back to the rear.
    id: "podium",
    weight: 4,
    fits: (w, d, floors) => floors >= 8 && w >= 13 && d >= 12,
    build: (m) => {
      const { w, d, H, fh, rng } = m;
      const podiumFloors = Math.max(2, Math.min(7, Math.round(2 + m.floors * 0.08 + rng() * 2)));
      const ph = Math.min(H * 0.45, podiumFloors * fh);
      shaft(m, w, d, ph);
      m.out.push(box([0, ph, 0], [w * 0.98, 0.2, d * 0.98], "roof"));
      const sw = w * (0.5 + rng() * 0.16);
      const sd = d * (0.5 + rng() * 0.16);
      const sz = -((d - sd) / 2) * (0.2 + rng() * 0.6);
      shaft(m, sw, sd, H - ph, 0, sz, ph);
      flatRoofTop(m.out, sw * 1.03, sd * 1.03, H, rng, 0, sz);
      streetLevel(m.out, w, d, Math.min(fh * 1.1, ph * 0.5), 0.3, rng);
    },
  },
  {
    // Slim prism with a hipped crown — the pre-war spire top.
    id: "crown",
    weight: 2,
    fits: (_w, _d, floors) => floors >= 8,
    build: (m) => {
      const { w, d, H, rng } = m;
      const body = H * 0.9;
      shaft(m, w * 0.96, d * 0.96, body);
      const cw = w * (0.66 + rng() * 0.1);
      const cd = d * (0.66 + rng() * 0.1);
      m.out.push(box([0, body, 0], [cw, H - body, cd], "wall"));
      m.out.push(hip([0, H, 0], [cw * 1.02, 2.5 + H * 0.04, cd * 1.02]));
      streetLevel(m.out, w * 0.96, d * 0.96, Math.min(m.fh * 1.1, H * 0.5), 0.3, rng);
    },
  },
  {
    // Two shafts of unequal height sharing one podium.
    id: "twin",
    weight: 1.5,
    fits: (w, d, floors) => floors >= 10 && w >= 18 && d >= 12,
    build: (m) => {
      const { w, d, H, fh, rng } = m;
      const ph = Math.min(H * 0.3, (2 + Math.floor(rng() * 3)) * fh);
      shaft(m, w, d, ph);
      m.out.push(box([0, ph, 0], [w * 0.98, 0.2, d * 0.98], "roof"));
      const tw = w * 0.4;
      const td = d * (0.56 + rng() * 0.12);
      const second = H * (0.62 + rng() * 0.26);
      for (const [side, top] of [
        [-1, H],
        [1, second],
      ] as const) {
        const x = side * w * 0.27;
        shaft(m, tw, td, top - ph, x, 0, ph);
        flatRoofTop(m.out, tw * 1.03, td * 1.03, top, rng, x, 0);
      }
      streetLevel(m.out, w, d, Math.min(fh * 1.1, ph * 0.5), 0.3, rng);
    },
  },
  {
    // Three stepped tiers capped by a dome and mast — the signature skyline piece.
    id: "spire",
    weight: 1,
    fits: (_w, _d, floors) => floors >= 16,
    build: (m) => {
      const { w, d, H, rng } = m;
      const h1 = H * 0.62;
      const h2 = H * 0.22;
      shaft(m, w * 0.94, d * 0.94, h1);
      shaft(m, w * 0.74, d * 0.74, h2, 0, 0, h1);
      shaft(m, w * 0.5, d * 0.5, H - h1 - h2, 0, 0, h1 + h2);
      const dd = Math.min(w, d) * 0.46;
      m.out.push(dome([0, H, 0], [dd, 1.5 + H * 0.025, dd]));
      m.out.push(box([0, H + 1, 0], [0.9, 6 + rng() * 10, 0.9], "trim"));
      streetLevel(m.out, w * 0.94, d * 0.94, Math.min(m.fh * 1.1, H * 0.5), 0.3, rng);
    },
  },
  {
    // L-plan: a mid-rise street wing in front, the tall block on one rear corner.
    id: "lplan",
    open: true,
    weight: 1.5,
    fits: (w, d) => w >= 14 && d >= 13,
    build: (m) => {
      const { w, d, H, rng } = m;
      const fd = d * 0.46;
      const fhgt = H * (0.35 + rng() * 0.2);
      shaft(m, w, fd, fhgt, 0, d / 2 - fd / 2);
      flatRoofTop(m.out, w, fd, fhgt, rng, 0, d / 2 - fd / 2);
      const side = rng() < 0.5 ? 1 : -1;
      const bw = w * (0.5 + rng() * 0.12);
      const bd = d - fd;
      const bx = side * (w / 2 - bw / 2);
      shaft(m, bw, bd, H, bx, -d / 2 + bd / 2);
      flatRoofTop(m.out, bw, bd, H, rng, bx, -d / 2 + bd / 2);
      streetLevel(m.out, w, fd, Math.min(m.fh * 1.1, fhgt * 0.5), 0.3, rng, d / 2 - fd / 2);
    },
  },
  {
    // Two-tier mid-rise for towers too short for the tall recipes.
    id: "midrise",
    weight: 1,
    fits: (_w, _d, floors) => floors < 10,
    build: (m) => {
      const { w, d, H, rng } = m;
      const h1 = H * (0.66 + rng() * 0.1);
      shaft(m, w, d, h1);
      const w2 = w * (0.72 + rng() * 0.1);
      const d2 = d * (0.72 + rng() * 0.1);
      shaft(m, w2, d2, H - h1, 0, 0, h1);
      flatRoofTop(m.out, w2 * 1.05, d2 * 1.05, H, rng);
      streetLevel(m.out, w, d, Math.min(m.fh * 1.1, H * 0.5), 0.35, rng);
    },
  },
];

const SLAB_TEMPLATES: readonly LotTemplate[] = [
  {
    id: "block",
    weight: 3,
    build: (m) => {
      shaft(m, m.w, m.d, m.H);
      flatRoofTop(m.out, m.w * 1.02, m.d * 1.02, m.H, m.rng);
      streetLevel(m.out, m.w, m.d, Math.min(m.fh * 1.05, m.H * 0.5), 0.25, m.rng);
    },
  },
  {
    // Street wing plus a rear wing on one side: the identical-cell streetwall broken into an L.
    id: "wing",
    open: true,
    weight: 2,
    fits: (w, d) => w >= 14 && d >= 12,
    build: (m) => {
      const { w, d, H, rng } = m;
      const wing = w * (0.38 + rng() * 0.14);
      const side = rng() < 0.5 ? 1 : -1;
      const frontH = H * (0.92 + rng() * 0.08);
      const wingH = H * (0.7 + rng() * 0.25);
      shaft(m, w, d * 0.6, frontH, 0, d * 0.2);
      shaft(m, wing, d * 0.4, wingH, side * (w / 2 - wing / 2), -d * 0.3);
      flatRoofTop(m.out, w, d * 0.6, frontH, rng, 0, d * 0.2);
      flatCap(m.out, wing, d * 0.4, wingH, side * (w / 2 - wing / 2), -d * 0.3);
      streetLevel(m.out, w, d * 0.6, Math.min(m.fh * 1.05, frontH * 0.5), 0.25, rng, d * 0.2);
    },
  },
  {
    // Open court: street wall + two side wings, the rear left open as a service yard.
    id: "court",
    open: true,
    weight: 1.5,
    fits: (w, d) => w >= 16 && d >= 14,
    build: (m) => {
      const { w, d, H, rng } = m;
      const t = Math.min(w, d) * 0.3;
      const sideD = d - t;
      shaft(m, w, t, H, 0, (d - t) / 2);
      const hl = H * (0.75 + rng() * 0.25);
      const hr = H * (0.75 + rng() * 0.25);
      shaft(m, t, sideD, hl, (w - t) / 2, -t / 2);
      shaft(m, t, sideD, hr, -(w - t) / 2, -t / 2);
      flatRoofTop(m.out, w, t, H, rng, 0, (d - t) / 2);
      flatCap(m.out, t, sideD, hl, (w - t) / 2, -t / 2);
      flatCap(m.out, t, sideD, hr, -(w - t) / 2, -t / 2);
      streetLevel(m.out, w, t, Math.min(m.fh * 1.05, H * 0.5), 0.25, rng, (d - t) / 2);
    },
  },
  {
    // Mansard: a set-back attic storey under a hipped cap — the Haussmann block.
    id: "mansard",
    weight: 2,
    fits: (_w, _d, floors) => floors >= 3,
    build: (m) => {
      const { w, d, H, fh, rng } = m;
      shaft(m, w, d, H - fh);
      m.out.push(box([0, H - fh, 0], [w * 0.92, fh, d * 0.86], "wall"));
      m.out.push(hip([0, H, 0], [w * 0.93, 1.3 + rng() * 0.9, d * 0.87]));
      m.out.push(box([0, H - fh, d / 2 - 0.2], [w, 0.4, 0.4], "trim"));
      streetLevel(m.out, w, d, Math.min(fh * 1.05, H * 0.5), 0.2, rng);
    },
  },
  {
    // Pitched apartment block: a long gable over the full plan.
    id: "gabled",
    weight: 2,
    build: (m) => {
      const { w, d, H, rng } = m;
      shaft(m, w, d, H);
      m.out.push(gable([0, H, 0], [w * 1.02, 2.4 + d * (0.1 + rng() * 0.05), d * 1.04]));
      streetLevel(m.out, w, d, Math.min(m.fh * 1.05, H * 0.5), 0.2, rng);
    },
  },
  {
    // Terraced section: a low street block stepping up to a full-height rear block.
    id: "stepped",
    weight: 1.5,
    fits: (_w, d, floors) => d >= 12 && floors >= 3,
    build: (m) => {
      const { w, d, H, rng } = m;
      const fd = d * 0.45;
      const fH = Math.max(m.fh, H * (0.45 + rng() * 0.2));
      shaft(m, w, fd, fH, 0, d / 2 - fd / 2);
      shaft(m, w, d - fd, H, 0, -fd / 2);
      flatCap(m.out, w, fd, fH, 0, d / 2 - fd / 2);
      flatRoofTop(m.out, w, d - fd, H, rng, 0, -fd / 2);
      streetLevel(m.out, w, fd, Math.min(m.fh * 1.05, fH * 0.5), 0.2, rng, d / 2 - fd / 2);
    },
  },
];

const awning = (m: MassingContext, width: number): void => {
  m.out.push(box([0, Math.min(m.H - 0.4, 2.6), m.d / 2 + 0.35], [width * 0.9, 0.35, 0.9], "accent"));
  m.out.push(box([0, 0, m.d / 2 - 0.05], [width * 0.82, Math.min(m.H * 0.62, 2.5), 0.4], "roof", { grounded: true }));
};

const SHOP_TEMPLATES: readonly LotTemplate[] = [
  {
    id: "flat",
    weight: 3,
    build: (m) => {
      m.out.push(box([0, 0, 0], [m.w, m.H, m.d], "wall", { grounded: true }));
      flatRoofTop(m.out, m.w * 1.03, m.d * 1.03, m.H, m.rng);
      awning(m, m.w);
    },
  },
  {
    // Gable end to the street: the old-town shophouse.
    id: "gablefront",
    weight: 2,
    build: (m) => {
      m.out.push(box([0, 0, 0], [m.w, m.H, m.d], "wall", { grounded: true }));
      m.out.push(gable([0, m.H, 0], [m.d * 1.04, 1.6 + m.w * (0.16 + m.rng() * 0.08), m.w * 1.03], Math.PI / 2));
      awning(m, m.w);
    },
  },
  {
    // False front: a tall parapet face hiding a low gable behind — the frontier main street.
    id: "falsefront",
    weight: 1.5,
    build: (m) => {
      m.out.push(box([0, 0, -0.2], [m.w, m.H, m.d - 0.4], "wall", { grounded: true }));
      m.out.push(box([0, 0, m.d / 2 - 0.2], [m.w, m.H + 1.2 + m.rng() * 1.2, 0.4], "wall", { grounded: true }));
      m.out.push(gable([0, m.H, -0.2], [m.w * 0.98, 1.3 + m.rng() * 0.5, m.d - 0.5]));
      awning(m, m.w);
    },
  },
  {
    id: "hip",
    weight: 1.5,
    build: (m) => {
      m.out.push(box([0, 0, 0], [m.w, m.H, m.d], "wall", { grounded: true }));
      m.out.push(hip([0, m.H, 0], [m.w * 1.04, 1.4 + Math.min(m.w, m.d) * 0.12, m.d * 1.04]));
      awning(m, m.w);
    },
  },
  {
    // Two narrow fronts of unequal height under one awning line.
    id: "split",
    weight: 1.5,
    fits: (w) => w >= 8,
    build: (m) => {
      const { w, d, H, fh, rng } = m;
      const lw = w * (0.48 + rng() * 0.14);
      const rw = w - lw;
      const rh = Math.max(fh, H + (rng() < 0.5 ? -1 : 1) * fh);
      m.out.push(box([-w / 2 + lw / 2, 0, 0], [lw, H, d], "wall", { grounded: true }));
      m.out.push(box([w / 2 - rw / 2, 0, 0], [rw, rh, d], "wall", { grounded: true }));
      flatCap(m.out, lw, d, H, -w / 2 + lw / 2, 0);
      flatCap(m.out, rw, d, rh, w / 2 - rw / 2, 0);
      awning(m, w);
    },
  },
];

const terrace = (m: MassingContext): void => {
  m.out.push(box([0, 0, 0], [m.w * 0.98, m.H, m.d * 0.92], "wall", { grounded: true, banded: true }));
};

const ROWHOUSE_TEMPLATES: readonly LotTemplate[] = [
  {
    id: "gable",
    weight: 3,
    build: (m) => {
      terrace(m);
      m.out.push(gable([0, m.H, 0], [m.w * 0.98, 1.6 + m.rng() * 0.8, m.d * 0.96]));
      streetLevel(m.out, m.w * 0.98, m.d * 0.92, Math.min(m.fh * 0.95, m.H * 0.5), 0.04, m.rng);
    },
  },
  {
    id: "parapet",
    weight: 2,
    build: (m) => {
      terrace(m);
      flatCap(m.out, m.w, m.d * 0.92, m.H);
      streetLevel(m.out, m.w * 0.98, m.d * 0.92, Math.min(m.fh * 0.95, m.H * 0.5), 0.04, m.rng);
    },
  },
  {
    // Dutch gable: the ridge runs into the block so the gable end faces the street.
    id: "dutch",
    weight: 2,
    build: (m) => {
      terrace(m);
      m.out.push(gable([0, m.H, 0], [m.d * 0.94, 2.4 + m.rng() * 1.6, m.w * 0.98], Math.PI / 2));
      streetLevel(m.out, m.w * 0.98, m.d * 0.92, Math.min(m.fh * 0.95, m.H * 0.5), 0.04, m.rng);
    },
  },
  {
    id: "mansard",
    weight: 1.5,
    build: (m) => {
      terrace(m);
      m.out.push(hip([0, m.H, 0], [m.w * 1.04, 1.8 + m.rng() * 0.6, m.d * 0.94]));
      m.out.push(box([0, m.H + 0.4, m.d * 0.3], [Math.min(1.6, m.w * 0.35), 1.1, 0.9], "trim"));
      streetLevel(m.out, m.w * 0.98, m.d * 0.92, Math.min(m.fh * 0.95, m.H * 0.5), 0.04, m.rng);
    },
  },
  {
    // A two-storey bay window stands proud of the facade.
    id: "bay",
    weight: 1.5,
    build: (m) => {
      const bayW = m.w * 0.46;
      m.out.push(box([0, 0, -0.45], [m.w * 0.98, m.H, m.d * 0.92 - 0.9], "wall", { grounded: true, banded: true }));
      m.out.push(box([(m.rng() - 0.5) * (m.w - bayW) * 0.6, 0, m.d * 0.46 - 0.45], [bayW, Math.min(m.H, m.fh * 2), 0.9], "wall", { grounded: true }));
      m.out.push(gable([0, m.H, -0.45], [m.w * 0.98, 1.5 + m.rng() * 0.7, m.d * 0.92 - 0.8]));
    },
  },
  {
    // Gabled terrace with dormers punched through the front slope.
    id: "dormer",
    weight: 1.5,
    build: (m) => {
      terrace(m);
      const rise = 2 + m.rng() * 0.8;
      m.out.push(gable([0, m.H, 0], [m.w * 0.98, rise, m.d * 0.96]));
      const dormers = m.w > 6.5 ? 2 : 1;
      for (let i = 0; i < dormers; i += 1) {
        const x = dormers === 1 ? 0 : (i === 0 ? -1 : 1) * m.w * 0.22;
        m.out.push(box([x, m.H + 0.2, m.d * 0.22], [1.3, rise * 0.55, 1.4], "wall"));
        m.out.push(gable([x, m.H + 0.2 + rise * 0.55, m.d * 0.22], [1.6, 0.7, 1.5], Math.PI / 2));
      }
    },
  },
];

/** A detached main body with eaves set back from the lot edges (yards on every side). */
const body = (m: MassingContext, wf: number, df: number, h = m.H, x = 0, z = 0, role: CityPieceRole = "wall"): readonly [number, number] => {
  const bw = m.w * wf;
  const bd = m.d * df;
  m.out.push(box([x, 0, z], [bw, h, bd], role, { grounded: true }));
  return [bw, bd];
};

const chimney = (m: MassingContext, bw: number, bd: number): void => {
  if (m.rng() < 0.5) m.out.push(box([bw * (0.18 + m.rng() * 0.14), m.H + 1.1, bd * 0.08], [0.7, 1.7, 0.7], "trim"));
};

const HOUSE_TEMPLATES: readonly LotTemplate[] = [
  {
    id: "gable",
    weight: 3,
    build: (m) => {
      const [bw, bd] = body(m, 0.84 + m.rng() * 0.08, 0.74 + m.rng() * 0.08);
      const along = m.rng() < 0.5;
      const rise = 1.9 + m.rng() * 1.1;
      m.out.push(gable([0, m.H, 0], along ? [bw * 1.08, rise, bd * 1.12] : [bd * 1.12, rise, bw * 1.08], along ? 0 : Math.PI / 2));
      chimney(m, bw, bd);
      if (m.rng() < 0.55) m.out.push(box([0, 0, bd / 2 + 0.8], [bw * 0.55, 0.25, 1.6], "trim", { grounded: true }));
    },
  },
  {
    id: "hip",
    weight: 2.5,
    build: (m) => {
      const [bw, bd] = body(m, 0.84 + m.rng() * 0.08, 0.74 + m.rng() * 0.08);
      m.out.push(hip([0, m.H, 0], [bw * 1.08, 1.7 + m.rng() * 0.9, bd * 1.1]));
      m.out.push(box([0, 0, bd / 2 + 0.8], [bw * 0.5, 0.25, 1.6], "trim", { grounded: true }));
      chimney(m, bw, bd);
    },
  },
  {
    // L-plan: a gabled main range with a cross-gabled wing stepping forward.
    id: "lplan",
    weight: 2,
    fits: (w, d) => w >= 7 && d >= 6,
    build: (m) => {
      const side = m.rng() < 0.5 ? 1 : -1;
      const bw = m.w * 0.66;
      const bd = m.d * 0.56;
      const mx = -side * m.w * 0.15;
      m.out.push(box([mx, 0, -m.d * 0.2], [bw, m.H, bd], "wall", { grounded: true }));
      m.out.push(gable([mx, m.H, -m.d * 0.2], [bw * 1.06, 1.8 + m.rng() * 0.8, bd * 1.1]));
      const ww = m.w * 0.36;
      const wd = m.d * 0.5;
      const wx = side * (m.w * 0.5 - ww / 2 - m.w * 0.02);
      const wz = m.d * 0.2;
      m.out.push(box([wx, 0, wz], [ww, m.H, wd], "wall", { grounded: true }));
      m.out.push(gable([wx, m.H, wz], [wd * 1.08, 1.6 + m.rng() * 0.6, ww * 1.1], Math.PI / 2));
    },
  },
  {
    // Gabled house with an attached, lower-gabled garage.
    id: "garage",
    weight: 2,
    fits: (w) => w >= 8,
    build: (m) => {
      const bw = m.w * 0.6;
      const bd = m.d * (0.74 + m.rng() * 0.08);
      const side = m.rng() < 0.5 ? 1 : -1;
      const hx = -side * m.w * 0.18;
      m.out.push(box([hx, 0, 0], [bw, m.H, bd], "wall", { grounded: true }));
      m.out.push(gable([hx, m.H, 0], [bw * 1.08, 1.9 + m.rng() * 0.9, bd * 1.12]));
      const gw = m.w * 0.34;
      const gx = side * (m.w * 0.5 - gw / 2 - m.w * 0.01);
      const gh = Math.min(m.H, 3) * 0.95;
      m.out.push(box([gx, 0, bd * 0.05], [gw, gh, bd * 0.7], "wall", { grounded: true }));
      m.out.push(box([gx, gh, bd * 0.05], [gw * 1.04, 0.6, bd * 0.74], "roof"));
    },
  },
  {
    // Bungalow: one wide low storey under a shallow hip, with a porch roof on the street face.
    id: "bungalow",
    weight: 1.5,
    build: (m) => {
      const h = Math.min(m.H, m.fh * 1.1);
      const bw = m.w * 0.92;
      const bd = m.d * 0.7;
      m.out.push(box([0, 0, -m.d * 0.04], [bw, h, bd], "wall", { grounded: true }));
      m.out.push(hip([0, h, -m.d * 0.04], [bw * 1.08, 1.2 + m.rng() * 0.5, bd * 1.12]));
      const porchZ = -m.d * 0.04 + bd / 2 + 0.9;
      m.out.push(gable([0, h * 0.85, porchZ], [2.2, 1.1, bw * 0.45], Math.PI / 2));
    },
  },
  {
    // Modern: two offset flat-roofed volumes, the upper cantilevering over the lower.
    id: "modern",
    weight: 1.2,
    build: (m) => {
      const h1 = Math.min(m.H, m.fh * 1.05);
      const lw = m.w * 0.86;
      const ld = m.d * 0.66;
      const shift = (m.rng() - 0.5) * m.w * 0.1;
      m.out.push(box([shift, 0, 0], [lw, h1, ld], "wall", { grounded: true }));
      m.out.push(box([shift, h1, 0], [lw, 0.18, ld], "roof"));
      const uw = m.w * 0.56;
      const ud = m.d * 0.72;
      const ux = -shift * 1.4;
      const h2 = Math.max(m.fh, m.H - h1);
      m.out.push(box([ux, h1, -m.d * 0.04], [uw, h2, ud], "wall"));
      m.out.push(box([ux, h1 + h2, -m.d * 0.04], [uw, 0.18, ud], "roof"));
    },
  },
];

const MANSION_TEMPLATES: readonly LotTemplate[] = [
  {
    // Central block with two gabled wings and a portico.
    id: "wings",
    weight: 2,
    build: (m) => {
      const cw = m.w * (0.44 + m.rng() * 0.08);
      const cd = m.d * (0.66 + m.rng() * 0.08);
      m.out.push(box([0, 0, 0], [cw, m.H, cd], "wall", { grounded: true }));
      m.out.push(gable([0, m.H, 0], [cw * 1.1, 2.4 + m.rng(), cd * 1.12]));
      for (const side of [-1, 1] as const) {
        const ww = m.w * (0.24 + m.rng() * 0.05);
        const wh = m.H * (0.72 + m.rng() * 0.15);
        const wd = cd * (0.75 + m.rng() * 0.15);
        const wx = side * (cw / 2 + ww / 2 - 0.3);
        m.out.push(box([wx, 0, 0], [ww, wh, wd], "wall", { grounded: true }));
        m.out.push(gable([wx, wh, 0], [wd * 1.1, 1.6 + m.rng() * 0.7, ww * 1.08], Math.PI / 2));
      }
      m.out.push(box([0, 0, cd / 2 + 0.9], [cw * 0.4, 0.3, 1.8], "trim", { grounded: true }));
      m.out.push(box([0, m.H * 0.55, cd / 2 + 0.9], [cw * 0.42, 0.35, 1.9], "trim"));
    },
  },
  {
    // Georgian block: one broad hipped mass with a columned portico.
    id: "hipblock",
    weight: 2,
    build: (m) => {
      const bw = m.w * (0.74 + m.rng() * 0.08);
      const bd = m.d * (0.62 + m.rng() * 0.08);
      m.out.push(box([0, 0, 0], [bw, m.H, bd], "wall", { grounded: true }));
      m.out.push(hip([0, m.H, 0], [bw * 1.06, 2.2 + m.rng() * 1.2, bd * 1.08]));
      for (const x of [-0.16, -0.05, 0.05, 0.16]) m.out.push(box([bw * x, 0, bd / 2 + 1.4], [0.5, m.H * 0.9, 0.5], "trim", { grounded: true }));
      m.out.push(box([0, m.H * 0.9, bd / 2 + 1.2], [bw * 0.42, 0.4, 2.6], "trim"));
    },
  },
  {
    // U-plan court: a rear range with two gabled wings reaching toward the street.
    id: "court",
    weight: 1.5,
    fits: (w, d) => w >= 16 && d >= 13,
    build: (m) => {
      const t = Math.min(m.w, m.d) * 0.3;
      const rd = m.d * 0.8;
      m.out.push(box([0, 0, -rd / 2 + t / 2], [m.w * 0.9, m.H, t], "wall", { grounded: true }));
      m.out.push(hip([0, m.H, -rd / 2 + t / 2], [m.w * 0.92, 2 + m.rng(), t * 1.1]));
      for (const side of [-1, 1] as const) {
        const x = side * (m.w * 0.45 - t / 2);
        const wh = m.H * (0.8 + m.rng() * 0.2);
        m.out.push(box([x, 0, t / 2], [t, wh, rd - t], "wall", { grounded: true }));
        m.out.push(gable([x, wh, t / 2], [(rd - t) * 1.04, 1.6 + m.rng() * 0.6, t * 1.1], Math.PI / 2));
      }
    },
  },
  {
    // Modernist villa: offset flat slabs, the top floor sliding over a terrace.
    id: "modern",
    weight: 1.2,
    build: (m) => {
      const h1 = m.fh * 1.05;
      const lw = m.w * 0.78;
      const ld = m.d * 0.6;
      m.out.push(box([-m.w * 0.06, 0, 0], [lw, h1, ld], "wall", { grounded: true }));
      m.out.push(box([-m.w * 0.06, h1, 0], [lw, 0.2, ld], "roof"));
      const uw = m.w * 0.56;
      const ud = m.d * 0.56;
      const h2 = Math.max(m.fh, m.H - h1);
      m.out.push(box([m.w * 0.14, h1, -m.d * 0.06], [uw, h2, ud], "wall"));
      m.out.push(box([m.w * 0.14, h1 + h2, -m.d * 0.06], [uw, 0.2, ud], "roof"));
      m.out.push(box([-m.w * 0.3, 0, m.d * 0.3], [m.w * 0.26, 0.12, m.d * 0.22], "accent", { grounded: true }));
    },
  },
  {
    // Tower villa: a hipped house with a round corner turret and its dome.
    id: "turret",
    weight: 1.2,
    build: (m) => {
      const bw = m.w * 0.74;
      const bd = m.d * 0.66;
      m.out.push(box([-m.w * 0.06, 0, 0], [bw, m.H, bd], "wall", { grounded: true }));
      m.out.push(hip([-m.w * 0.06, m.H, 0], [bw * 1.06, 2 + m.rng(), bd * 1.08]));
      const r = Math.min(m.w, m.d) * 0.24;
      const tx = -m.w * 0.06 + bw / 2;
      const th = m.H + 2.5 + m.rng() * 2;
      m.out.push(cylinder([tx, 0, bd / 2 - r * 0.3], [r, th, r], "wall", true));
      m.out.push(dome([tx, th, bd / 2 - r * 0.3], [r * 1.05, r * 0.9, r * 1.05]));
    },
  },
];

const FARMHOUSE_TEMPLATES: readonly LotTemplate[] = [
  {
    // Gabled house with a full porch across the street face.
    id: "porch",
    weight: 2,
    build: (m) => {
      const [bw, bd] = body(m, 0.8, 0.62);
      m.out.push(gable([0, m.H, 0], [bw * 1.08, 2.2 + m.rng() * 0.8, bd * 1.12]));
      m.out.push(box([0, 0, bd / 2 + 1], [bw * 0.9, 0.25, 2], "trim", { grounded: true }));
      m.out.push(box([0, m.H * 0.45, bd / 2 + 1], [bw * 0.92, 0.28, 2.1], "roof"));
      chimney(m, bw, bd);
    },
  },
  {
    id: "lplan",
    weight: 2,
    build: (m) => {
      const bw = m.w * 0.62;
      const bd = m.d * 0.5;
      m.out.push(box([-m.w * 0.1, 0, -m.d * 0.1], [bw, m.H, bd], "wall", { grounded: true }));
      m.out.push(gable([-m.w * 0.1, m.H, -m.d * 0.1], [bw * 1.08, 2.2 + m.rng() * 0.6, bd * 1.12]));
      const ww = m.w * 0.3;
      const wd = m.d * 0.46;
      m.out.push(box([m.w * 0.32, 0, m.d * 0.12], [ww, m.H * 0.85, wd], "wall", { grounded: true }));
      m.out.push(gable([m.w * 0.32, m.H * 0.85, m.d * 0.12], [wd * 1.08, 1.8, ww * 1.1], Math.PI / 2));
    },
  },
  {
    // American foursquare: a cubic box under a pyramidal hip, porch roof across the front.
    id: "foursquare",
    weight: 1.5,
    build: (m) => {
      const s = Math.min(m.w, m.d) * 0.72;
      m.out.push(box([0, 0, 0], [s, m.H, s], "wall", { grounded: true }));
      m.out.push(hip([0, m.H, 0], [s * 1.1, 2 + m.rng() * 0.6, s * 1.1]));
      m.out.push(box([0, m.H * 0.42, s / 2 + 0.9], [s * 0.96, 0.25, 1.8], "roof"));
    },
  },
  {
    // Saltbox: the main gable with a long lean-to dropping off the back.
    id: "leanto",
    weight: 1.5,
    build: (m) => {
      const bw = m.w * 0.74;
      const bd = m.d * 0.42;
      m.out.push(box([0, 0, bd * 0.3], [bw, m.H, bd], "wall", { grounded: true }));
      m.out.push(gable([0, m.H, bd * 0.3], [bw * 1.06, 2.2 + m.rng() * 0.6, bd * 1.12]));
      const ld = m.d * 0.3;
      m.out.push(box([0, 0, bd * 0.3 - bd / 2 - ld / 2], [bw * 0.94, m.H * 0.55, ld], "wall", { grounded: true }));
      m.out.push(box([0, m.H * 0.55, bd * 0.3 - bd / 2 - ld / 2], [bw * 0.96, 0.3, ld * 1.06], "roof"));
    },
  },
  {
    // Longhouse: dwelling and byre under one ridge line, the byre end in barn colour.
    id: "longhouse",
    weight: 1.2,
    fits: (w) => w >= 10,
    build: (m) => {
      const dw = m.w * 0.5;
      const bd = m.d * 0.5;
      m.out.push(box([-m.w * 0.22, 0, 0], [dw, m.H, bd], "wall", { grounded: true }));
      m.out.push(box([m.w * 0.24, 0, 0], [m.w * 0.42, m.H * 0.9, bd], "accent", { grounded: true }));
      m.out.push(gable([0, m.H, 0], [m.w * 0.94, 2.4 + m.rng() * 0.6, bd * 1.14]));
    },
  },
];

const BARN_TEMPLATES: readonly LotTemplate[] = [
  {
    // Gambrel silhouette: squat walls, a steep lower gable, then a shallower upper gable.
    id: "gambrel",
    weight: 2,
    build: (m) => {
      const bw = m.w * 0.85;
      const bd = m.d * 0.78;
      const wallH = 3 + m.rng() * 0.8;
      m.out.push(box([0, 0, 0], [bw, wallH, bd], "accent", { grounded: true }));
      m.out.push(gable([0, wallH, 0], [bw * 1.04, 1.7, bd * 1.06]));
      m.out.push(gable([0, wallH + 1.55, 0], [bw * 0.62, 1.3, bd * 1.06]));
    },
  },
  {
    // Gambrel barn with its silo on one corner.
    id: "gambrelsilo",
    weight: 2,
    fits: (w) => w >= 11,
    build: (m) => {
      const bw = m.w * 0.66;
      const bd = m.d * 0.78;
      const wallH = 3 + m.rng() * 0.8;
      const bx = -m.w * 0.15;
      m.out.push(box([bx, 0, 0], [bw, wallH, bd], "accent", { grounded: true }));
      m.out.push(gable([bx, wallH, 0], [bw * 1.04, 1.7, bd * 1.06]));
      m.out.push(gable([bx, wallH + 1.55, 0], [bw * 0.62, 1.3, bd * 1.06]));
      const r = Math.min(m.w * 0.24, 4);
      const sx = m.w / 2 - r / 2;
      const sh = 7 + m.rng() * 3;
      m.out.push(cylinder([sx, 0, -bd * 0.2], [r, sh, r], "trim", true));
      m.out.push(dome([sx, sh, -bd * 0.2], [r, 1.6, r]));
    },
  },
  {
    // Bank barn: one tall steep gable with a lean-to shed along its side.
    id: "gable",
    weight: 1.5,
    build: (m) => {
      const bw = m.w * 0.7;
      const bd = m.d * 0.72;
      const wallH = 4 + m.rng();
      m.out.push(box([-m.w * 0.1, 0, 0], [bw, wallH, bd], "accent", { grounded: true }));
      m.out.push(gable([-m.w * 0.1, wallH, 0], [bw * 1.04, 3.2 + m.rng(), bd * 1.08]));
      const sw = m.w * 0.24;
      m.out.push(box([m.w / 2 - sw / 2, 0, 0], [sw, wallH * 0.6, bd * 0.9], "accent", { grounded: true }));
      m.out.push(box([m.w / 2 - sw / 2, wallH * 0.6, 0], [sw * 1.04, 0.25, bd * 0.94], "roof"));
    },
  },
  {
    // Round barn: a drum under a low conical-ish dome.
    id: "round",
    weight: 1,
    build: (m) => {
      const r = Math.min(m.w, m.d) * 0.86;
      const wallH = 4 + m.rng();
      m.out.push(cylinder([0, 0, 0], [r, wallH, r], "accent", true));
      m.out.push(dome([0, wallH, 0], [r * 1.04, r * 0.32, r * 1.04]));
    },
  },
  {
    // Dutch barn: a broad hip roof crowned by a little ventilation cupola.
    id: "dutch",
    weight: 1.2,
    build: (m) => {
      const bw = m.w * 0.86;
      const bd = m.d * 0.76;
      const wallH = 3.4 + m.rng() * 0.8;
      m.out.push(box([0, 0, 0], [bw, wallH, bd], "accent", { grounded: true }));
      m.out.push(hip([0, wallH, 0], [bw * 1.06, 3 + m.rng(), bd * 1.08]));
      m.out.push(box([0, wallH + 2.6, 0], [1.4, 1.2, 1.4], "trim"));
    },
  },
];

const SILO_TEMPLATES: readonly LotTemplate[] = [
  {
    id: "single",
    weight: 2,
    build: (m) => {
      const r = Math.min(m.w, m.d) * 0.8;
      const sh = 8 + m.rng() * 4;
      m.out.push(cylinder([0, 0, 0], [r, sh, r], "trim", true));
      m.out.push(dome([0, sh, 0], [r, 1.8, r]));
    },
  },
  {
    id: "twin",
    weight: 1.5,
    build: (m) => {
      const r = Math.min(m.w * 0.5, m.d * 0.9);
      const sh = 8 + m.rng() * 4;
      for (const [x, h] of [
        [-m.w / 2 + r / 2, sh],
        [m.w / 2 - r / 2, sh * (0.7 + m.rng() * 0.2)],
      ] as const) {
        m.out.push(cylinder([x, 0, 0], [r, h, r], "trim", true));
        m.out.push(dome([x, h, 0], [r, 1.4, r]));
      }
    },
  },
  {
    // Grain bins: a row of squat corrugated drums with shallow caps.
    id: "bins",
    weight: 1.5,
    build: (m) => {
      const r = Math.min(m.w / 3, m.d) * 0.95;
      const h = 4 + m.rng() * 1.5;
      for (let i = -1; i <= 1; i += 1) {
        m.out.push(cylinder([i * (m.w / 3), 0, 0], [r, h, r], "trim", true));
        m.out.push(dome([i * (m.w / 3), h, 0], [r, 1, r]));
      }
    },
  },
  {
    // Concrete pair with a gabled headhouse riding between them.
    id: "headhouse",
    weight: 1,
    build: (m) => {
      const r = Math.min(m.w * 0.42, m.d * 0.9);
      const sh = 10 + m.rng() * 4;
      for (const x of [-m.w / 2 + r / 2, m.w / 2 - r / 2]) m.out.push(cylinder([x, 0, 0], [r, sh, r], "trim", true));
      const hw = m.w * 0.36;
      m.out.push(box([0, 0, 0], [hw, sh + 2.4, r * 0.7], "wall", { grounded: true }));
      m.out.push(gable([0, sh + 2.4, 0], [hw * 1.06, 1.2, r * 0.76], Math.PI / 2));
    },
  },
  {
    // Squat storage tank with a shallow dome and a ladder cage.
    id: "tank",
    weight: 1,
    build: (m) => {
      const r = Math.min(m.w, m.d) * 0.94;
      const h = 4.5 + m.rng() * 2;
      m.out.push(cylinder([0, 0, 0], [r, h, r], "trim", true));
      m.out.push(dome([0, h, 0], [r, 0.9, r]));
      m.out.push(box([r * 0.48, 0, 0], [0.3, h + 0.6, 0.6], "accent", { grounded: true }));
    },
  },
];

/** Industrial wall height: one tall storey per floor, never lower than a truck dock. */
const shedHeight = (m: MassingContext): number => Math.max(5.5, m.H * 1.5);

const WAREHOUSE_TEMPLATES: readonly LotTemplate[] = [
  {
    id: "flat",
    weight: 2,
    build: (m) => {
      const h = shedHeight(m);
      m.out.push(box([0, 0, 0], [m.w, h, m.d], "wall", { grounded: true }));
      flatRoofTop(m.out, m.w, m.d, h, m.rng);
      m.out.push(box([0, 3.8, m.d / 2 + 1.2], [m.w * 0.6, 0.3, 2.4], "accent"));
    },
  },
  {
    // North-light sawtooth: a run of short gables across the shed.
    id: "sawtooth",
    weight: 2,
    build: (m) => {
      const h = shedHeight(m);
      m.out.push(box([0, 0, 0], [m.w, h, m.d], "wall", { grounded: true }));
      const teeth = Math.max(3, Math.min(7, Math.round(m.d / 5)));
      const span = m.d / teeth;
      for (let i = 0; i < teeth; i += 1) m.out.push(gable([0, h, -m.d / 2 + span * (i + 0.5)], [m.w, 1.6 + span * 0.12, span]));
    },
  },
  {
    // Portal-frame shed: one low wide gable spanning the full width.
    id: "portal",
    weight: 2,
    build: (m) => {
      const h = shedHeight(m);
      m.out.push(box([0, 0, 0], [m.w, h, m.d], "wall", { grounded: true }));
      m.out.push(gable([0, h, 0], [m.d * 1.02, 1.6 + m.w * 0.07, m.w * 1.02], Math.PI / 2));
      m.out.push(box([0, 0, m.d / 2 - 0.2], [Math.min(6, m.w * 0.3), 4.4, 0.5], "roof", { grounded: true }));
    },
  },
  {
    // Shed fronted by a two-storey office block on the street.
    id: "office",
    weight: 1.5,
    fits: (_w, d) => d >= 14,
    build: (m) => {
      const h = shedHeight(m);
      const od = Math.min(9, m.d * 0.3);
      m.out.push(box([0, 0, -od / 2], [m.w, h, m.d - od], "wall", { grounded: true }));
      flatCap(m.out, m.w, m.d - od, h, 0, -od / 2);
      const ow = m.w * (0.45 + m.rng() * 0.25);
      const oh = Math.max(m.fh * 2, 6.2);
      m.out.push(box([(m.w - ow) / 2 * (m.rng() < 0.5 ? 1 : -1), 0, m.d / 2 - od / 2], [ow, oh, od], "wall", { grounded: true, banded: true }));
      m.out.push(box([0, oh, m.d / 2 - od / 2], [ow, 0.2, od], "roof"));
    },
  },
  {
    // Process shed with a pair of storage tanks standing in its yard.
    id: "tanks",
    weight: 1.2,
    fits: (w) => w >= 16,
    build: (m) => {
      const h = shedHeight(m);
      const sw = m.w * 0.64;
      m.out.push(box([-m.w / 2 + sw / 2, 0, 0], [sw, h, m.d], "wall", { grounded: true }));
      flatCap(m.out, sw, m.d, h, -m.w / 2 + sw / 2, 0);
      const r = Math.min(m.w - sw, m.d / 2) * 0.86;
      const tx = m.w / 2 - r / 2 - 0.2;
      for (const z of [-m.d / 4, m.d / 4]) {
        const th = h + 2 + m.rng() * 4;
        m.out.push(cylinder([tx, 0, z], [r, th, r], "trim", true));
        m.out.push(dome([tx, th, z], [r, 0.8, r]));
      }
    },
  },
];

const CLASS_TEMPLATES: Record<CityLotClass, readonly LotTemplate[]> = {
  tower: TOWER_TEMPLATES,
  slab: SLAB_TEMPLATES,
  shop: SHOP_TEMPLATES,
  rowhouse: ROWHOUSE_TEMPLATES,
  house: HOUSE_TEMPLATES,
  mansion: MANSION_TEMPLATES,
  farmhouse: FARMHOUSE_TEMPLATES,
  barn: BARN_TEMPLATES,
  silo: SILO_TEMPLATES,
  warehouse: WAREHOUSE_TEMPLATES,
};

/** The named massing templates each class composes from, in pick order. */
export const CITY_LOT_TEMPLATES: Readonly<Record<CityLotClass, readonly string[]>> = {
  tower: TOWER_TEMPLATES.map((template) => template.id),
  slab: SLAB_TEMPLATES.map((template) => template.id),
  shop: SHOP_TEMPLATES.map((template) => template.id),
  rowhouse: ROWHOUSE_TEMPLATES.map((template) => template.id),
  house: HOUSE_TEMPLATES.map((template) => template.id),
  mansion: MANSION_TEMPLATES.map((template) => template.id),
  farmhouse: FARMHOUSE_TEMPLATES.map((template) => template.id),
  barn: BARN_TEMPLATES.map((template) => template.id),
  silo: SILO_TEMPLATES.map((template) => template.id),
  warehouse: WAREHOUSE_TEMPLATES.map((template) => template.id),
};

/**
 * Pick the massing template a lot of this class and size uses, weighted among those that suit it
 * (a twin tower needs width, a tall spire needs floors), from a roll in [0, 1). `compact` (0..1, how
 * solidly the block fills) makes templates that leave ground open at grade rarer. @internal
 */
export function pickLotTemplate(cls: CityLotClass, width: number, depth: number, floors: number, roll: number, compact = 0): string {
  const all = CLASS_TEMPLATES[cls];
  const suited = all.filter((template) => template.fits === undefined || template.fits(width, depth, floors));
  const pool = suited.length > 0 ? suited : all;
  const weight = (template: LotTemplate): number => template.weight * (template.open === true ? 1 - 0.85 * Math.min(1, Math.max(0, compact)) : 1);
  return (pickWeighted(() => roll, pool, weight) ?? pool[0]!).id;
}

/**
 * Compose the massing pieces for one lot. Deterministic per `rng` stream: the same class, size,
 * floors, template and stream always yield the identical silhouette. Without a `template` the
 * stream's first draw picks one ({@link pickLotTemplate}). Sizes are in meters, lot-local.
 * @internal
 */
export function buildLotPieces(
  cls: CityLotClass,
  width: number,
  depth: number,
  floors: number,
  floorHeight: number,
  rng: () => number,
  template?: string,
): CityLotPiece[] {
  const id = template ?? pickLotTemplate(cls, width, depth, floors, rng());
  const recipe = CLASS_TEMPLATES[cls].find((entry) => entry.id === id) ?? CLASS_TEMPLATES[cls][0]!;
  const out: CityLotPiece[] = [];
  recipe.build({ w: width, d: depth, floors, fh: floorHeight, H: Math.max(1, floors) * floorHeight, rng, out });
  return out;
}

// ---------------------------------------------------------------------------
// Landmarks — block-scale buildings placed by the landmark pass, NOT rolled per lot.
// Each takes a whole block, so a city gets a handful of stadium/mall/campus/civic-hall/skyscraper/
// church footprints several times larger than their neighbours.
// ---------------------------------------------------------------------------

/**
 * A block-scale landmark class. Unlike {@link CityLotClass} these are never weighted into a zone
 * mix — the city kind's landmark pass (the `landmarks` rule) gives one a whole buildable block. Each
 * expresses with the same piece shapes at a much larger footprint (~30–90 m).
 */
export type CityLandmarkClass = "hall" | "arena" | "market" | "campus" | "skyscraper" | "church";

/** All landmark classes, for schema hints, validation, and default allow-lists. */
export const CITY_LANDMARK_CLASSES: readonly CityLandmarkClass[] = ["hall", "arena", "market", "campus", "skyscraper", "church"];

/** Floor-count range per landmark (height = floors × floorHeight). */
const LANDMARK_FLOORS: Record<CityLandmarkClass, readonly [number, number]> = {
  hall: [2, 3],
  arena: [3, 5],
  market: [1, 2],
  campus: [3, 6],
  skyscraper: [40, 80],
  church: [3, 4],
};

/** Which landmark classes each zone band favours (weighted), like the zone mixes. */
const LANDMARK_ZONE_MIX: Record<CityZoneBand, readonly { cls: CityLandmarkClass; weight: number }[]> = {
  core: [
    { cls: "hall", weight: 3 },
    { cls: "market", weight: 2 },
    { cls: "church", weight: 1 },
    { cls: "arena", weight: 1 },
  ],
  mid: [
    { cls: "arena", weight: 2 },
    { cls: "campus", weight: 2 },
    { cls: "market", weight: 2 },
    { cls: "church", weight: 1 },
  ],
  edge: [
    { cls: "campus", weight: 2 },
    { cls: "arena", weight: 1 },
    { cls: "church", weight: 1 },
  ],
};

/** Weighted pick of the landmark class a block in `zone` gets, from a roll in [0, 1). @internal */
export function pickLandmarkClass(zone: CityZoneBand, roll: number): CityLandmarkClass {
  const entries = LANDMARK_ZONE_MIX[zone];
  const entry = pickWeighted(() => roll, entries, (e) => e.weight);
  return entry === undefined ? entries[entries.length - 1]!.cls : entry.cls;
}

/** Roll a landmark's floor count from its range, never above `cap`. @internal */
export function landmarkFloors(cls: CityLandmarkClass, rng: () => number, cap = Infinity): number {
  return Math.max(1, Math.min(cap, Math.round(range(rng, LANDMARK_FLOORS[cls]))));
}

/**
 * Compose the massing pieces for one landmark parcel, filling the given `width`×`depth` footprint
 * (lot-local, x along frontage, z into the block). Deterministic per `rng`. Every piece is kept
 * inside the `[-width/2, width/2] × [-depth/2, depth/2]` box. Sizes are in meters.
 * @internal
 */
export function buildLandmarkPieces(
  cls: CityLandmarkClass,
  width: number,
  depth: number,
  floors: number,
  floorHeight: number,
  rng: () => number,
): CityLotPiece[] {
  const H = Math.max(1, floors) * floorHeight;
  const pieces: CityLotPiece[] = [];
  switch (cls) {
    case "hall": {
      // Civic block: broad walled base, an entablature, a fronting colonnade, and a central dome.
      const bw = width * 0.96;
      const bd = depth * 0.96;
      pieces.push(box([0, 0, 0], [bw, H, bd], "wall", { grounded: true }));
      pieces.push(box([0, H, 0], [bw, 0.6, bd], "trim"));
      const cols = Math.max(4, Math.min(16, Math.round(bw / 6)));
      const colH = H * 0.92;
      const zFront = bd / 2 - 0.6;
      for (let i = 0; i < cols; i += 1) {
        const t = i / (cols - 1);
        pieces.push(box([(t - 0.5) * (bw - 1.4), 0, zFront], [0.7, colH, 0.7], "trim", { grounded: true }));
      }
      pieces.push(box([0, colH, zFront], [bw - 1.0, 0.5, 1.6], "roof"));
      const dd = Math.min(bw, bd) * (0.4 + rng() * 0.06);
      pieces.push(dome([0, H, 0], [dd, dd * 0.55, dd]));
      return pieces;
    }
    case "arena": {
      // Bowl: an elliptical outer wall, a rim ring, and a sunken inner field ring.
      const ow = width * 0.94;
      const od = depth * 0.94;
      pieces.push({ shape: "cylinder", offset: [0, 0, 0], size: [ow, H, od], rotationY: 0, role: "wall", grounded: true, banded: true });
      pieces.push(cylinder([0, H, 0], [ow * 0.99, 0.9, od * 0.99], "trim", false));
      pieces.push(cylinder([0, 0, 0], [ow * 0.66, H * 0.5, od * 0.66], "accent", true));
      if (rng() < 0.6) pieces.push(box([0, H, 0], [1.4, 3 + rng() * 3, 1.4], "trim"));
      return pieces;
    }
    case "market": {
      // Broad low gabled hall with a clerestory and an open stall face on the street side.
      const bw = width * 0.97;
      const bd = depth * 0.95;
      pieces.push(box([0, 0, 0], [bw, H, bd], "wall", { grounded: true }));
      const roofH = Math.min(4 + rng() * 2, bd * 0.4);
      pieces.push(gable([0, H, 0], [bw, roofH, bd]));
      pieces.push(box([0, H, 0], [bw * 0.5, roofH * 0.5, bd * 0.25], "accent"));
      pieces.push(box([0, Math.min(H - 0.5, 3), bd / 2 - 0.4], [bw * 0.94, 0.4, 1.0], "accent"));
      return pieces;
    }
    case "campus": {
      // Courtyard: four connected slab wings around an open center, varied heights.
      const bw = width * 0.96;
      const bd = depth * 0.96;
      const wingT = Math.min(bw, bd) * 0.22;
      const innerD = Math.max(1, bd - 2 * wingT);
      const wings: readonly (readonly [number, number, number, number, number])[] = [
        [0, (bd - wingT) / 2, bw, wingT, H * (0.9 + rng() * 0.2)],
        [0, -(bd - wingT) / 2, bw, wingT, H * (0.85 + rng() * 0.2)],
        [(bw - wingT) / 2, 0, wingT, innerD, H * (1.0 + rng() * 0.2)],
        [-(bw - wingT) / 2, 0, wingT, innerD, H * (0.9 + rng() * 0.25)],
      ];
      for (const [wx, wz, ww, wd, wh] of wings) pieces.push(box([wx, 0, wz], [ww, wh, wd], "wall", { grounded: true, banded: true }));
      for (const [wx, wz, ww, wd, wh] of wings) pieces.push(box([wx, wh, wz], [ww, 0.4, wd], "trim"));
      return pieces;
    }
    case "skyscraper": {
      // The district's signature tower: a plaza podium, a slender shaft in three setbacks, a lantern
      // crown and a mast — taller than anything the zone mix grows around it.
      const pw = width * 0.9;
      const pd = depth * 0.9;
      const ph = Math.min(H * 0.12, 5 * floorHeight);
      pieces.push(box([0, 0, 0], [pw, ph, pd], "wall", { grounded: true, banded: true }));
      pieces.push(box([0, ph, 0], [pw * 0.98, 0.2, pd * 0.98], "roof"));
      const sw = Math.min(pw * 0.55, 34);
      const sd = Math.min(pd * 0.55, 34);
      const tiers = [0.55, 0.25, 0.12];
      let y = ph;
      let scale = 1;
      for (const share of tiers) {
        const h = (H - ph) * share;
        pieces.push(box([0, y, 0], [sw * scale, h, sd * scale], "wall", { banded: true }));
        y += h;
        scale *= 0.8;
      }
      const lantern = H - y;
      pieces.push(box([0, y, 0], [sw * scale, lantern, sd * scale], "accent"));
      pieces.push(hip([0, H, 0], [sw * scale * 1.02, 3 + H * 0.03, sd * scale * 1.02]));
      pieces.push(box([0, H + 2, 0], [1.2, 12 + rng() * 14, 1.2], "trim"));
      return pieces;
    }
    case "church": {
      // Nave under a steep gable running into the block, a transept crossing, and a bell tower with
      // a tall hipped spire on the street front. The rest of the block is its churchyard.
      const nw = Math.min(width * 0.42, 16);
      const nd = Math.min(depth * 0.82, 44);
      const nh = Math.min(H, 12);
      pieces.push(box([0, 0, -depth * 0.04], [nw, nh, nd], "wall", { grounded: true }));
      pieces.push(gable([0, nh, -depth * 0.04], [nd * 1.02, nw * 0.7, nw * 1.06], Math.PI / 2));
      const tw = Math.min(width * 0.8, nw * 2.1);
      const tz = -depth * 0.04 - nd * 0.18;
      pieces.push(box([0, 0, tz], [tw, nh * 0.9, nw * 0.8], "wall", { grounded: true }));
      pieces.push(gable([0, nh * 0.9, tz], [tw * 1.02, nw * 0.6, nw * 0.86]));
      const bell = nw * 0.46;
      const bz = -depth * 0.04 + nd / 2 - bell / 2;
      const bh = nh * (2 + rng() * 0.6);
      pieces.push(box([0, 0, bz], [bell, bh, bell], "wall", { grounded: true }));
      pieces.push(hip([0, bh, bz], [bell * 1.04, bell * (2.4 + rng()), bell * 1.04]));
      return pieces;
    }
  }
}

/** Tree species a district's tree mix can weight — the renderer keeps one canopy mesh per species. */
export type CityTreeSpecies = "broadleaf" | "conifer" | "palm" | "cypress";

/** All species, for schema hints and validation. */
export const CITY_TREE_SPECIES: readonly CityTreeSpecies[] = ["broadleaf", "conifer", "palm", "cypress"];

const SPECIES_SET = new Set<string>(CITY_TREE_SPECIES);

/** Pick a species from a weighted mix; unknown items are ignored, an empty mix falls back to broadleaf. @internal */
export function pickSpecies(mix: readonly WeightedParamEntry[], roll: number): CityTreeSpecies {
  const entry = pickWeighted(
    () => roll,
    mix.filter((e) => SPECIES_SET.has(e.item)),
    (e) => e.weight,
  );
  return entry === undefined ? "broadleaf" : (entry.item as CityTreeSpecies);
}
