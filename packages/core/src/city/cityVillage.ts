/**
 * Village regime for the `city` studio: a footprint only a few blocks across is a hamlet, not a
 * city, so instead of a street lattice it grows ONE main street running the long way through the
 * volume (rim to rim, so it can meet the roads outside) and, when there is room, ONE side lane
 * teeing or crossing off it near the middle — buildings then cluster along that frontage around a
 * green by the junction. Returns a plain street network in district-local XZ, shaped like the street
 * generator's, so the block/parcel fabric consumes it unchanged. Pure seeded math.
 *
 * @capability city-district village regime: one or two lanes and a green for hamlet-sized districts
 */
import type { StreetEdge, StreetJunction, StreetLevel, StreetNetwork, StreetNode, Street } from "../roads/streetGenerator";
import type { Vec2 } from "../world/geometry";

/** Footprints with fewer block cells than this grow as a village (1–2 lanes) instead of a street net. */
export const VILLAGE_MAX_CELLS = 8;

/** A village's lanes plus where its green belongs. */
export interface VillagePlan {
  network: StreetNetwork;
  /** The junction (or the main street's midpoint when it has no side lane), district-local. */
  hub: Vec2;
  /** Unit directions at the hub: along the main street, and toward the side the green takes. */
  along: Vec2;
  side: Vec2;
}

/**
 * Lay out a village: `halfX`/`halfZ` the footprint, `width` the lane width, `curviness` how much the
 * main street meanders, `branching` whether the side lane crosses through instead of teeing off.
 */
export function villageLanes(options: { halfX: number; halfZ: number; width: number; curviness: number; branching: number; rng: () => number }): VillagePlan {
  const { halfX: hx, halfZ: hz, width, rng } = options;
  const alongZ = hz >= hx;
  const L = alongZ ? hz : hx;
  const S = alongZ ? hx : hz;
  // Axis frame (a along the main street, b across it) → district XZ.
  const toXZ = (a: number, b: number): Vec2 => (alongZ ? [b, a] : [a, b]);
  const offset = (rng() - 0.5) * S * 0.3;
  const amp = options.curviness * S * 0.2;
  const wavelength = 2 * L * (0.8 + rng() * 0.6);
  const phase = rng() * Math.PI * 2;
  const across = (a: number): number => offset + amp * Math.sin((a / wavelength) * Math.PI * 2 + phase);
  const steps = Math.max(4, Math.ceil((2 * L) / 3));
  const hubA = (rng() - 0.5) * L * 0.5;
  const hubStep = Math.max(1, Math.min(steps - 1, Math.round(((hubA + L) / (2 * L)) * steps)));
  const main: Vec2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = -L + (2 * L * i) / steps;
    main.push(toXZ(a, across(a)));
  }
  const hub = main[hubStep]!;
  const hubAcross = across(-L + (2 * L * hubStep) / steps);
  // The side lane heads for the roomier side of the main street; a crossing lane runs on through.
  const sign = hubAcross > 0 ? -1 : 1;
  const room = S - sign * hubAcross;
  const branch = room >= Math.max(14, width * 3);
  const crossing = branch && options.branching > 0.7 && S + sign * hubAcross >= Math.max(14, width * 3);
  const hubAlong = -L + (2 * L * hubStep) / steps;
  const lanePoints = (toward: number): Vec2[] => {
    const span = S - toward * hubAcross;
    const count = Math.max(2, Math.ceil(span / 3));
    const lean = (rng() - 0.5) * Math.min(span * 0.25, 6) * options.curviness;
    const pts: Vec2[] = [];
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      pts.push(toXZ(hubAlong + lean * Math.sin(t * Math.PI * 0.5), hubAcross + toward * span * t));
    }
    return pts;
  };
  const nodes: StreetNode[] = [];
  const addNode = ([x, z]: Vec2): number => {
    nodes.push({ id: nodes.length, x, z, degree: 0 });
    return nodes.length - 1;
  };
  const edges: StreetEdge[] = [];
  const addEdge = (a: number, b: number, points: Vec2[], level: StreetLevel, w: number): void => {
    edges.push({ id: edges.length, a, b, points, width: w, level, loop: false });
    nodes[a]!.degree += 1;
    nodes[b]!.degree += 1;
  };
  const streets: Street[] = [];
  const junctions: StreetJunction[] = [];
  const start = addNode(main[0]!);
  const end = addNode(main[main.length - 1]!);
  const laneWidth = Math.max(2.5, width * 0.85);
  if (!branch) {
    addEdge(start, end, main, "street", width);
    streets.push({ id: 0, nodes: [start, end], points: main, width, level: "street", loop: false, features: [] });
  } else {
    const j = addNode(hub);
    addEdge(start, j, main.slice(0, hubStep + 1), "street", width);
    addEdge(j, end, main.slice(hubStep), "street", width);
    streets.push({ id: 0, nodes: [start, j, end], points: main, width, level: "street", loop: false, features: [] });
    const out = lanePoints(sign);
    const outEnd = addNode(out[out.length - 1]!);
    addEdge(j, outEnd, out, "lane", laneWidth);
    const armAngle = (from: Vec2, to: Vec2): number => Math.atan2(to[0] - from[0], to[1] - from[1]);
    const arms = [
      { angle: armAngle(hub, main[hubStep - 1]!), width },
      { angle: armAngle(hub, main[hubStep + 1]!), width },
      { angle: armAngle(hub, out[1]!), width: laneWidth },
    ];
    if (crossing) {
      const back = lanePoints(-sign);
      const backEnd = addNode(back[back.length - 1]!);
      addEdge(j, backEnd, back, "lane", laneWidth);
      arms.push({ angle: armAngle(hub, back[1]!), width: laneWidth });
      streets.push({ id: 1, nodes: [backEnd, j, outEnd], points: [...back].reverse().concat(out.slice(1)), width: laneWidth, level: "lane", loop: false, features: [] });
    } else {
      streets.push({ id: 1, nodes: [j, outEnd], points: out, width: laneWidth, level: "lane", loop: false, features: [] });
    }
    junctions.push({ x: hub[0], z: hub[1], radius: width * 0.9, level: "street", arms });
  }
  const prev = main[Math.max(0, hubStep - 1)]!;
  const next = main[Math.min(main.length - 1, hubStep + 1)]!;
  const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
  const along: Vec2 = [(next[0] - prev[0]) / len, (next[1] - prev[1]) / len];
  const sideDir = toXZ(0, sign);
  return {
    network: { mode: "net", nodes, edges, streets, junctions, deadEnds: [], bridges: [], tunnels: [], loops: 0 },
    hub,
    along,
    side: [sideDir[0], sideDir[1]],
  };
}

/**
 * The village green: an octagon tucked into the corner between the main street and the side lane
 * (or beside the main street at its middle when there is no side lane), sized to the hamlet and kept
 * inside the footprint. Parcels are never cut into it.
 */
export function villageGreen(plan: VillagePlan, options: { halfX: number; halfZ: number; width: number; rng: () => number }): Vec2[] {
  const { hub, along, side } = plan;
  const { halfX: hx, halfZ: hz, width, rng } = options;
  const radius = Math.max(4, Math.min(10, Math.min(hx, hz) * 0.28));
  const lane = plan.network.streets[1];
  const alongSign = rng() < 0.5 ? -1 : 1;
  const sideOffset = width / 2 + 1.2 + radius;
  const alongOffset = lane === undefined ? 0 : alongSign * (lane.width / 2 + 1.2 + radius);
  const cx = Math.max(-hx + radius + 0.5, Math.min(hx - radius - 0.5, hub[0] + side[0] * sideOffset + along[0] * alongOffset));
  const cz = Math.max(-hz + radius + 0.5, Math.min(hz - radius - 0.5, hub[1] + side[1] * sideOffset + along[1] * alongOffset));
  const base = Math.atan2(along[1], along[0]) + Math.PI / 8;
  const ring: Vec2[] = [];
  for (let k = 0; k < 8; k += 1) {
    const a = base + (k / 8) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
  }
  return ring;
}
