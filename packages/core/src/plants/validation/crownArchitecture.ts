import type { PlantSpecies } from "../species/plantSpecies";
import type { CrownForm } from "../species/plantSpecies";
import { CROWN_HULL_BINS, CROWN_HULL_SECTORS, type PlantStructure } from "../structure/plantStructure";
import { crownProfile } from "./crownAllometry";

/** Leaf area of one leaf of size `sizeM`, as the growth model counts it. */
const LEAF_AREA_PER_SIZE_SQ = 0.55;
/** Mean projection of a randomly oriented leaf onto a plane (spherical leaf angles). */
const PROJECTION = 0.5;

/** Measures of how a crown is built, beyond its size: where it forks, its main limbs and how open it is. */
export interface CrownArchitecture {
  /**
   * Diameter of the stoutest limb leaving the trunk in the lower `forkHeight` of the tree, over the
   * trunk's diameter where it leaves: 0.6 or more is a codominant fork (Gilman 2011), well under it a
   * leader running straight up.
   */
  forkRatio: number;
  /** Height of the lowest codominant fork (a limb {@link CODOMINANT_RATIO} of its stem or more) over the tree's height; 1 with none. */
  forkHeightShare: number;
  /** Limbs leaving a stem in the lower `forkHeight` of the tree at least `scaffoldRatio` of its diameter there. */
  scaffoldLimbs: number;
  /** Share of leaf area within `shellDepthShare` of the crown radius of the crown's outer surface. */
  shellShare: number;
  /** Share of the crown's side-on outline where sky shows through leaves and wood. */
  gapFraction: number;
  /** Mean angle from vertical of the limbs leaving the trunk at their base, degrees, weighted by cross-section. */
  limbAngleDeg: number;
  /** Where the crown carries its spread, 0 at its base and 1 at its top ({@link crownProfile}). */
  centroid: number;
  /** Radius three quarters up the crown over its widest radius ({@link crownProfile}). */
  shoulder: number;
}

/** A limb this share of the diameter of the stem it leaves, or more, is a codominant stem (Gilman 2011). */
export const CODOMINANT_RATIO = 0.6;

/** Thresholds {@link crownArchitecture} reads limbs and the leaf shell with. */
export interface CrownArchitectureOptions {
  /** Share of the tree's height, from the ground, a fork is looked for in; default 0.6. */
  forkHeight?: number;
  /** Limb over the diameter of the stem it leaves that counts as a scaffold limb; default 1/3. */
  scaffoldRatio?: number;
  /** Depth of the outer leaf shell as a share of crown radius; default 0.25. */
  shellDepthShare?: number;
  /** Side views averaged for the gap fraction; default 4. */
  views?: number;
  /** Raster cells across the crown height for the gap fraction; default 64. */
  cells?: number;
}

/**
 * How a crown is built. A decurrent (deliquescent) broadleaf loses its leader and divides low into a
 * few large scaffold limbs, an excurrent conifer keeps one stem with thin whorled branches (Brown,
 * McAlpine & Kormanik 1967; Zimmermann & Brown 1971); a branch over a third of the trunk's diameter is
 * a scaffold limb and one past about 0.6 a codominant stem (Gilman 2011). Shade-tolerant trees hold
 * their leaves in a thin outer shell, intolerant ones through the crown (Horn 1971); the gap fraction
 * reads sky through the crown side-on by Beer–Lambert extinction of the projected leaf area in each
 * cell, the complement of the shade factor photographed within a crown's perimeter (McPherson et al. 2018).
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function crownArchitecture(structure: PlantStructure, options: CrownArchitectureOptions = {}): CrownArchitecture {
  const forkHeight = options.forkHeight ?? 0.6;
  const scaffoldRatio = options.scaffoldRatio ?? 1 / 3;
  const { start, end, radiusStart, radiusEnd, parent, order } = structure.segments;
  const height = Math.max(1e-6, structure.stats.heightM);
  let fork = 0;
  let lowestFork = height;
  let scaffolds = 0;
  let angleSum = 0;
  let angleWeight = 0;
  // Each stem segment's thickest child carries the stem on; every other child is a limb leaving it,
  // a branch or a codominant stem alike.
  const carrier = new Int32Array(order.length).fill(-1);
  for (let i = 0; i < order.length; i += 1) {
    const p = parent[i] ?? -1;
    if (p < 0 || order[p] !== 0) continue;
    const held = carrier[p] ?? -1;
    if (held < 0 || (radiusStart[i] ?? 0) > (radiusStart[held] ?? 0)) carrier[p] = i;
  }
  for (let i = 0; i < order.length; i += 1) {
    const p = parent[i] ?? -1;
    if (p < 0 || order[p] !== 0 || carrier[p] === i) continue;
    const limb = radiusStart[i] ?? 0;
    const dx = (end[i * 3] ?? 0) - (start[i * 3] ?? 0);
    const dy = (end[i * 3 + 1] ?? 0) - (start[i * 3 + 1] ?? 0);
    const dz = (end[i * 3 + 2] ?? 0) - (start[i * 3 + 2] ?? 0);
    const along = Math.hypot(dx, dy, dz);
    if (along > 0) {
      angleSum += limb * limb * Math.acos(Math.max(-1, Math.min(1, dy / along)));
      angleWeight += limb * limb;
    }
    const ratio = limb / Math.max(1e-6, radiusEnd[p] ?? 0);
    const y = start[i * 3 + 1] ?? 0;
    if (ratio >= CODOMINANT_RATIO && y < lowestFork) lowestFork = y;
    if (y > forkHeight * height) continue;
    fork = Math.max(fork, ratio);
    if (ratio >= scaffoldRatio) scaffolds += 1;
  }
  return {
    forkRatio: fork,
    forkHeightShare: Math.max(0, lowestFork) / height,
    scaffoldLimbs: scaffolds,
    shellShare: shellShare(structure, options.shellDepthShare ?? 0.25),
    gapFraction: gapFraction(structure, options.views ?? 4, options.cells ?? 64, start, end, radiusStart, radiusEnd),
    limbAngleDeg: angleWeight > 0 ? (angleSum / angleWeight) * (180 / Math.PI) : 0,
    ...crownProfile(structure),
  };
}

function hullRadius(hull: Float32Array, y: number, x: number, z: number): number {
  const bottom = hull[0] ?? 0;
  const top = hull[1] ?? 0;
  const span = Math.max(1e-6, top - bottom);
  const bin = Math.min(CROWN_HULL_BINS - 1, Math.max(0, Math.floor(((y - bottom) / span) * CROWN_HULL_BINS)));
  const angle = Math.atan2(z, x);
  const sector = Math.min(CROWN_HULL_SECTORS - 1, Math.max(0, Math.floor((((angle + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * CROWN_HULL_SECTORS)));
  return hull[2 + bin * CROWN_HULL_SECTORS + sector] ?? 0;
}

function shellShare(structure: PlantStructure, depthShare: number): number {
  const hull = structure.crownHull;
  const depthM = Math.max(0.25, depthShare * structure.stats.crownRadiusM);
  const top = hull[1] ?? 0;
  const { position, size, count } = structure.leaves;
  let shell = 0;
  let total = 0;
  for (let row = 0; row < size.length; row += 1) {
    const x = position[row * 3] ?? 0;
    const y = position[row * 3 + 1] ?? 0;
    const z = position[row * 3 + 2] ?? 0;
    const s = size[row] ?? 0;
    const area = (count[row] ?? 1) * s * s;
    const depth = Math.min(hullRadius(hull, y, x, z) - Math.hypot(x, z), top - y);
    total += area;
    if (depth <= depthM) shell += area;
  }
  return total > 0 ? shell / total : 0;
}

function gapFraction(structure: PlantStructure, views: number, cells: number, start: Float32Array, end: Float32Array, radiusStart: Float32Array, radiusEnd: Float32Array): number {
  const hull = structure.crownHull;
  const bottom = hull[0] ?? 0;
  const top = hull[1] ?? 0;
  const span = top - bottom;
  if (span <= 0) return 0;
  const cell = span / cells;
  const half = Math.max(structure.stats.crownRadiusM, cell) * 1.05;
  const cols = Math.max(1, Math.ceil((2 * half) / cell));
  const { position, size, count } = structure.leaves;
  let gapSum = 0;
  let crownCells = 0;
  for (let view = 0; view < views; view += 1) {
    const angle = (view / views) * Math.PI;
    const ax = Math.cos(angle);
    const az = Math.sin(angle);
    const leafArea = new Float64Array(cols * cells);
    const wood = new Uint8Array(cols * cells);
    const colOf = (x: number, z: number): number => Math.floor((x * ax + z * az + half) / cell);
    const rowOf = (y: number): number => Math.floor((y - bottom) / cell);
    for (let row = 0; row < size.length; row += 1) {
      const x = position[row * 3] ?? 0;
      const y = position[row * 3 + 1] ?? 0;
      const z = position[row * 3 + 2] ?? 0;
      const s = size[row] ?? 0;
      const area = (count[row] ?? 1) * LEAF_AREA_PER_SIZE_SQ * s * s;
      // A node's leaves reach out from it by up to a leaf's length: spread their area over the cells
      // whose centres lie within that reach, side-on, or over the node's own cell when it is smaller.
      const u = (x * ax + z * az + half) / cell;
      const v = (y - bottom) / cell;
      const reach = s / cell;
      const c0 = Math.max(0, Math.floor(u - reach));
      const c1 = Math.min(cols - 1, Math.floor(u + reach));
      const r0 = Math.max(0, Math.floor(v - reach));
      const r1 = Math.min(cells - 1, Math.floor(v + reach));
      let covered = 0;
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) if ((c + 0.5 - u) ** 2 + (r + 0.5 - v) ** 2 <= reach * reach) covered += 1;
      }
      if (covered === 0) {
        const c = Math.floor(u);
        const r = Math.floor(v);
        if (c >= 0 && c < cols && r >= 0 && r < cells) leafArea[r * cols + c] = (leafArea[r * cols + c] ?? 0) + area;
        continue;
      }
      const share = area / covered;
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) if ((c + 0.5 - u) ** 2 + (r + 0.5 - v) ** 2 <= reach * reach) leafArea[r * cols + c] = (leafArea[r * cols + c] ?? 0) + share;
      }
    }
    for (let i = 0; i < radiusStart.length; i += 1) {
      // Only wood at least a cell wide hides the sky behind a whole cell.
      if (2 * Math.max(radiusStart[i] ?? 0, radiusEnd[i] ?? 0) < cell) continue;
      const c0 = colOf(start[i * 3] ?? 0, start[i * 3 + 2] ?? 0);
      const r0 = rowOf(start[i * 3 + 1] ?? 0);
      const c1 = colOf(end[i * 3] ?? 0, end[i * 3 + 2] ?? 0);
      const r1 = rowOf(end[i * 3 + 1] ?? 0);
      const steps = Math.max(1, Math.abs(c1 - c0), Math.abs(r1 - r0));
      for (let k = 0; k <= steps; k += 1) {
        const c = Math.round(c0 + ((c1 - c0) * k) / steps);
        const r = Math.round(r0 + ((r1 - r0) * k) / steps);
        if (c >= 0 && c < cols && r >= 0 && r < cells) wood[r * cols + c] = 1;
      }
    }
    for (let r = 0; r < cells; r += 1) {
      // The crown's outline on this row: from its first to its last leafy or woody cell.
      let first = -1;
      let last = -1;
      for (let c = 0; c < cols; c += 1) {
        if ((leafArea[r * cols + c] ?? 0) > 0 || (wood[r * cols + c] ?? 0) === 1) {
          if (first < 0) first = c;
          last = c;
        }
      }
      for (let c = first; c >= 0 && c <= last; c += 1) {
        crownCells += 1;
        if ((wood[r * cols + c] ?? 0) === 1) continue;
        gapSum += Math.exp((-PROJECTION * (leafArea[r * cols + c] ?? 0)) / (cell * cell));
      }
    }
  }
  return crownCells > 0 ? gapSum / crownCells : 0;
}

/** The measures of a {@link CrownArchitecture}, in a fixed order. */
export const CROWN_ARCHITECTURE_MEASURES = ["forkRatio", "forkHeightShare", "scaffoldLimbs", "shellShare", "gapFraction", "limbAngleDeg", "centroid", "shoulder"] as const satisfies readonly (keyof CrownArchitecture)[];

/** Age in years an open-grown tree is held to its {@link CrownArchitectureTarget}. */
export const CROWN_ARCHITECTURE_AGE = 40;

/** Closed band `[low, high]` a measure must fall in. */
export type MeasureBand = readonly [low: number, high: number];

/** Bands a species' open-grown crown falls in at {@link CROWN_ARCHITECTURE_AGE}; an absent band is not checked. */
export type CrownArchitectureTarget = Partial<Record<keyof CrownArchitecture, MeasureBand>>;

/** Crown-shape bands of one crown form at one age; `widthPerHeight` bounds crown width over tree height. */
export interface CrownShapeBands {
  centroid: MeasureBand;
  shoulder?: MeasureBand;
  widthPerHeight?: MeasureBand;
}

/**
 * Where a crown of each form carries its spread at `ageYears` (Brown, McAlpine & Kormanik 1967). A decurrent crown carries it near mid-crown with full
 * shoulders, rounder with age: its centroid sits between the paraboloid's 0.33 and the sphere's 0.5,
 * and its shoulder above the paraboloid's 0.5 once mature. An excurrent crown tapers like a cone to
 * its leader. A columnar crown keeps its width up the crown and stays under 0.4 of the tree's height
 * across once mature.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function crownShapeBands(form: CrownForm, ageYears: number): CrownShapeBands {
  const mature = ageYears >= 50;
  if (form === "decurrent") return { centroid: [0.4, 0.66], shoulder: [mature ? 0.64 : 0.49, 2] };
  if (form === "columnar") return { centroid: [0.25, 0.55], shoulder: [0.5, 2], ...(mature ? { widthPerHeight: [0, 0.4] as const } : {}) };
  return { centroid: [0, 0.33], ...(mature ? { shoulder: [0, 0.42] as const } : {}) };
}

/**
 * Guardrails an open-grown tree's crown stays inside at {@link CROWN_ARCHITECTURE_AGE} years, by crown
 * form and shade tolerance: loose bands that catch a crown of the wrong kind, not a species' exact
 * shape, which its own traits set. A decurrent tree grown in the open divides into codominant stems
 * within the lower 60% of its height, where an open-grown crown's base already sits (Zimmermann &
 * Brown 1971; Gilman 2011), and carries its spread no lower than a cone would (centroid 0.37; a cone
 * is 0.25). An excurrent, columnar or weeping tree keeps its leader, and an excurrent one tapers to it.
 * A broadleaf crown in leaf, of any form, shows sky through at most 38% of its outline: foliage and
 * branches cover 62% (honey locust) to 93% of the sky within the crown perimeter of 47 urban species,
 * 70–90% for most, and the cover stops rising once a tree passes about 20 years or 30 cm DBH
 * (McPherson et al. 2018); individual trees of one species reach 98%. A shade-tolerant decurrent
 * broadleaf holds its leaves as a monolayer in the outer shell (Horn 1971), more than a crown filled
 * evenly would (0.58 in the outer quarter). Shrubs, palms and herbs have none.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function crownArchitectureTarget(species: Pick<PlantSpecies, "architecture" | "tolerance" | "leaf">): CrownArchitectureTarget {
  const form = species.architecture.crownForm;
  if (form === undefined) return {};
  const kind = species.leaf.shape.kind;
  const broadleaf = species.leaf.lifespanYears <= 1 && kind !== "needle" && kind !== "scale";
  const density = broadleaf ? { gapFraction: [0.02, 0.38] as const } : {};
  if (form !== "decurrent") return { forkRatio: [0, CODOMINANT_RATIO], ...(form === "excurrent" ? { centroid: [0, 0.36] as const } : {}), ...density };
  return {
    forkRatio: [CODOMINANT_RATIO, Number.POSITIVE_INFINITY],
    forkHeightShare: [0, 0.6],
    centroid: [0.37, 1],
    ...density,
    ...(broadleaf && species.tolerance.shade >= 0.7 ? { shellShare: [0.6, 1] as const } : {}),
  };
}

/** Seeds whose own individuals a species' crown guardrails are checked on: each grows its own tree. */
export const CROWN_ARCHITECTURE_SEEDS = ["a", "b", "c"] as const;

/** Seeds of {@link CROWN_ARCHITECTURE_SEEDS} that may miss a guardrail: an odd tree is allowed, a habit is not. */
export const CROWN_ARCHITECTURE_MISSES_ALLOWED = 1;

/**
 * The measures of `architecture` outside their band in `target`, as readable lines; empty when the
 * crown meets it.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function crownArchitectureMisses(target: CrownArchitectureTarget, architecture: CrownArchitecture): string[] {
  const misses: string[] = [];
  for (const key of CROWN_ARCHITECTURE_MEASURES) {
    const band = target[key];
    if (band === undefined) continue;
    const value = architecture[key];
    if (value < band[0] || value > band[1]) misses.push(`${key} ${Number(value.toFixed(3))} outside ${band[0]}..${band[1]}`);
  }
  return misses;
}
