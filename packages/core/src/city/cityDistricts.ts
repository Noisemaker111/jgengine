/**
 * District field for the `city` studio: where a district's centres stand and how development falls
 * away from them. A city is not one bullseye — a main centre (the CBD) sits near the middle, larger
 * districts grow one to three secondary town centres around it, and a smooth domain warp bends every
 * band edge so zoning and heights follow organic contours instead of concentric squares. The same
 * field rates each spot's development INTENSITY (what slides floor counts through a class's range)
 * and an INDUSTRY tendency (where sheds and yards cluster), and names a block's CHARACTER — CBD, old
 * town, residential, industrial, waterfront, suburb or rural — which biases the band's class mix and
 * how fully its blocks fill. Pure seeded math, no rendering.
 *
 * @capability city-district multi-centre organic zoning field, intensity, and district character
 */
import type { CityLotClass, CityZoneBand, CityZoneProfile } from "./cityContent";

/** A block's district character: what kind of place it reads as. */
export type CityDistrictKind = "cbd" | "oldtown" | "residential" | "industrial" | "waterfront" | "suburb" | "rural";

/** One development centre in district-local XZ. The first is always the primary (CBD) centre. */
export interface CityCentre {
  x: number;
  z: number;
  primary: boolean;
}

/** The organic zoning field of one district (district-local XZ in metres). */
export interface CityDistrictField {
  readonly centres: readonly CityCentre[];
  /** Zone metric: ~0 at a centre, 1 at the rim — what the band extents threshold. */
  metric(x: number, z: number): number;
  /** Index into {@link CityDistrictField.centres} of the centre whose pull dominates this spot. */
  centreAt(x: number, z: number): number;
  /** Development intensity 0..1: drives floor counts within a class's range. */
  intensity(x: number, z: number): number;
  /** Industrial tendency 0..1: large smooth patches where sheds and yards cluster. */
  industry(x: number, z: number): number;
}

interface CentreShape {
  u: number;
  v: number;
  /** Metric at the centre itself (0 for the primary; secondaries never quite reach the CBD). */
  floor: number;
  /** Normalized radius over which the metric climbs from `floor` to 1. */
  reach: number;
}

/** A smooth deterministic value field in [-1, 1]: a few seeded plane waves summed. */
function waveField(rng: () => number, count: number, minFreq: number, maxFreq: number): (u: number, v: number) => number {
  const waves: { cx: number; cz: number; phase: number; amp: number }[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const freq = (minFreq + rng() * (maxFreq - minFreq)) * Math.PI;
    const amp = 1 / (1 + i * 0.6);
    waves.push({ cx: Math.cos(angle) * freq, cz: Math.sin(angle) * freq, phase: rng() * Math.PI * 2, amp });
    total += amp;
  }
  return (u, v) => {
    let sum = 0;
    for (const w of waves) sum += w.amp * Math.sin(u * w.cx + v * w.cz + w.phase);
    return sum / total;
  };
}

/** Superellipse norm (p = 2.6): rounder than the volume's Chebyshev square, squarer than a circle. */
function roundedNorm(du: number, dv: number): number {
  const p = 2.6;
  return Math.pow(Math.pow(Math.abs(du), p) + Math.pow(Math.abs(dv), p), 1 / p);
}

/**
 * Grow a district's zoning field. Footprints a few blocks across get only the primary centre; larger
 * ones add secondary centres (one per ~40 block cells, up to three) spread around it.
 */
export function cityDistrictField(options: {
  halfX: number;
  halfZ: number;
  blockSize: number;
  profile: CityZoneProfile;
  /** The band extents ({@link zoneBand}'s): intensity spans each band's range so a core always runs hot. */
  coreExtent: number;
  midExtent: number;
  rng: (stream: string) => () => number;
  /** Pin the primary centre (district-local XZ) instead of rolling it near the middle — a village's junction. */
  primary?: readonly [number, number] | undefined;
}): CityDistrictField {
  const { halfX: hx, halfZ: hz, profile } = options;
  const layout = options.rng("districts");
  const cells = (4 * hx * hz) / Math.max(1, options.blockSize * options.blockSize);
  const secondaries = cells < 14 ? 0 : cells < 45 ? 1 : cells < 130 ? 2 : 3;
  const rolledU = (layout() - 0.5) * 0.3;
  const rolledV = (layout() - 0.5) * 0.3;
  const pin = options.primary;
  const shapes: CentreShape[] = [
    pin === undefined
      ? { u: rolledU, v: rolledV, floor: 0, reach: 1 }
      : { u: pin[0] / Math.max(1e-6, hx), v: pin[1] / Math.max(1e-6, hz), floor: 0, reach: 1 },
  ];
  const start = layout() * Math.PI * 2;
  for (let i = 0; i < secondaries; i += 1) {
    const angle = start + (i / Math.max(1, secondaries)) * Math.PI * 2 + (layout() - 0.5) * 0.9;
    const radius = 0.5 + layout() * 0.24;
    shapes.push({ u: Math.cos(angle) * radius, v: Math.sin(angle) * radius, floor: 0.06 + layout() * 0.12, reach: 0.5 + layout() * 0.14 });
  }
  const warpU = waveField(options.rng("warp-u"), 3, 0.7, 1.6);
  const warpV = waveField(options.rng("warp-v"), 3, 0.7, 1.6);
  const fine = waveField(options.rng("fine"), 4, 2.2, 4.2);
  const industryWave = waveField(options.rng("industry"), 3, 0.8, 1.7);
  const toUV = (x: number, z: number): readonly [number, number] => {
    const u = x / Math.max(1e-6, hx);
    const v = z / Math.max(1e-6, hz);
    return [u + 0.14 * warpU(u, v), v + 0.14 * warpV(u, v)];
  };
  const pull = (x: number, z: number): { metric: number; centre: number } => {
    const [u, v] = toUV(x, z);
    let best = Infinity;
    let centre = 0;
    shapes.forEach((shape, i) => {
      const d = roundedNorm(u - shape.u, v - shape.v);
      const m = shape.floor + (d / shape.reach) * (1 - shape.floor);
      if (m < best) {
        best = m;
        centre = i;
      }
    });
    return { metric: Math.min(1, Math.max(0, best + 0.035 * fine(x / Math.max(1e-6, hx), z / Math.max(1e-6, hz)))), centre };
  };
  return {
    centres: shapes.map((shape, i) => ({ x: shape.u * hx, z: shape.v * hz, primary: i === 0 })),
    metric: (x, z) => pull(x, z).metric,
    centreAt: (x, z) => pull(x, z).centre,
    intensity: (x, z) => {
      const u = x / Math.max(1e-6, hx);
      const v = z / Math.max(1e-6, hz);
      let base: number;
      if (profile === "uniform") base = 0.5 + 0.3 * warpU(v, u);
      else {
        // Piecewise along the band extents, so a core is always intense however wide it is drawn:
        // core → 0.6..1, mid → 0.25..0.6, edge → 0..0.25.
        const metric = pull(x, z).metric;
        const t = profile === "inverted" ? 1 - metric : metric;
        const core = Math.max(1e-3, options.coreExtent);
        const mid = Math.max(core + 1e-3, options.midExtent);
        base = t < core ? 0.6 + 0.4 * (1 - t / core) : t < mid ? 0.25 + 0.35 * (1 - (t - core) / (mid - core)) : 0.25 * Math.max(0, 1 - (t - mid) / Math.max(1e-3, 1 - mid));
      }
      return Math.min(1, Math.max(0, base + 0.07 * fine(v * 1.3, u * 1.3)));
    },
    industry: (x, z) => 0.5 + 0.5 * industryWave(x / Math.max(1e-6, hx), z / Math.max(1e-6, hz)),
  };
}

/** Industry tendency above which a mid/edge block with sheds in its mix reads as an industrial estate. */
const INDUSTRIAL_THRESHOLD = 0.64;

/**
 * Name a block's character from its band, the centre that dominates it, the industry field, whether
 * it fronts water, and which classes its mix can grow at all.
 */
export function districtCharacter(options: {
  band: CityZoneBand;
  primaryCentre: boolean;
  industry: number;
  waterfront: boolean;
  mix: readonly { item: string; weight: number }[];
}): CityDistrictKind {
  const has = (cls: CityLotClass): boolean => options.mix.some((entry) => entry.item === cls && entry.weight > 0);
  if (options.waterfront && options.band !== "edge") return "waterfront";
  const farm = has("farmhouse") || has("barn") || has("silo");
  if (options.band === "core") return options.primaryCentre ? "cbd" : "oldtown";
  if (has("warehouse") && options.industry > INDUSTRIAL_THRESHOLD) return "industrial";
  if (options.band === "mid") return "residential";
  if (options.waterfront) return "waterfront";
  return farm ? "rural" : "suburb";
}

/** How a character reweights its band's class mix (classes the mix lacks stay absent). */
export const CHARACTER_CLASS_BIAS: Readonly<Record<CityDistrictKind, Partial<Record<CityLotClass, number>>>> = {
  cbd: { tower: 1.6, slab: 1, shop: 0.7, rowhouse: 0.4, house: 0.2, warehouse: 0.05 },
  oldtown: { shop: 1.8, rowhouse: 1.8, slab: 0.9, tower: 0.3, house: 0.6, warehouse: 0.05 },
  residential: { rowhouse: 1.3, slab: 1.1, house: 1.1, shop: 0.8, tower: 0.6, warehouse: 0.08 },
  industrial: { warehouse: 10, slab: 0.4, shop: 0.5, house: 0.15, rowhouse: 0.15, tower: 0.2 },
  waterfront: { slab: 1.4, tower: 1.2, warehouse: 1.6, shop: 1.2, house: 0.7 },
  suburb: { house: 1.3, mansion: 1.2, rowhouse: 0.8, warehouse: 0.12 },
  rural: {},
};

/**
 * How fully a character's blocks fill, as a multiplier on the district's `blockDensity`: a CBD
 * consumes its blocks wall to wall, a suburb keeps its yards.
 */
export const CHARACTER_FILL: Readonly<Record<CityDistrictKind, number>> = {
  cbd: 1.2,
  oldtown: 1.1,
  waterfront: 1,
  residential: 0.9,
  industrial: 0.95,
  suburb: 0.6,
  rural: 0.4,
};
