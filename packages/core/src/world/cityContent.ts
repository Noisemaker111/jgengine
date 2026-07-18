/**
 * City content synthesis: the zone/class/massing layer of the `city` studio. Where `cityKind`
 * synthesizes the street NETWORK, this module decides what stands on it — which zone band a lot
 * falls in (core/mid/edge, invertible), which building class the band's weighted mix picks
 * (tower, slab, shop, rowhouse, house, mansion, farmhouse, barn, silo), and the deterministic
 * massing PIECES each class composes (boxes, gable prisms, cylinders, domes with palette roles).
 * Pure data + seeded math — the shell renderer just instances the piece shapes, so every visual
 * variant is core-owned, testable, and identical per seed.
 *
 * @capability city-district zone bands, weighted building-class mixes, and per-class massing pieces
 */
import type { WeightedParamEntry } from "../scene/sceneKinds";

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
  | "silo";

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
];

/** Zone band a lot falls in: dense core, middle ring, or the district edge. */
export type CityZoneBand = "core" | "mid" | "edge";

/** How the radial zone metric maps to bands. */
export type CityZoneProfile = "core-out" | "inverted" | "uniform";

/** Primitive shapes massing pieces instance — the renderer keeps one InstancedMesh per shape. */
export type CityPieceShape = "box" | "gable" | "cylinder" | "dome";

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
  /** Floor-count range before the district floor clamp. */
  floors: readonly [number, number];
  /** Whether deep blocks may host a second back row of this class. */
  backRow: boolean;
}

const CLASS_PROFILES: Record<CityLotClass, ClassProfile> = {
  tower: { width: [16, 24], depth: [14, 20], setbackFactor: 0.3, spacingFactor: 1, floors: [12, 34], backRow: true },
  slab: { width: [14, 20], depth: [11, 15], setbackFactor: 0.5, spacingFactor: 1, floors: [4, 9], backRow: true },
  shop: { width: [10, 15], depth: [8, 12], setbackFactor: 0.2, spacingFactor: 0.6, floors: [1, 2], backRow: true },
  rowhouse: { width: [6, 8.5], depth: [9, 12], setbackFactor: 0.5, spacingFactor: 0.12, floors: [2, 3], backRow: true },
  house: { width: [9, 12], depth: [8, 11], setbackFactor: 1, spacingFactor: 1, floors: [1, 2], backRow: true },
  mansion: { width: [18, 26], depth: [14, 20], setbackFactor: 2, spacingFactor: 1.6, floors: [2, 3], backRow: false },
  farmhouse: { width: [11, 14], depth: [9, 12], setbackFactor: 2.8, spacingFactor: 4, floors: [2, 2], backRow: false },
  barn: { width: [12, 16], depth: [9, 13], setbackFactor: 3.6, spacingFactor: 5, floors: [1, 1], backRow: false },
  silo: { width: [5, 6], depth: [5, 6], setbackFactor: 4, spacingFactor: 3, floors: [1, 1], backRow: false },
};

/** Placement numbers a resolved lot carries out of the class profile. @internal */
export interface ClassPlacement {
  width: number;
  depth: number;
  setback: number;
  gap: number;
  floors: number;
  backRow: boolean;
}

function range(rng: () => number, [lo, hi]: readonly [number, number]): number {
  return lo + rng() * (hi - lo);
}

/**
 * Roll a class's lot dimensions/setback/floors from the district's placement dials. Setback keeps
 * only a whisper of jitter around `setbackBase × class factor`, so a street's frontage reads as an
 * aligned building wall; spacing likewise, so neighbors form rhythmic rows instead of scatter.
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
): ClassPlacement {
  const profile = CLASS_PROFILES[cls];
  const floors = Math.round(range(rng, profile.floors));
  return {
    width: range(rng, profile.width) * lotScale,
    depth: range(rng, profile.depth) * lotScale,
    setback: setbackBase * profile.setbackFactor * (0.9 + rng() * 0.2),
    gap: Math.max(0.2, spacingBase * profile.spacingFactor * (0.7 + rng() * 0.6)),
    floors: Math.max(floorsMin, Math.min(floorsMax, floors)),
    backRow: profile.backRow,
  };
}

/**
 * Normalized zone metric for a point in district-local space: 0 at the center line, 1 at the rim,
 * shaped to the district's rectangle (Chebyshev) so bands follow the volume's footprint.
 * @internal
 */
export function zoneMetric(x: number, z: number, hx: number, hz: number): number {
  return Math.min(1, Math.max(Math.abs(x) / Math.max(1e-6, hx), Math.abs(z) / Math.max(1e-6, hz)));
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

/** Pick a class from a weighted mix; unknown items are ignored, an empty mix falls back to `house`. @internal */
export function pickClass(mix: readonly WeightedParamEntry[], roll: number): CityLotClass {
  let total = 0;
  for (const entry of mix) if (CLASS_SET.has(entry.item) && entry.weight > 0) total += entry.weight;
  if (total <= 0) return "house";
  let cursor = roll * total;
  for (const entry of mix) {
    if (!CLASS_SET.has(entry.item) || entry.weight <= 0) continue;
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item as CityLotClass;
  }
  return "house";
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

function gable(
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  rotationY = 0,
): CityLotPiece {
  return { shape: "gable", offset, size, rotationY, role: "roof", grounded: false, banded: false };
}

/**
 * Compose the massing pieces for one lot. Deterministic per `rng` stream: the same class, size,
 * floors, and stream always yield the identical silhouette. Sizes are in meters, lot-local.
 * @internal
 */
export function buildLotPieces(
  cls: CityLotClass,
  width: number,
  depth: number,
  floors: number,
  floorHeight: number,
  rng: () => number,
): CityLotPiece[] {
  const H = Math.max(1, floors) * floorHeight;
  const pieces: CityLotPiece[] = [];
  switch (cls) {
    case "tower": {
      if (floors >= 14) {
        // Wedding-cake tiers: full-footprint shaft, then two setback tiers, parapet, maybe a spire.
        const h1 = H * (0.5 + rng() * 0.12);
        const h2 = H * (0.24 + rng() * 0.08);
        const h3 = H - h1 - h2;
        pieces.push(box([0, 0, 0], [width, h1, depth], "wall", { grounded: true, banded: true }));
        const w2 = width * (0.78 + rng() * 0.08);
        const d2 = depth * (0.78 + rng() * 0.08);
        pieces.push(box([0, h1, 0], [w2, h2, d2], "wall", { banded: true }));
        const w3 = width * (0.55 + rng() * 0.1);
        const d3 = depth * (0.55 + rng() * 0.1);
        pieces.push(box([0, h1 + h2, 0], [w3, h3, d3], "wall", { banded: true }));
        pieces.push(box([0, H, 0], [w3 * 1.04, 0.5, d3 * 1.04], "trim"));
        if (rng() < 0.35) pieces.push(box([0, H + 0.5, 0], [1.2, 3 + rng() * 5, 1.2], "trim"));
        else if (rng() < 0.5) pieces.push(box([0, H + 0.5, 0], [w3 * 0.4, 1.6, d3 * 0.4], "roof"));
      } else {
        const h1 = H * (0.66 + rng() * 0.1);
        pieces.push(box([0, 0, 0], [width, h1, depth], "wall", { grounded: true, banded: true }));
        const w2 = width * (0.72 + rng() * 0.1);
        const d2 = depth * (0.72 + rng() * 0.1);
        pieces.push(box([0, h1, 0], [w2, H - h1, d2], "wall", { banded: true }));
        pieces.push(box([0, H, 0], [w2 * 1.05, 0.45, d2 * 1.05], "trim"));
      }
      return pieces;
    }
    case "slab": {
      pieces.push(box([0, 0, 0], [width, H, depth * 0.95], "wall", { grounded: true, banded: true }));
      pieces.push(box([0, H, 0], [width * 1.02, 0.35, depth * 0.97], "trim"));
      if (rng() < 0.6) pieces.push(box([(rng() - 0.5) * width * 0.4, H + 0.35, 0], [width * 0.22, 2, depth * 0.3], "roof"));
      return pieces;
    }
    case "shop": {
      pieces.push(box([0, 0, 0], [width, H, depth], "wall", { grounded: true }));
      pieces.push(box([0, H, 0], [width * 1.03, 0.5, depth * 1.03], "trim"));
      // Front awning strip over the sidewalk face.
      pieces.push(box([0, Math.min(H - 0.4, 2.6), depth / 2 + 0.35], [width * 0.9, 0.35, 0.9], "accent"));
      return pieces;
    }
    case "rowhouse": {
      pieces.push(box([0, 0, 0], [width * 0.96, H, depth * 0.85], "wall", { grounded: true, banded: true }));
      if (rng() < 0.55) {
        pieces.push(gable([0, H, 0], [width * 0.96, 1.6 + rng() * 0.8, depth * 0.9]));
      } else {
        pieces.push(box([0, H, 0], [width * 1.0, 0.45, depth * 0.9], "trim"));
      }
      return pieces;
    }
    case "house": {
      const bw = width * (0.68 + rng() * 0.1);
      const bd = depth * (0.58 + rng() * 0.1);
      pieces.push(box([0, 0, 0], [bw, H, bd], "wall", { grounded: true }));
      const along = rng() < 0.5;
      pieces.push(gable([0, H, 0], along ? [bw * 1.08, 1.9 + rng() * 1.1, bd * 1.12] : [bd * 1.12, 1.9 + rng() * 1.1, bw * 1.08], along ? 0 : Math.PI / 2));
      if (rng() < 0.45) pieces.push(box([bw * (0.2 + rng() * 0.12), H + 1.2, bd * 0.1], [0.7, 1.6, 0.7], "trim"));
      if (rng() < 0.55) pieces.push(box([0, 0, bd / 2 + 0.8], [bw * 0.55, 0.25, 1.6], "trim", { grounded: true }));
      if (rng() < 0.4) {
        // Attached garage with its own low gable.
        const gw = bw * 0.5;
        const gx = (bw / 2 + gw / 2) * (rng() < 0.5 ? 1 : -1);
        pieces.push(box([gx, 0, bd * 0.05], [gw, H * 0.6, bd * 0.7], "wall", { grounded: true }));
        pieces.push(gable([gx, H * 0.6, bd * 0.05], [gw * 1.06, 1.1, bd * 0.75]));
      }
      return pieces;
    }
    case "mansion": {
      const cw = width * (0.42 + rng() * 0.08);
      const cd = depth * (0.5 + rng() * 0.08);
      pieces.push(box([0, 0, 0], [cw, H, cd], "wall", { grounded: true }));
      pieces.push(gable([0, H, 0], [cw * 1.1, 2.4 + rng() * 1, cd * 1.12]));
      for (const side of [-1, 1] as const) {
        const ww = width * (0.24 + rng() * 0.05);
        const wh = H * (0.72 + rng() * 0.15);
        const wd = cd * (0.75 + rng() * 0.15);
        const wx = side * (cw / 2 + ww / 2 - 0.3);
        pieces.push(box([wx, 0, 0], [ww, wh, wd], "wall", { grounded: true }));
        pieces.push(gable([wx, wh, 0], [wd * 1.1, 1.6 + rng() * 0.7, ww * 1.08], Math.PI / 2));
      }
      // Portico: a slab-and-posts entrance strip on the street face.
      pieces.push(box([0, 0, cd / 2 + 0.9], [cw * 0.4, 0.3, 1.8], "trim", { grounded: true }));
      pieces.push(box([0, H * 0.55, cd / 2 + 0.9], [cw * 0.42, 0.35, 1.9], "trim"));
      return pieces;
    }
    case "farmhouse": {
      const bw = width * 0.8;
      const bd = depth * 0.62;
      pieces.push(box([0, 0, 0], [bw, H, bd], "wall", { grounded: true }));
      pieces.push(gable([0, H, 0], [bw * 1.08, 2.2 + rng() * 0.8, bd * 1.12]));
      // Wrap-around porch slab + roof lip on the street face.
      pieces.push(box([0, 0, bd / 2 + 1], [bw * 0.9, 0.25, 2], "trim", { grounded: true }));
      pieces.push(box([0, H * 0.45, bd / 2 + 1], [bw * 0.92, 0.28, 2.1], "roof"));
      if (rng() < 0.5) pieces.push(box([bw * 0.25, H + 1.4, 0], [0.7, 1.7, 0.7], "trim"));
      return pieces;
    }
    case "barn": {
      const bw = width * 0.85;
      const bd = depth * 0.78;
      const wallH = 3 + rng() * 0.8;
      // Gambrel silhouette: squat walls, a steep lower gable, then a shallower upper gable.
      pieces.push(box([0, 0, 0], [bw, wallH, bd], "accent", { grounded: true }));
      pieces.push(gable([0, wallH, 0], [bw * 1.04, 1.7, bd * 1.06]));
      pieces.push(gable([0, wallH + 1.55, 0], [bw * 0.62, 1.3, bd * 1.06]));
      if (rng() < 0.6) {
        // Adjacent silo on a corner of the same parcel.
        const sx = (bw / 2 + 2.2) * (rng() < 0.5 ? 1 : -1);
        const sh = 7 + rng() * 3;
        pieces.push({ shape: "cylinder", offset: [sx, 0, -bd * 0.2], size: [4, sh, 4], rotationY: 0, role: "trim", grounded: true, banded: false });
        pieces.push({ shape: "dome", offset: [sx, sh, -bd * 0.2], size: [4, 1.6, 4], rotationY: 0, role: "roof", grounded: false, banded: false });
      }
      return pieces;
    }
    case "silo": {
      const sh = 8 + rng() * 4;
      pieces.push({ shape: "cylinder", offset: [0, 0, 0], size: [width * 0.8, sh, width * 0.8], rotationY: 0, role: "trim", grounded: true, banded: false });
      pieces.push({ shape: "dome", offset: [0, sh, 0], size: [width * 0.8, 1.8, width * 0.8], rotationY: 0, role: "roof", grounded: false, banded: false });
      if (rng() < 0.5) {
        const sw = width * 0.55;
        pieces.push({ shape: "cylinder", offset: [width * 0.75, 0, 0], size: [sw, sh * 0.75, sw], rotationY: 0, role: "trim", grounded: true, banded: false });
        pieces.push({ shape: "dome", offset: [width * 0.75, sh * 0.75, 0], size: [sw, 1.3, sw], rotationY: 0, role: "roof", grounded: false, banded: false });
      }
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
  let total = 0;
  for (const entry of mix) if (SPECIES_SET.has(entry.item) && entry.weight > 0) total += entry.weight;
  if (total <= 0) return "broadleaf";
  let cursor = roll * total;
  for (const entry of mix) {
    if (!SPECIES_SET.has(entry.item) || entry.weight <= 0) continue;
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item as CityTreeSpecies;
  }
  return "broadleaf";
}
