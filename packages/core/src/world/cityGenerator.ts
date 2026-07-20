/**
 * The seed-driven procedural CITY GENERATOR — plot-first composition over the street and block
 * engines. {@link generateStreets} grows the street network (with a seeded organic outline, so no
 * two seeds share a silhouette), {@link extractBlocks} turns it into closed block polygons, and the
 * plot pass subdivides every buildable block's street frontage into PLOTS of many sizes — narrow
 * rowhouse slivers up to block-scale grand parcels. Everything that stands in the city stands on a
 * plot, and every plot fronts a street by construction: there is no landmark special case (a
 * landmark is just a grand plot) and no street-less interior fill. One call, one seed, one
 * deterministic city. Local (volume-centered) coords; the caller translates into world space.
 *
 * @capability city-generator compose a deterministic city — street network, blocks, street-fronting plots of varied size — from one seed
 */
import type { PlacedBuildingLot } from "./buildingLots";
import {
  extractGraphBlocks,
  carveCorridors,
  conformPolygonToRing,
  cutParcel,
  isSliverBlock,
  RingWalker,
} from "./cityBlocks";
import {
  buildLandmarkPieces,
  buildLotPieces,
  classWidthRange,
  landmarkFloors,
  pickClass,
  rollClassPlacement,
  zoneBand,
  zoneMetric,
  CITY_LANDMARK_CLASSES,
  type CityFillerClass,
  type CityLandmarkClass,
  type CityLotClass,
  type CityLotPiece,
  type CityZoneBand,
  type CityZoneProfile,
} from "./cityContent";
import { fitRectInPolygon, polygonArea, polygonsOverlap, rayDistanceToRing, type Vec2 } from "./cityGeometry";
import { isOnRoad, nearestOnPath } from "./roads";
import { seededStreams } from "../random/rng";
import type { WeightedParamEntry } from "../scene/sceneKinds";
import {
  generateStreets,
  type StreetLevel,
  type StreetNetwork,
  type StreetNetworkContext,
  type StreetNetworkRules,
} from "./streetGenerator";

/** City-shaped defaults for every street dial except the seed. */
const CITY_STREET_DEFAULTS: Omit<StreetNetworkRules, "seed"> = {
  gridness: 0.85,
  loopiness: 0.35,
  connectivity: 0.6,
  branching: 0.4,
  deadEnds: 0.15,
  segmentLength: 90,
  aspect: 1.4,
  winding: 0.15,
  minCurveRadius: 18,
  minTurnAngle: 12,
  maxTurnAngle: 110,
  width: 9,
  boulevards: 0.2,
  // Seed-unique silhouette by default: cities grow lobes and bays instead of filling the square.
  outline: 0.4,
  // Suburb life: most spurs grow as winding cul-de-sac side streets lined with houses.
  residentialBranches: 0.6,
};

/** Options for {@link generateCity}: a seed, street-dial overrides, and plot pass-through options. */
export interface CityGeneratorOptions {
  /** Drives the street network and all downstream plot/class/massing variation. */
  seed: string;
  /** Street-dial overrides; anything omitted takes the city defaults above (including `outline`). */
  streets?: Partial<Omit<StreetNetworkRules, "seed">>;
  /** Plot-pass options (sizes scale off `footprint`, gaps off `spacing`, fronts off `setback`). */
  lots?: {
    /** Base plot-size hint: tier frontage/depth ranges scale by `w/12` and `d/10`. Default 12×10. */
    footprint?: { w: number; d: number };
    /** Base gap between neighbouring plots along a frontage, world units. Default 2. */
    spacing?: number;
    /** Sidewalk strip between the curb and the building front, world units. Default 3. */
    setback?: number;
    /** Manhattan streetwall dial (0..1): frontage coverage and plot depth grow with it. Default {@link DEFAULT_BLOCK_FILL}. */
    blockFill?: number;
    /** Also line `lane`-level streets (alleys) with plots. Default false. */
    laneFrontage?: boolean;
    /** Hard cap on emitted plots so a big network stays bounded. Default 600. */
    maxLots?: number;
  };
  /** Ground sampler + bridge/tunnel toggles forwarded to the street generator. */
  context?: StreetNetworkContext;
  /**
   * Also resolve each plot into zone/class/floors/massing. Pass `true` for city defaults, or an
   * overrides object to tune bands/mixes/floors. Omit (default) to keep the cheap geometry-only
   * path — `lotContent` stays absent. See {@link resolveCityLotContent}.
   */
  content?: boolean | CityContentOverrides;
}

/** Size tier a plot was cut at. `grand` is the block-scale tier that used to be a landmark pass. */
export type CityPlotTier = "small" | "medium" | "large" | "grand";

/** All plot tiers, for schema hints and validation. */
export const CITY_PLOT_TIERS: readonly CityPlotTier[] = ["small", "medium", "large", "grand"];

/** The street frontage a plot faces: which street, and the frontage chord along it. */
export interface CityPlotFrontage {
  /** Index into `network.streets`. */
  street: number;
  /** Frontage chord endpoints on the plot boundary. */
  a: Vec2;
  b: Vec2;
}

/** One polygonal plot cut from a block's street frontage. Every plot fronts a street. */
export interface CityPlot {
  /** Plot polygon (CCW) in local XZ. */
  polygon: Vec2[];
  /** Building-rect center inside the plot (matches the paired {@link PlacedBuildingLot}). */
  center: Vec2;
  /** Yaw turning the building front toward its street. */
  rotationY: number;
  /** Building-rect frontage width / depth fitted inside the plot polygon. */
  width: number;
  depth: number;
  frontage: CityPlotFrontage;
  /** Hierarchy level of the fronted street. */
  streetLevel: StreetLevel;
  /** Index of the block the plot was cut from; `-1` for plots lining a cul-de-sac/branch corridor. */
  block: number;
  tier: CityPlotTier;
  /** True when the plot wraps a block corner (two frontages meet inside it). */
  corner: boolean;
}

/** A generated city: streets, plots (with rect building lots as a compat view), and park blocks. */
export interface GeneratedCity {
  network: StreetNetwork;
  /** Rect building-lot view of `plots` (same order, same indices) — the renderer-compat seam. */
  lots: PlacedBuildingLot[];
  /** The polygonal plots the city is made of. `plots[i]` pairs with `lots[i]`. */
  plots: CityPlot[];
  /** Land polygons of whole blocks reserved as parks/open space (no plots cut). */
  parks: Vec2[][];
  /**
   * Present only when {@link CityGeneratorOptions.content} was requested: every plot enriched with
   * its zone band, building class, floors, and lot-local massing pieces. Same order as `lots`.
   */
  lotContent?: readonly ResolvedCityLot[];
}

/**
 * Grow a street network inside the `hx`/`hz` half-extents, extract its blocks, and subdivide their
 * frontage into plots. Deterministic: identical options ⇒ identical city.
 */
export function generateCity(options: CityGeneratorOptions, hx: number, hz: number): GeneratedCity {
  const { seed, streets: streetOverrides, lots: lotOptions, context } = options;
  const rules: StreetNetworkRules = { seed, ...CITY_STREET_DEFAULTS, ...streetOverrides };
  const network = generateStreets(rules, hx, hz, context ?? {});
  const contentEnabled = options.content !== undefined && options.content !== false;
  const overrides = typeof options.content === "object" ? options.content : {};
  const footprint = lotOptions?.footprint ?? { w: 12, d: 10 };
  const { plots, parks } = deriveCityPlots(network, {
    seed,
    halfExtents: [hx, hz],
    laneFrontage: lotOptions?.laneFrontage ?? false,
    setback: lotOptions?.setback,
    spacing: lotOptions?.spacing,
    blockFill: overrides.blockFill ?? lotOptions?.blockFill,
    landmarks: overrides.landmarks,
    plotScale: [footprint.w / 12, footprint.d / 10],
    maxPlots: lotOptions?.maxLots,
    profile: overrides.profile,
    coreExtent: overrides.coreExtent,
    midExtent: overrides.midExtent,
  });
  const lots = plots.map((plot) => toPlacedLot(plot, network));
  if (!contentEnabled) return { network, lots, plots, parks };
  const lotContent = resolveCityLotContent(
    { network, lots, plots, parks },
    { seed, halfExtents: [hx, hz], laneFrontage: lotOptions?.laneFrontage ?? false, ...overrides },
  );
  return { network, lots, plots, parks, lotContent };
}

/** Rect-lot compat view of a plot: center/yaw/footprint plus street reference fields. */
function toPlacedLot(plot: CityPlot, network: StreetNetwork): PlacedBuildingLot {
  const street = network.streets[plot.frontage.street];
  let side: 1 | -1 = 1;
  let frontDistance = plot.depth / 2;
  if (street !== undefined) {
    const near = nearestOnPath(street.points, plot.center[0], plot.center[1]);
    if (near !== null) {
      const offX = plot.center[0] - near.point[0];
      const offZ = plot.center[1] - near.point[1];
      // Left normal of the tangent (CCW): (-tz, tx).
      side = offX * -near.tangent[1] + offZ * near.tangent[0] >= 0 ? 1 : -1;
      frontDistance = Math.max(0, near.distance - plot.depth / 2);
    }
  }
  return {
    center: [plot.center[0], plot.center[1]],
    rotationY: plot.rotationY,
    footprint: { w: plot.width, d: plot.depth },
    road: plot.frontage.street,
    side,
    frontDistance,
  };
}

// ---------------------------------------------------------------------------
// Plot derivation — block frontage subdivision into size-tiered polygonal plots.
// ---------------------------------------------------------------------------

/** Default `blockFill`: gently gapped frontage — plots with breathing room, parks reserved. */
export const DEFAULT_BLOCK_FILL = 0.45;
/** Default grand-plot share dial — a handful of block-scale parcels per default city. */
export const DEFAULT_LANDMARK_SHARE = 0.04;
/** Hard cap on grand plots emitted regardless of dial/city size. */
export const LANDMARK_HARD_CAP = 12;

/** Frontage/depth ranges (meters, before `plotScale`) per tier. */
const PLOT_TIER_SIZES: Record<CityPlotTier, { frontage: readonly [number, number]; depth: readonly [number, number] }> = {
  small: { frontage: [6.5, 11], depth: [9, 16] },
  medium: { frontage: [11, 18], depth: [12, 22] },
  large: { frontage: [18, 30], depth: [16, 30] },
  grand: { frontage: [34, 60], depth: [30, 58] },
};

/** Non-grand tier weights per zone band — many different plot sizes, denser splits downtown. */
const PLOT_TIER_WEIGHTS: Record<CityZoneBand, Record<Exclude<CityPlotTier, "grand">, number>> = {
  core: { small: 1, medium: 3, large: 2.6 },
  mid: { small: 2.4, medium: 3, large: 1.2 },
  edge: { small: 3.4, medium: 2, large: 0.5 },
};

/** Street-level multipliers on tier weights: boulevards pull big plots, lanes pull small ones. */
const PLOT_LEVEL_TIER_BIAS: Record<StreetLevel, Partial<Record<Exclude<CityPlotTier, "grand">, number>>> = {
  boulevard: { large: 1.7, medium: 1.1, small: 0.6 },
  avenue: { large: 1.3, medium: 1.1 },
  street: {},
  lane: { small: 1.8, large: 0.35 },
};

/** Grand-share multiplier per zone band: civic-scale parcels concentrate toward the core. */
const GRAND_ZONE_FACTOR: Record<CityZoneBand, number> = { core: 1.6, mid: 1, edge: 0.45 };

/** Options for {@link deriveCityPlots}. */
export interface CityPlotOptions {
  seed: string;
  /** Half-extents the city was grown in — zone tiers normalize to these. */
  halfExtents: readonly [number, number];
  /** Cut plots along `lane`-level frontage too. Default false. */
  laneFrontage?: boolean;
  /** Sidewalk strip between curb and building front, meters. Default 3. */
  setback?: number;
  /** Base gap between neighbouring plots, meters. Default 2. */
  spacing?: number;
  /** Streetwall dial (0..1): frontage coverage, plot depth, and park share ride on it. Default {@link DEFAULT_BLOCK_FILL}. */
  blockFill?: number;
  /** Grand-plot share dial (0..1): probability weight of the block-scale tier. Default {@link DEFAULT_LANDMARK_SHARE}; `0` disables grand plots. */
  landmarks?: number;
  /** Tier size multiplier `[wScale, dScale]`. Default `[1, 1]`. */
  plotScale?: readonly [number, number];
  /** Hard cap on emitted plots. Default 600. */
  maxPlots?: number;
  /** Zone profile the tier weights read. Defaults match {@link resolveCityLotContent}. */
  profile?: CityZoneProfile;
  coreExtent?: number;
  midExtent?: number;
}

/** Output of {@link deriveCityPlots}: the plots plus whole-block park polygons. */
export interface CityPlotResult {
  plots: CityPlot[];
  parks: Vec2[][];
}

/** Weighted tier pick from zone weights × street-level bias. */
function pickTier(
  zone: CityZoneBand,
  level: StreetLevel,
  roll: number,
): Exclude<CityPlotTier, "grand"> {
  const weights = PLOT_TIER_WEIGHTS[zone];
  const bias = PLOT_LEVEL_TIER_BIAS[level];
  const entries = (Object.keys(weights) as Exclude<CityPlotTier, "grand">[]).map((tier) => ({
    tier,
    weight: weights[tier] * (bias[tier] ?? 1),
  }));
  let total = 0;
  for (const e of entries) total += e.weight;
  let cursor = roll * total;
  for (const e of entries) {
    cursor -= e.weight;
    if (cursor <= 0) return e.tier;
  }
  return "medium";
}

/**
 * Subdivide every buildable block's street frontage into size-tiered polygonal plots. Blocks come
 * from the street network's planar faces ({@link extractBlocks}), so every plot fronts a real
 * street; block interiors stay open (courtyards) and a seeded fraction of whole blocks becomes
 * parks. Grand plots — the old "landmarks" — are just the biggest tier of the same pass.
 * Deterministic per seed, bounded by `maxPlots` and per-block caps.
 *
 * @capability city-generator subdivide street blocks into size-tiered street-fronting plots
 */
export function deriveCityPlots(network: StreetNetwork, options: CityPlotOptions): CityPlotResult {
  const [hx, hz] = options.halfExtents;
  const laneFrontage = options.laneFrontage ?? false;
  const setback = Math.max(0, options.setback ?? 3);
  const spacing = Math.max(0, options.spacing ?? 2);
  const fill = Math.max(0, Math.min(1, options.blockFill ?? DEFAULT_BLOCK_FILL));
  const grandShare = Math.max(0, Math.min(1, options.landmarks ?? DEFAULT_LANDMARK_SHARE));
  const [wScale, dScale] = options.plotScale ?? [1, 1];
  const maxPlots = Math.max(0, Math.floor(options.maxPlots ?? 600));
  const profile = options.profile ?? "core-out";
  const coreExtent = options.coreExtent ?? 0.35;
  const midExtent = options.midExtent ?? 0.7;

  const streets = network.streets;
  const streams = seededStreams(`${options.seed}:plots`);
  // Node-pair → owning street index, so pruned dead-end corridors keep their street identity and
  // cul-de-sacs can be lined with plots that reference a real street.
  const edgeStreet = new Map<string, number>();
  streets.forEach((s, si) => {
    for (let i = 0; i + 1 < s.nodes.length; i += 1) {
      const a = s.nodes[i]!;
      const b = s.nodes[i + 1]!;
      edgeStreet.set(a < b ? `${a}:${b}` : `${b}:${a}`, si);
    }
  });
  // Blocks from the network's EXACT graph (nodes/edges), not from re-welded polylines — wandered,
  // arc-filleted centerlines defeat proximity welding, and the graph is already the truth.
  const fabric = extractGraphBlocks(
    network.nodes,
    network.edges.map((e) => ({
      a: e.a,
      b: e.b,
      points: e.points,
      width: e.width,
      level: e.level,
      street: edgeStreet.get(e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`),
    })),
    { sidewalkBase: 2, curbMargin: 0.35 },
  );

  // Coverage: how much of a frontage run becomes plots (vs left as gaps); rises with the dial.
  const coverage = Math.min(1, 0.62 + fill * 0.42);
  // Gap between neighbouring plots: collapses toward a streetwall as the dial rises.
  const gap = Math.max(0.15, spacing * (1.55 - fill * 1.4));
  // Whole-block park share: a dense city keeps a floor of green, a loose one breathes more.
  const parkFraction = Math.min(0.25, 0.05 + (1 - fill) * 0.16);

  const nearestStreet = (
    x: number,
    z: number,
  ): { street: number; distance: number } | null => {
    let bestStreet = -1;
    let bestDistance = Infinity;
    for (let s = 0; s < streets.length; s += 1) {
      const near = nearestOnPath(streets[s]!.points, x, z);
      if (near !== null && near.distance < bestDistance) {
        bestDistance = near.distance;
        bestStreet = s;
      }
    }
    return bestStreet < 0 ? null : { street: bestStreet, distance: bestDistance };
  };

  const plots: CityPlot[] = [];
  const parks: Vec2[][] = [];
  let grandCount = 0;
  // Park budget scales with how many blocks exist, so a small city never loses half its blocks.
  let parkBudget = Math.max(1, Math.round(fabric.blocks.length * parkFraction));

  for (let bi = 0; bi < fabric.blocks.length && plots.length < maxPlots; bi += 1) {
    const land = fabric.blocks[bi]!.land;
    if (land.length < 3) continue;
    const rng = streams(`block:${bi}`);
    const parkRoll = rng();
    if (isSliverBlock(land, 130, 6.5)) {
      // Too thin/small to build on — leftover green.
      if (polygonArea(land) > 60) parks.push(land);
      continue;
    }
    // Only modest blocks become whole-block parks — a giant central block stays buildable.
    if (parkBudget > 0 && parkRoll < parkFraction * 1.6 && polygonArea(land) < 11000) {
      parks.push(land);
      parkBudget -= 1;
      continue;
    }

    const walker = new RingWalker(land);
    const blockPolys: Vec2[][] = [];
    let blockHasGrand = false;
    let cursor = rng() * 5;
    const endStation = walker.total - 2;
    let guard = 0;
    while (cursor < endStation && plots.length < maxPlots && blockPolys.length < 48 && guard < 200) {
      guard += 1;
      const grandRoll = rng();
      const tierRoll = rng();
      const bandRoll = rng();
      const sizeRoll = rng();
      const depthRoll = rng();
      const coverRoll = rng();
      const mid0 = walker.at(cursor);
      // Only true street frontage grows plots: probe just outside the ring toward the curb.
      const probe = nearestStreet(mid0.p[0] - mid0.normal[0] * 2, mid0.p[1] - mid0.normal[1] * 2);
      const fronted = probe !== null && probe.distance <= (streets[probe.street]?.width ?? 9) / 2 + 6.5;
      const level: StreetLevel = fronted ? streets[probe.street]!.level : "street";
      if (!fronted || (level === "lane" && !laneFrontage)) {
        cursor += 6;
        continue;
      }
      const zone = zoneBand(zoneMetric(mid0.p[0], mid0.p[1], hx, hz), profile, coreExtent, midExtent, bandRoll);

      // Tier: grand first (dial-gated, capped, needs a deep block), else the zone/level mix.
      const across = rayDistanceToRing(land, [mid0.p[0] + mid0.normal[0] * 0.2, mid0.p[1] + mid0.normal[1] * 0.2], mid0.normal);
      const depthCap = Number.isFinite(across) ? Math.max(5, across * 0.5 - 0.4) : 14;
      const wantGrand =
        grandShare > 0 &&
        !blockHasGrand &&
        grandCount < LANDMARK_HARD_CAP &&
        depthCap >= 24 * dScale &&
        grandRoll < grandShare * 0.5 * GRAND_ZONE_FACTOR[zone];
      const tier: CityPlotTier = wantGrand ? "grand" : pickTier(zone, level, tierRoll);
      const sizes = PLOT_TIER_SIZES[tier];
      const frontW = (sizes.frontage[0] + sizeRoll * (sizes.frontage[1] - sizes.frontage[0])) * wScale;
      if (cursor + frontW + gap > walker.total - 0.5) break;

      // Coverage gaps: skip a sub-plot-sized arc so low fill reads as loose frontage.
      if (tier !== "grand" && coverRoll > coverage) {
        cursor += Math.max(4, frontW * 0.5);
        continue;
      }

      const depthWant = (sizes.depth[0] + depthRoll * (sizes.depth[1] - sizes.depth[0])) * dScale * (0.85 + fill * 0.4);
      const depth =
        tier === "grand"
          ? Math.min(Number.isFinite(across) ? across - 4 : depthCap, Math.max(depthWant, frontW * 0.7))
          : Math.min(depthCap, depthWant);
      const s0 = cursor;
      const s1 = cursor + frontW;
      let poly = cutParcel(walker, land, { s0, s1, depth });
      const midS = walker.at((s0 + s1) / 2);
      if (poly !== null && fabric.deadEnds.length > 0) {
        // Cul-de-sac lanes were pruned from the face graph; carve their corridors out of plots.
        const keep: Vec2 = [midS.p[0] + midS.normal[0] * 1.5, midS.p[1] + midS.normal[1] * 1.5];
        let carved = carveCorridors(poly, keep, fabric.deadEnds.map((d) => ({ pts: d.pts, width: d.width + 1 })), 0.8);
        if (carved.length >= 3 && carved.length !== poly.length) carved = conformPolygonToRing(carved, land);
        poly = carved.length >= 3 ? carved : null;
      }
      if (poly !== null) {
        // Never overlap a neighbour plot (opposite frontage of a shallow block): retry shallower once.
        let clash = blockPolys.some((other) => polygonsOverlap(poly!, other, 0.18));
        if (clash) {
          const shallow = cutParcel(walker, land, { s0, s1, depth: depth * 0.55 });
          if (shallow !== null && !blockPolys.some((other) => polygonsOverlap(shallow, other, 0.18))) {
            poly = shallow;
            clash = false;
          }
        }
        if (clash) poly = null;
      }
      if (poly === null) {
        cursor += frontW * 0.6;
        continue;
      }

      // Building rect inside the plot, set back from the frontage, facing the street.
      const rotationY = Math.atan2(-midS.normal[0], -midS.normal[1]);
      const maxW = Math.max(3, frontW - gap);
      const maxD = Math.max(3, depth - setback - 1.2);
      const cx0 = midS.p[0] + midS.normal[0] * (setback + maxD / 2);
      const cz0 = midS.p[1] + midS.normal[1] * (setback + maxD / 2);
      const fit = fitRectInPolygon(poly, cx0, cz0, maxW, maxD, rotationY, 0.4);
      if (fit === null || fit.w < 3 || fit.d < 2.6) {
        cursor += frontW * 0.6;
        continue;
      }
      // Rendered streets are arc-filleted and junctions grow welded aprons past the ribbons, so
      // both can cut inside a block's corner past the graph face the parcel was cut from — reject
      // any building rect that would sit on pavement or inside a junction apron.
      const rc = Math.cos(rotationY);
      const rs = Math.sin(rotationY);
      const onPavement = [
        [0, 0],
        [fit.w / 2, fit.d / 2],
        [fit.w / 2, -fit.d / 2],
        [-fit.w / 2, fit.d / 2],
        [-fit.w / 2, -fit.d / 2],
      ].some(([lx, lz]) => {
        const px = fit.cx + lx! * rc + lz! * rs;
        const pz = fit.cz - lx! * rs + lz! * rc;
        return (
          streets.some((s) => isOnRoad(s.points, s.width + 3.5, px, pz)) ||
          network.junctions.some((j) => Math.hypot(j.x - px, j.z - pz) < j.radius + 4)
        );
      });
      if (onPavement) {
        cursor += frontW * 0.6;
        continue;
      }

      // A grand arc squeezed by the block shape (fit rect came out ordinary-sized) is not a
      // landmark parcel — demote it so class and massing match what actually fits.
      const realizedTier: CityPlotTier = tier === "grand" && fit.w < 24 * wScale ? "large" : tier;

      let corner = false;
      for (const vi of walker.verticesBetween(s0, s1)) {
        const angle = walker.interiorAngle(vi);
        if (angle < 2.53 || angle > Math.PI * 2 - 2.53) {
          corner = true;
          break;
        }
      }

      plots.push({
        polygon: poly,
        center: [fit.cx, fit.cz],
        rotationY,
        width: fit.w,
        depth: fit.d,
        frontage: { street: probe.street, a: walker.at(s0).p, b: walker.at(s1).p },
        streetLevel: level,
        block: bi,
        tier: realizedTier,
        corner,
      });
      blockPolys.push(poly);
      if (realizedTier === "grand") {
        grandCount += 1;
        blockHasGrand = true;
      }
      cursor += frontW + gap;
    }
  }

  // --- cul-de-sac / branch-street frontage --------------------------------------------------------
  // Dead-end corridors are pruned from the face graph (they border no closed block), but a
  // residential branch is exactly the street that wants a row of small house plots down both sides
  // — the "one street off the main with just houses on it" look. Step small/medium plots along each
  // non-lane corridor, both sides, rejecting anything on pavement, outside the volume, or
  // overlapping an existing plot. Bounded per corridor and by `maxPlots`.
  const rectPoly = (cx: number, cz: number, hw: number, hd: number, yaw: number): Vec2[] => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return ([
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const).map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c] as Vec2);
  };
  for (let di = 0; di < fabric.deadEnds.length && plots.length < maxPlots; di += 1) {
    const corridor = fabric.deadEnds[di]!;
    if (corridor.level === "lane" && !laneFrontage) continue;
    if (corridor.street === undefined) continue;
    const pts = corridor.pts;
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i += 1) total += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
    if (total < 18) continue;
    const rng = streams(`culdesac:${di}`);
    const stationAt = (s: number): { p: Vec2; tangent: Vec2 } => {
      let acc = 0;
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-9) continue;
        if (acc + len >= s || i + 2 === pts.length) {
          const t = Math.max(0, Math.min(1, (s - acc) / len));
          return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], tangent: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
        }
        acc += len;
      }
      return { p: [pts[0]![0], pts[0]![1]], tangent: [1, 0] };
    };
    // Keep the corridor ends clear: the junction mouth at one end, the turning bulb at the other.
    const endMargin = corridor.width * 1.4 + 3;
    let placedHere = 0;
    let s = endMargin + rng() * 4;
    while (s < total - endMargin && placedHere < 14 && plots.length < maxPlots) {
      const tier: CityPlotTier = rng() < 0.72 ? "small" : "medium";
      const sizes = PLOT_TIER_SIZES[tier];
      const frontW = (sizes.frontage[0] + rng() * (sizes.frontage[1] - sizes.frontage[0])) * wScale;
      const depth = (sizes.depth[0] + rng() * (sizes.depth[1] - sizes.depth[0])) * dScale * 0.8;
      const st = stationAt(s + frontW / 2);
      for (const side of [1, -1] as const) {
        if (plots.length >= maxPlots) break;
        if (rng() > coverage) continue;
        // Normal into the plot (away from the corridor centerline).
        const nx = -st.tangent[1] * side;
        const nz = st.tangent[0] * side;
        const cx = st.p[0] + nx * (corridor.width / 2 + setback + depth / 2);
        const cz = st.p[1] + nz * (corridor.width / 2 + setback + depth / 2);
        if (Math.abs(cx) > hx || Math.abs(cz) > hz) continue;
        const yaw = Math.atan2(-nx, -nz);
        const w = Math.max(3, frontW - gap);
        const corners: readonly (readonly [number, number])[] = [
          [0, 0],
          [w / 2, depth / 2],
          [w / 2, -depth / 2],
          [-w / 2, depth / 2],
          [-w / 2, -depth / 2],
        ];
        const yc = Math.cos(yaw);
        const ys = Math.sin(yaw);
        const onPavement = corners.some(([lx, lz]) => {
          const px = cx + lx * yc + lz * ys;
          const pz = cz - lx * ys + lz * yc;
          return (
            streets.some((street) => isOnRoad(street.points, street.width + 3.5, px, pz)) ||
            network.junctions.some((j) => Math.hypot(j.x - px, j.z - pz) < j.radius + 4)
          );
        });
        if (onPavement) continue;
        const poly = rectPoly(cx, cz, w / 2, depth / 2, yaw);
        if (plots.some((other) => polygonsOverlap(poly, other.polygon, 0.18))) continue;
        plots.push({
          polygon: poly,
          center: [cx, cz],
          rotationY: yaw,
          width: w,
          depth,
          frontage: { street: corridor.street, a: [st.p[0], st.p[1]], b: [st.p[0] + st.tangent[0] * frontW, st.p[1] + st.tangent[1] * frontW] },
          streetLevel: corridor.level,
          block: -1,
          tier,
          corner: false,
        });
        placedHere += 1;
      }
      s += frontW + gap;
    }
  }
  return { plots, parks };
}

// ---------------------------------------------------------------------------
// Content resolution — zone/class/floors/massing per plot. A grand plot rolls a landmark class;
// everything else rolls the zone mix biased by street level AND plot size, so class follows plot.
// ---------------------------------------------------------------------------

/** Weighted building-class mix per zone band; the radial profile decides which band a lot falls in. */
export interface CityZoneMixes {
  core: readonly WeightedParamEntry[];
  mid: readonly WeightedParamEntry[];
  edge: readonly WeightedParamEntry[];
}

/** Default zoned-metropolis mixes: towers/slabs downtown, slabs+rowhouses mid, houses at the edge. */
export const DEFAULT_CITY_ZONE_MIXES: CityZoneMixes = {
  core: [
    { item: "tower", weight: 3 },
    { item: "slab", weight: 1 },
    { item: "shop", weight: 1 },
  ],
  mid: [
    { item: "slab", weight: 2 },
    { item: "rowhouse", weight: 2 },
    { item: "shop", weight: 1 },
  ],
  edge: [
    { item: "house", weight: 3 },
    { item: "rowhouse", weight: 1 },
  ],
};

/**
 * Per-street-level class weight multipliers applied to the band mix before the class pick, so towers
 * and slabs bias toward wide boulevard/avenue frontage while houses bias toward lanes and quiet
 * streets. A missing class ⇒ multiplier 1. Pure data modulating the weighted mixes.
 */
export type CityLevelClassBias = Record<StreetLevel, Partial<Record<CityLotClass, number>>>;

/** Default street-level bias — boulevards favor big massing, lanes favor small/rural massing. */
export const DEFAULT_CITY_LEVEL_BIAS: CityLevelClassBias = {
  boulevard: { tower: 2, slab: 1.6, shop: 1.3, mansion: 1.2 },
  avenue: { tower: 1.5, slab: 1.4, shop: 1.2 },
  street: { shop: 1.1, rowhouse: 1.2, house: 1.2 },
  lane: { house: 1.6, rowhouse: 1.4, mansion: 1.3, farmhouse: 1.5, barn: 1.4, silo: 1.3 },
};

/** Tunable overrides for {@link resolveCityLotContent} (seed/halfExtents/laneFrontage are supplied). */
export interface CityContentOverrides {
  /** Radial band profile: `core-out` (default), `inverted`, or spatially `uniform`. */
  profile?: CityZoneProfile;
  /** Fraction of the half-extent the core band covers. Default 0.35. */
  coreExtent?: number;
  /** Fraction of the half-extent where the mid band ends and the edge begins. Default 0.7. */
  midExtent?: number;
  /** Weighted class mix per band; any omitted band takes {@link DEFAULT_CITY_ZONE_MIXES}. */
  mixes?: Partial<CityZoneMixes>;
  /** Global massing-size multiplier forwarded to the class placement roll. Default 1. */
  lotScale?: number;
  /** Minimum building floors (district clamp over class ranges). Default 1. */
  floorsMin?: number;
  /** Maximum building floors. Default 30. */
  floorsMax?: number;
  /** Height of one floor in meters. Default 3. */
  floorHeight?: number;
  /** Base road setback in meters (class factors scale it). Default 2.5. */
  setback?: number;
  /** Base side spacing in meters between neighbours. Default 1.4. */
  spacing?: number;
  /**
   * Bias the band mix by the plot's frontage street level before the class pick. `true` (default)
   * uses {@link DEFAULT_CITY_LEVEL_BIAS}; pass a table to customise; `false` disables the bias.
   */
  streetLevelBias?: boolean | CityLevelClassBias;
  /**
   * Grand-plot share dial (0..1): the probability weight of the block-scale plot tier at geometry
   * time — a landmark is nothing but a grand plot. Default {@link DEFAULT_LANDMARK_SHARE}; `0`
   * yields a city with no grand plots. Count is hard-capped at {@link LANDMARK_HARD_CAP}.
   */
  landmarks?: number;
  /**
   * Restrict grand plots to these classes (a subset of {@link CITY_LANDMARK_CLASSES}). Omit to
   * allow every class the zone table would pick.
   */
  landmarkClasses?: readonly CityLandmarkClass[];
  /**
   * Streetwall dial (0..1). Default {@link DEFAULT_BLOCK_FILL}. As it rises frontage coverage
   * approaches a contiguous wall, plots deepen toward the block spine, and fewer whole blocks are
   * reserved as parks; falling it loosens the frontage and greens the city. Block interiors are
   * never filled with street-less buildings — every plot fronts a street.
   */
  blockFill?: number;
}

/** Full options for {@link resolveCityLotContent}: the city geometry frame plus content overrides. */
export interface CityContentOptions extends CityContentOverrides {
  /** Seed for the deterministic class/floor/massing rolls. Reuse the city seed for a coherent city. */
  seed: string;
  /** Half-extents the city was grown in — the radial zone metric normalizes to these. */
  halfExtents: readonly [number, number];
  /** Whether lanes were lined with plots (mirror the geometry option). Default false. */
  laneFrontage?: boolean;
}

/** Axis-aligned massing extents (lot-local): full width along x and depth along z. */
export interface MassingFootprint {
  /** Full width of the massing bounding box along local x (frontage). */
  w: number;
  /** Full depth of the massing bounding box along local z (into the block). */
  d: number;
  /** Bounding-box corners in lot-local space, so a renderer can ground/cull the parcel. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** One plot enriched with its zone/class/floors/massing — the renderer instances `pieces` at `center`. */
export interface ResolvedCityLot {
  /** The paired rect building lot (`city.lots[i]`). */
  lot: PlacedBuildingLot;
  /** Zone band the plot center fell in under the profile. */
  zone: CityZoneBand;
  /**
   * Building class. Ordinary plots roll a {@link CityLotClass} from the band mix; grand plots roll
   * a {@link CityLandmarkClass}. ({@link CityFillerClass} remains in the union for renderer compat.)
   */
  class: CityLotClass | CityLandmarkClass | CityFillerClass;
  /**
   * Set only on grand plots; equals {@link ResolvedCityLot.class} there and is `undefined` for
   * every ordinary building. Renderers branch on this.
   */
  landmark?: CityLandmarkClass;
  /** Hierarchy level of the frontage street (`street` when it can't be recovered). */
  streetLevel: StreetLevel;
  /** Building floor count after the district clamp. */
  floors: number;
  /** Deterministic massing pieces in lot-local space (x along frontage, z into block, y up from grade). */
  pieces: readonly CityLotPiece[];
  /** Lot center in world XZ (mirrors `lot.center`) — the anchor the renderer offsets pieces from. */
  center: Vec2;
  /** Building yaw so its front faces the road (mirrors `lot.rotationY`). */
  rotationY: number;
  /** Actual massing extents in lot-local space (from `pieces`), for grounding and culling. */
  footprint: MassingFootprint;
}

/** Multiply each band-mix weight by its per-level bias factor (missing class ⇒ ×1). */
function biasMix(mix: readonly WeightedParamEntry[], levelBias: Partial<Record<CityLotClass, number>>): WeightedParamEntry[] {
  return mix.map((entry) => {
    const factor = levelBias[entry.item as CityLotClass];
    return factor === undefined ? entry : { item: entry.item, weight: entry.weight * factor };
  });
}

/**
 * Bias a class mix by how well each class's natural frontage width matches the plot width, so the
 * class follows the plot: wide plots pull towers/slabs, narrow plots pull rowhouses/houses.
 */
function sizeBiasMix(mix: readonly WeightedParamEntry[], plotWidth: number): WeightedParamEntry[] {
  return mix.map((entry) => {
    const range = classWidthRange(entry.item);
    if (range === undefined) return entry;
    const mid = (range[0] + range[1]) / 2;
    const spread = (range[1] - range[0]) / 2 + 5;
    const t = (plotWidth - mid) / spread;
    const factor = 1 / (1 + t * t);
    return { item: entry.item, weight: entry.weight * factor };
  });
}

/** Local axis-aligned bounding box of a lot's massing pieces, accounting for each piece's local yaw. */
function massingFootprint(pieces: readonly CityLotPiece[]): MassingFootprint {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const piece of pieces) {
    const c = Math.abs(Math.cos(piece.rotationY));
    const s = Math.abs(Math.sin(piece.rotationY));
    const hx = (piece.size[0] / 2) * c + (piece.size[2] / 2) * s;
    const hz = (piece.size[0] / 2) * s + (piece.size[2] / 2) * c;
    minX = Math.min(minX, piece.offset[0] - hx);
    maxX = Math.max(maxX, piece.offset[0] + hx);
    minZ = Math.min(minZ, piece.offset[2] - hz);
    maxZ = Math.max(maxZ, piece.offset[2] + hz);
  }
  if (!Number.isFinite(minX)) return { w: 0, d: 0, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } };
  return { w: maxX - minX, d: maxZ - minZ, bounds: { minX, maxX, minZ, maxZ } };
}

/** Which landmark classes each zone band favours (weighted). Data-only, mirrors the zone-mix pattern. */
const LANDMARK_ZONE_MIX: Record<CityZoneBand, readonly { cls: CityLandmarkClass; weight: number }[]> = {
  core: [
    { cls: "hall", weight: 3 },
    { cls: "arena", weight: 1 },
    { cls: "market", weight: 1 },
  ],
  mid: [
    { cls: "arena", weight: 2 },
    { cls: "campus", weight: 2 },
    { cls: "market", weight: 2 },
  ],
  edge: [
    { cls: "campus", weight: 2 },
    { cls: "arena", weight: 1 },
  ],
};

/** Weighted pick of a landmark class from a zone entry list, restricted to `allowed`. */
function pickLandmarkClass(
  entries: readonly { cls: CityLandmarkClass; weight: number }[],
  allowed: ReadonlySet<CityLandmarkClass>,
  roll: number,
): CityLandmarkClass {
  let total = 0;
  for (const e of entries) if (allowed.has(e.cls) && e.weight > 0) total += e.weight;
  if (total <= 0) {
    // Zone table has nothing allowed here — fall back to any allowed class deterministically.
    const pool = CITY_LANDMARK_CLASSES.filter((c) => allowed.has(c));
    return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] ?? "campus";
  }
  let cursor = roll * total;
  for (const e of entries) {
    if (!allowed.has(e.cls) || e.weight <= 0) continue;
    cursor -= e.weight;
    if (cursor <= 0) return e.cls;
  }
  return entries[0]!.cls;
}

/**
 * Enrich a generated city's plots into classed, massed buildings: each plot gets its zone band
 * (radial position under a {@link CityZoneProfile}), a building class rolled from the band's
 * weighted mix — biased by street level AND plot size, with grand plots rolling a landmark class —
 * floors, and the deterministic massing pieces the class composes, sized to the plot's building
 * rect. Deterministic per `seed` via {@link seededStreams}, bounded (one pass over `city.lots`),
 * and pure. Same seed + city ⇒ identical resolved lots.
 *
 * A city without `plots` (a hand-built `{network, lots}` pair) still resolves: every lot is treated
 * as an ordinary plot of its footprint size.
 *
 * @capability city-generator resolve city plots into zoned, classed, massed buildings
 */
export function resolveCityLotContent(
  city: Pick<GeneratedCity, "network" | "lots"> & Partial<Pick<GeneratedCity, "plots" | "parks">>,
  options: CityContentOptions,
): ResolvedCityLot[] {
  const [hx, hz] = options.halfExtents;
  const profile = options.profile ?? "core-out";
  const coreExtent = options.coreExtent ?? 0.35;
  const midExtent = options.midExtent ?? 0.7;
  const lotScale = options.lotScale ?? 1;
  const floorsMin = options.floorsMin ?? 1;
  const floorsMax = options.floorsMax ?? 30;
  const floorHeight = options.floorHeight ?? 3;
  const setback = options.setback ?? 2.5;
  const spacing = options.spacing ?? 1.4;
  const mixes: CityZoneMixes = {
    core: options.mixes?.core ?? DEFAULT_CITY_ZONE_MIXES.core,
    mid: options.mixes?.mid ?? DEFAULT_CITY_ZONE_MIXES.mid,
    edge: options.mixes?.edge ?? DEFAULT_CITY_ZONE_MIXES.edge,
  };
  const biasSetting = options.streetLevelBias ?? true;
  const biasTable: CityLevelClassBias | null =
    biasSetting === false ? null : biasSetting === true ? DEFAULT_CITY_LEVEL_BIAS : biasSetting;
  const allowed = new Set<CityLandmarkClass>(options.landmarkClasses ?? CITY_LANDMARK_CLASSES);

  const streams = seededStreams(options.seed);

  return city.lots.map((lot, i) => {
    const plot = city.plots?.[i];
    const streetLevel = plot?.streetLevel ?? city.network.streets[lot.road]?.level ?? "street";
    const rng = streams(`lot:${i}`);
    const bandRoll = rng();
    const classRoll = rng();
    const zone = zoneBand(zoneMetric(lot.center[0], lot.center[1], hx, hz), profile, coreExtent, midExtent, bandRoll);

    if (plot?.tier === "grand") {
      const cls = pickLandmarkClass(LANDMARK_ZONE_MIX[zone], allowed, classRoll);
      const floors = landmarkFloors(cls, rng);
      const pieces = buildLandmarkPieces(cls, lot.footprint.w, lot.footprint.d, floors, floorHeight, rng);
      return {
        lot,
        zone,
        class: cls,
        landmark: cls,
        streetLevel,
        floors,
        pieces,
        center: lot.center,
        rotationY: lot.rotationY,
        footprint: massingFootprint(pieces),
      };
    }

    const leveled = biasTable === null ? mixes[zone] : biasMix(mixes[zone], biasTable[streetLevel]);
    const mix = sizeBiasMix(leveled, lot.footprint.w);
    const cls = pickClass(mix, classRoll);
    const placement = rollClassPlacement(cls, rng, lotScale, floorsMin, floorsMax, setback, spacing);
    // Massing follows the plot: fill its building rect, clamped so a small class on a big plot
    // doesn't balloon far past its natural size.
    const width = Math.min(lot.footprint.w, placement.width * 1.35);
    const depth = Math.min(lot.footprint.d, placement.depth * 1.35);
    const pieces = buildLotPieces(cls, width, depth, placement.floors, floorHeight, rng);
    return {
      lot,
      zone,
      class: cls,
      streetLevel,
      floors: placement.floors,
      pieces,
      center: lot.center,
      rotationY: lot.rotationY,
      footprint: massingFootprint(pieces),
    };
  });
}
