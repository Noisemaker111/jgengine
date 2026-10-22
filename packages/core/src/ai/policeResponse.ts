import { devtools } from "../devtools/devtools";
import type { EditorMarker } from "../editor/types";
import type { LaneGraph } from "../nav/laneGraph";
import {
  advanceHeat,
  createHeatState,
  type HeatConfig,
  type HeatGain,
  type HeatPoint,
  type HeatState,
} from "./heatSystem";

/** How police answer the current heat tier — watching the streets up to cordoning them. */
export type PoliceResponseKind = "patrol" | "investigate" | "pursue" | "roadblock";

/** One response tier: the heat it begins at, what it puts on the street, and how wide it searches. */
export interface PoliceTier {
  response: PoliceResponseKind;
  /** Cumulative heat at which this tier begins. Ascending across the table. */
  threshold: number;
  /** Pursuers this tier wants active on the street. */
  pursuers: number;
  /** Radius, metres, of the search area while the trail is fresh. */
  searchRadius: number;
  /** Roadblock sites this tier holds, chosen from the authored road data. */
  roadblocks: number;
}

/** The starting tier table: patrol until heat arrives, then investigate, pursue and finally cordon. */
export const DEFAULT_POLICE_TIERS: readonly PoliceTier[] = [
  { response: "investigate", threshold: 20, pursuers: 1, searchRadius: 25, roadblocks: 0 },
  { response: "pursue", threshold: 60, pursuers: 3, searchRadius: 40, roadblocks: 0 },
  { response: "roadblock", threshold: 120, pursuers: 5, searchRadius: 55, roadblocks: 3 },
];

/**
 * One remembered sighting of the suspect, as the perception service reports it —
 * `PerceptionMemory` from `sensor/perception` satisfies this shape.
 */
export interface PoliceSighting {
  lastKnownPos: readonly [number, number, number];
  lastSeenAt: number;
  confidence: number;
  /** Whose senses produced the fact, and the observe pass it arrived on. */
  sourceId: string;
  sourceTick: number;
}

/**
 * The witness seam: perception memory, queried by observer id. Pass `createPerception`
 * (`sensor/perception`) straight in — a crime is witnessed when an observer still holds the suspect
 * in view, so there is no second sight path to keep in step.
 */
export interface PoliceWitness {
  memoryOf(observerId: string, targetId: string): PoliceSighting | null;
}

/** A lane near a world point: its id, the arc of the nearest point on it, and how far away that is. */
export interface PoliceLaneHit {
  lane: string;
  arc: number;
  distance: number;
}

/** A roadblock site on a lane, resolved from authored road data. */
export interface PoliceRoadblockSite {
  id: string;
  lane: string;
  /** Arc along `lane` where the block sits. */
  arc: number;
  /** World XZ of the block, on the lane centerline. */
  at: HeatPoint;
  /** Lane heading there, so the blocking vehicle faces along the road. */
  heading: number;
}

/** Road data the response reads: nearby lanes for the search area, authored sites for roadblocks. */
export interface PoliceRoads {
  /** Lanes within `radius` metres of a point, nearest first, at most `limit` of them. */
  lanesNear(x: number, z: number, radius: number, limit: number): readonly PoliceLaneHit[];
  /** Every authored roadblock site, sorted by id. */
  roadblockSites(): readonly PoliceRoadblockSite[];
}

/** The serializable policy of a response: the tier table, the heat curve and the search shape. */
export interface PoliceTuning {
  /** Sorted ascending by `threshold`; level 0 (patrol) is implicit below the first. */
  tiers: readonly PoliceTier[];
  /** Heat bled per second once the suspect has broken sight. */
  decayPerSecond: number;
  /** Extra seconds after the last witnessed gain before decay starts. Default 0. */
  decayDelaySeconds: number;
  /** Seconds at zero heat with pursuers alive before the response stands down. */
  standDownSeconds: number;
  /** Seconds out of every witness's sight before the suspect has escaped. */
  escapeSeconds: number;
  /** How stale a sighting may be and still count as "in view", seconds. */
  inViewGraceSeconds: number;
  /** Metres per second the search area grows while the trail is cold. */
  searchGrowthPerSecond: number;
  /** Cap on the grown search radius, metres. */
  searchRadiusMax: number;
  /** Most lanes reported in one search area. */
  searchLaneLimit: number;
  /** Most roadblocks held at once, whatever the tier asks for. */
  roadblockLimit: number;
  /** Heat ceiling; omit for unbounded. */
  maxHeat?: number;
  /** `[min, max]` radius for spawn points; omit to skip ring generation. */
  spawnRingRadius?: readonly [number, number];
  /** Seed for the injected generator that rolls spawn points. Same seed, same ring. */
  seed?: number;
}

/** The starting policy: linear decay, a six-second escape and a search area that grows at 2 m/s. */
export const DEFAULT_POLICE_TUNING: PoliceTuning = {
  tiers: DEFAULT_POLICE_TIERS,
  decayPerSecond: 10,
  decayDelaySeconds: 0,
  standDownSeconds: 6,
  escapeSeconds: 6,
  inViewGraceSeconds: 0.25,
  searchGrowthPerSecond: 2,
  searchRadiusMax: 90,
  searchLaneLimit: 12,
  roadblockLimit: 4,
  seed: 1,
};

/** Everything {@link createPoliceResponse} needs: the witness seam, the roster and the caller's policy. */
export interface PoliceResponseConfig extends Partial<PoliceTuning> {
  witness: PoliceWitness;
  /** Bounded roster of observer ids to ask each tick. The caller owns and bounds it. */
  observers: () => readonly string[];
  /** The id the witness roster remembers the suspect by. */
  suspectId: string;
  /** Lane data for the search area and roadblocks; omit for a radius-only search and no roadblocks. */
  roads?: PoliceRoads;
  /** Register a devtools probe under this name so the overlay shows heat, tier and search work. */
  devtoolsName?: string;
}

/** Where the search is, as the last sighting places it. */
export interface PoliceSearchArea {
  /** Centre: the suspect's last known world XZ. */
  center: HeatPoint;
  /** Radius, metres — the tier's own radius, grown while the trail goes cold. */
  radius: number;
  /** Lane ids inside the area, nearest first. Empty without `roads`. */
  lanes: readonly string[];
  /** Perception clock of the sighting that anchored the area. */
  lastSeenAt: number;
  sourceId: string;
  sourceTick: number;
}

/** Per-tick world facts {@link PoliceResponse.tick} needs but cannot derive itself. */
export interface PoliceTickContext {
  /** The clock the witness memories are stamped on, milliseconds — the same one `observe` got. */
  nowMs: number;
  /** Pursuers the caller currently has on the street. */
  activePursuers: number;
  /** Origin for spawn points; usually the suspect. */
  around: HeatPoint;
}

/** One tick's answer: the heat, the tier, the search area, the cordon and the escape. */
export interface PoliceStep {
  heat: number;
  /** `null` below the first threshold — the implicit patrol response. */
  tier: PoliceTier | null;
  response: PoliceResponseKind;
  tierChanged: boolean;
  pursuerBudget: number;
  /** `max(0, pursuerBudget - activePursuers)` — how many more pursuers to send this tick. */
  wantPursuers: number;
  /** `wantPursuers` points on the configured ring around `ctx.around`; empty without `spawnRingRadius`. */
  spawnPoints: readonly HeatPoint[];
  searchArea: PoliceSearchArea | null;
  /** Sites the cordon holds this tick, nearest to the search centre first. */
  roadblocks: readonly PoliceRoadblockSite[];
  /** Seconds since any witness last had the suspect in view. */
  outOfSightSeconds: number;
  /** True once out of sight for `escapeSeconds`; decay runs while it holds. */
  escaped: boolean;
  /** True exactly the tick pursuit should fully clear — despawn every remaining pursuer. */
  standDown: boolean;
}

/** Counters a devtools probe, a HUD or a test reads. */
export interface PoliceStats {
  heat: number;
  response: PoliceResponseKind;
  ticks: number;
  /** Crimes reported through `reportCrime`. */
  crimes: number;
  /** Of those, the ones a witness held the suspect in view for. */
  witnessed: number;
  /** Sightings that moved the search area's anchor. */
  sightings: number;
  /** Times the suspect broke sight for `escapeSeconds`. */
  escapes: number;
  /** Ticks a roadblock tier held a cordon. */
  roadblockTicks: number;
  /** Witness queries made in the last tick — one per observer. */
  sightingsChecked: number;
  /** Lanes the last search area covered. */
  lanesInArea: number;
  /** Authored sites inside the last search area. */
  roadblockSites: number;
  /** Slowest single `tick` seen so far, milliseconds. */
  slowestTickMs: number;
}

/** Serializable response state — the heat curve, the sight timer, the anchor and the counters. */
export interface PoliceResponseState {
  tunables: PoliceTuning;
  heat: HeatState;
  outOfSightSeconds: number;
  lastSighting: { position: HeatPoint; at: number; sourceId: string; sourceTick: number } | null;
  /** Crimes reported since the last tick, judged for a witness on the next one. */
  pending: readonly number[];
  counters: {
    ticks: number;
    crimes: number;
    witnessed: number;
    sightings: number;
    escapes: number;
    roadblockTicks: number;
  };
}

/** Stateful wanted/pursuit API with retuning and save/restore support. */
export interface PoliceResponse {
  /** Report a crime. Whether it raises heat is decided on the next tick, from witness memory. */
  reportCrime(amount: number): void;
  tick(dt: number, ctx: PoliceTickContext): PoliceStep;
  /** Heat right now and the tier it resolves to. */
  wanted(): { heat: number; tier: PoliceTier | null; response: PoliceResponseKind };
  /** The search area from the last tick, or `null`. */
  searchArea(): PoliceSearchArea | null;
  /** The cordon from the last tick. */
  roadblocks(): readonly PoliceRoadblockSite[];
  stats(): PoliceStats;
  retune(patch: Partial<PoliceTuning>): void;
  state(): PoliceResponseState;
  restore(next: PoliceResponseState): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const MAX_PENDING_CRIMES = 64;

function resolveTuning(base: PoliceTuning, patch: Partial<PoliceTuning> | undefined): PoliceTuning {
  const next: PoliceTuning = { ...base, tiers: base.tiers.map((tier) => ({ ...tier })) };
  if (patch !== undefined) {
    if (patch.tiers !== undefined) next.tiers = patch.tiers.map((tier) => ({ ...tier }));
    for (const key of [
      "decayPerSecond",
      "decayDelaySeconds",
      "standDownSeconds",
      "escapeSeconds",
      "inViewGraceSeconds",
      "searchGrowthPerSecond",
      "searchRadiusMax",
      "searchLaneLimit",
      "roadblockLimit",
    ] as const) {
      const value = patch[key];
      if (typeof value === "number" && Number.isFinite(value)) next[key] = Math.max(0, value);
    }
    if (typeof patch.maxHeat === "number" && Number.isFinite(patch.maxHeat)) next.maxHeat = Math.max(0, patch.maxHeat);
    if (patch.spawnRingRadius !== undefined) {
      next.spawnRingRadius = [patch.spawnRingRadius[0], patch.spawnRingRadius[1]];
    }
    if (typeof patch.seed === "number" && Number.isFinite(patch.seed)) next.seed = patch.seed;
  }
  next.inViewGraceSeconds = Math.max(0.001, next.inViewGraceSeconds);
  next.escapeSeconds = Math.max(0.001, next.escapeSeconds);
  next.searchLaneLimit = Math.max(0, Math.floor(next.searchLaneLimit));
  next.roadblockLimit = Math.max(0, Math.floor(next.roadblockLimit));
  validateTuning(next);
  return next;
}

function validateTuning(tuning: PoliceTuning): void {
  if (tuning.tiers.length === 0) throw new Error("tiers must hold at least one entry.");
  let previous = -Infinity;
  for (const tier of tuning.tiers) {
    if (!Number.isFinite(tier.threshold) || tier.threshold < 0) throw new Error(`tier "${tier.response}" threshold must be non-negative.`);
    if (tier.threshold <= previous) throw new Error("tiers must ascend by threshold.");
    previous = tier.threshold;
    for (const field of ["pursuers", "searchRadius", "roadblocks"] as const) {
      const value = tier[field];
      if (!Number.isFinite(value) || value < 0) throw new Error(`tier "${tier.response}" ${field} must be non-negative.`);
    }
  }
  if (!Number.isFinite(tuning.decayPerSecond) || tuning.decayPerSecond < 0) throw new Error("decayPerSecond must be non-negative.");
  if (!Number.isFinite(tuning.searchRadiusMax) || tuning.searchRadiusMax < 0) throw new Error("searchRadiusMax must be non-negative.");
  if (tuning.spawnRingRadius !== undefined) {
    const [min, max] = tuning.spawnRingRadius;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      throw new Error("spawnRingRadius must be a finite [min, max] with min >= 0.");
    }
  }
}

function heatConfigOf(tuning: PoliceTuning): HeatConfig {
  return {
    levels: tuning.tiers.map((tier, index) => ({ level: index + 1, threshold: tier.threshold, pursuerBudget: tier.pursuers })),
    ...(tuning.maxHeat === undefined ? {} : { maxHeat: tuning.maxHeat }),
    decayPerSecond: tuning.decayPerSecond,
    decayDelaySeconds: tuning.decayDelaySeconds,
    standDownSeconds: tuning.standDownSeconds,
    ...(tuning.spawnRingRadius === undefined ? {} : { spawnRingRadius: tuning.spawnRingRadius }),
    ...(tuning.seed === undefined ? {} : { seed: tuning.seed }),
  };
}

function tierFor(tiers: readonly PoliceTier[], heat: number): PoliceTier | null {
  let current: PoliceTier | null = null;
  for (const tier of tiers) if (heat >= tier.threshold) current = tier;
  return current;
}

/**
 * The wanted level a crime sandbox needs, over the shared heat curve: a crime raises heat only while
 * a witness holds the suspect in view, the heat bleeds on a stated linear curve once the suspect has
 * been out of every witness's sight for `escapeSeconds`, the tier table decides what police do
 * (patrol → investigate → pursue → roadblock), the search area sits where the suspect was last seen
 * and grows while the trail is cold, and a roadblock tier cordons it with authored sites off the lane
 * graph. Heat, tiers and curves are caller policy; witness facts come from `sensor/perception` memory
 * (`sourceId`/`sourceTick` kept), so there is no second sight path.
 *
 * Deterministic: observers are asked in roster order, ties break on id, and the injected generator is
 * the only source of variety. Bounded per tick: one memory query per observer, one indexed lane query,
 * one pass over the authored roadblock sites, no path search.
 *
 * @capability police-response witness-gated heat, tiered police response, last-sighting search areas and lane-graph roadblocks
 */
export function createPoliceResponse(config: PoliceResponseConfig): PoliceResponse {
  const witness = config.witness;
  const observers = config.observers;
  const suspectId = config.suspectId;
  const roads = config.roads;

  let tuning = resolveTuning(DEFAULT_POLICE_TUNING, config);
  let heatState = createHeatState(heatConfigOf(tuning));
  let outOfSightSeconds = 0;
  let escaped = false;
  let lastSighting: { position: HeatPoint; at: number; sourceId: string; sourceTick: number } | null = null;
  const pending: number[] = [];
  let lastTier: PoliceTier | null = null;
  let lastArea: PoliceSearchArea | null = null;
  let lastRoadblocks: readonly PoliceRoadblockSite[] = [];
  let counters = { ticks: 0, crimes: 0, witnessed: 0, sightings: 0, escapes: 0, roadblockTicks: 0, slowestTickMs: 0 };
  let sightingsChecked = 0;
  let lanesInArea = 0;
  let roadblockSites = 0;

  /** The freshest sighting on the roster, which is also what "in view" and the search area read. */
  function freshest(): PoliceSighting | null {
    let best: PoliceSighting | null = null;
    sightingsChecked = 0;
    for (const observerId of observers()) {
      sightingsChecked += 1;
      const sighting = witness.memoryOf(observerId, suspectId);
      if (sighting === null) continue;
      if (best === null || sighting.lastSeenAt > best.lastSeenAt) best = sighting;
    }
    return best;
  }

  function responseLine(): string {
    const area = lastArea === null ? "no area" : `${lastArea.radius.toFixed(0)} m area ${lastArea.lanes.length} lanes`;
    return (
      `${heatState.heat.toFixed(0)} heat ${lastTier?.response ?? "patrol"} ${area} ${lastRoadblocks.length} roadblocks ` +
      `${outOfSightSeconds.toFixed(1)} s out of sight ${counters.escapes} escapes ` +
      `${counters.witnessed}/${counters.crimes} witnessed ${counters.slowestTickMs.toFixed(2)} ms slowest`
    );
  }

  const unregister = config.devtoolsName === undefined ? null : devtools.probes.register(config.devtoolsName, () => responseLine());

  function advance(dt: number, ctx: PoliceTickContext): PoliceStep {
    const started = performance.now();
    const sighting = freshest();
    const inView = sighting !== null && ctx.nowMs - sighting.lastSeenAt <= tuning.inViewGraceSeconds * 1000;
    if (sighting !== null && (lastSighting === null || sighting.lastSeenAt > lastSighting.at)) {
      lastSighting = {
        position: [sighting.lastKnownPos[0], sighting.lastKnownPos[2]],
        at: sighting.lastSeenAt,
        sourceId: sighting.sourceId,
        sourceTick: sighting.sourceTick,
      };
      counters.sightings += 1;
    }

    outOfSightSeconds = inView ? 0 : outOfSightSeconds + dt;
    const nowEscaped = outOfSightSeconds >= tuning.escapeSeconds;
    if (nowEscaped && !escaped) counters.escapes += 1;
    escaped = nowEscaped;

    const gains: HeatGain[] = [];
    for (const amount of pending) gains.push({ amount, witnessed: inView });
    counters.crimes += pending.length;
    if (inView) counters.witnessed += pending.length;
    pending.length = 0;

    const heatStep = advanceHeat(heatConfigOf(tuning), heatState, dt, gains, {
      nearWitness: !escaped,
      activePursuers: ctx.activePursuers,
      around: ctx.around,
    });
    heatState = heatStep.state;

    const tier = tierFor(tuning.tiers, heatState.heat);
    const tierChanged = (tier?.threshold ?? null) !== (lastTier?.threshold ?? null);
    lastTier = tier;

    let area: PoliceSearchArea | null = null;
    lanesInArea = 0;
    if (tier !== null && lastSighting !== null) {
      const radius = Math.min(tuning.searchRadiusMax, tier.searchRadius + outOfSightSeconds * tuning.searchGrowthPerSecond);
      const lanes = roads === undefined ? [] : roads.lanesNear(lastSighting.position[0], lastSighting.position[1], radius, tuning.searchLaneLimit);
      lanesInArea = lanes.length;
      area = {
        center: lastSighting.position,
        radius,
        lanes: lanes.map((hit) => hit.lane),
        lastSeenAt: lastSighting.at,
        sourceId: lastSighting.sourceId,
        sourceTick: lastSighting.sourceTick,
      };
    }
    lastArea = area;

    let roadblocks: readonly PoliceRoadblockSite[] = [];
    roadblockSites = 0;
    if (tier !== null && tier.roadblocks > 0 && area !== null && roads !== undefined) {
      const wanted = Math.min(tier.roadblocks, tuning.roadblockLimit);
      const inside: { site: PoliceRoadblockSite; distance: number }[] = [];
      for (const site of roads.roadblockSites()) {
        const distance = Math.hypot(site.at[0] - area.center[0], site.at[1] - area.center[1]);
        if (distance > area.radius) continue;
        inside.push({ site, distance });
      }
      roadblockSites = inside.length;
      inside.sort(
        (a, b) => a.distance - b.distance || (a.site.id < b.site.id ? -1 : a.site.id > b.site.id ? 1 : 0),
      );
      roadblocks = inside.slice(0, wanted).map((entry) => entry.site);
      if (roadblocks.length > 0) counters.roadblockTicks += 1;
    }
    lastRoadblocks = roadblocks;

    counters.ticks += 1;
    counters.slowestTickMs = Math.max(counters.slowestTickMs, performance.now() - started);

    return {
      heat: heatState.heat,
      tier,
      response: tier?.response ?? "patrol",
      tierChanged,
      pursuerBudget: heatStep.pursuerBudget,
      wantPursuers: heatStep.wantSpawns,
      spawnPoints: heatStep.spawnPoints,
      searchArea: area,
      roadblocks,
      outOfSightSeconds,
      escaped,
      standDown: heatStep.standDown,
    };
  }

  return {
    reportCrime(amount) {
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("reportCrime amount must be positive.");
      pending.push(amount);
      if (pending.length > MAX_PENDING_CRIMES) pending.shift();
    },
    tick(dt, ctx) {
      if (!Number.isFinite(dt) || dt < 0) throw new Error("dt must be finite and non-negative.");
      if (!Number.isFinite(ctx.nowMs)) throw new Error("ctx.nowMs must be finite.");
      return advance(dt, ctx);
    },
    wanted: () => ({ heat: heatState.heat, tier: lastTier, response: lastTier?.response ?? "patrol" }),
    searchArea: () => lastArea,
    roadblocks: () => lastRoadblocks,
    stats: () => ({
      heat: heatState.heat,
      response: lastTier?.response ?? "patrol",
      ticks: counters.ticks,
      crimes: counters.crimes,
      witnessed: counters.witnessed,
      sightings: counters.sightings,
      escapes: counters.escapes,
      roadblockTicks: counters.roadblockTicks,
      sightingsChecked,
      lanesInArea,
      roadblockSites,
      slowestTickMs: counters.slowestTickMs,
    }),
    retune(patch) {
      tuning = resolveTuning(tuning, patch);
    },
    state() {
      return {
        tunables: { ...tuning, tiers: tuning.tiers.map((tier) => ({ ...tier })) },
        heat: { ...heatState },
        outOfSightSeconds,
        lastSighting: lastSighting === null ? null : { ...lastSighting, position: [...lastSighting.position] as HeatPoint },
        pending: pending.slice(),
        counters: {
          ticks: counters.ticks,
          crimes: counters.crimes,
          witnessed: counters.witnessed,
          sightings: counters.sightings,
          escapes: counters.escapes,
          roadblockTicks: counters.roadblockTicks,
        },
      };
    },
    restore(next) {
      tuning = resolveTuning(DEFAULT_POLICE_TUNING, next.tunables);
      heatState = { ...next.heat };
      outOfSightSeconds = Math.max(0, next.outOfSightSeconds);
      lastSighting =
        next.lastSighting === null
          ? null
          : { ...next.lastSighting, position: [...next.lastSighting.position] as HeatPoint };
      pending.length = 0;
      for (const amount of next.pending) pending.push(amount);
      counters = { ...next.counters, slowestTickMs: 0 };
      escaped = outOfSightSeconds >= tuning.escapeSeconds;
      lastTier = tierFor(tuning.tiers, heatState.heat);
      lastArea = null;
      lastRoadblocks = [];
      lanesInArea = 0;
      roadblockSites = 0;
      sightingsChecked = 0;
    },
    dispose() {
      unregister?.();
    },
  };
}

/** How the document reader recognizes authored road content. */
export interface PoliceRoadsOptions {
  /** Marker kinds authored as one roadblock site each. Default `["traffic_roadblock"]`. */
  roadblockKinds?: readonly string[];
  /** Metres a marker may sit from a lane and still become a site. Default 8. */
  joinRadius?: number;
  /** Grid cell, metres, the lane index is bucketed by. Default 8. */
  cellSize?: number;
}

/**
 * Read the police road data out of an authored lane graph: `traffic_roadblock` markers become
 * cordon sites projected onto the lane they block, and lanes are indexed so `lanesNear` answers from
 * the local cells rather than a scan of every lane. With no roadblock markers authored, the graph's
 * intersections are the sites, so a cordon still sits where streets meet. Built once; the index is
 * rebuildable from the document, so it is never serialized.
 *
 * @capability police-roads lane-graph roadblock sites and an indexed nearby-lane query for search areas
 */
export function policeRoadsFromLaneGraph(
  graph: LaneGraph,
  markers: readonly EditorMarker[] = [],
  options: PoliceRoadsOptions = {},
): PoliceRoads {
  const cellSize = Math.max(0.5, options.cellSize ?? 8);
  const joinRadius = Math.max(0, options.joinRadius ?? 8);
  const kinds = new Set(options.roadblockKinds ?? ["traffic_roadblock"]);
  const buckets = new Map<string, Set<string>>();
  const step = Math.max(0.5, cellSize / 2);

  for (const laneId of graph.laneIds()) {
    const lane = graph.lane(laneId);
    if (lane === null) continue;
    for (let i = 0; i < lane.points.length - 1; i += 1) {
      const a = lane.points[i]!;
      const b = lane.points[i + 1]!;
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const steps = Math.max(1, Math.ceil(span / step));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const key = `${Math.floor((a[0] + (b[0] - a[0]) * t) / cellSize)},${Math.floor((a[2] + (b[2] - a[2]) * t) / cellSize)}`;
        let bucket = buckets.get(key);
        if (bucket === undefined) {
          bucket = new Set();
          buckets.set(key, bucket);
        }
        bucket.add(laneId);
      }
    }
  }

  function lanesNear(x: number, z: number, radius: number, limit: number): readonly PoliceLaneHit[] {
    if (!(radius > 0) || limit <= 0) return [];
    const hits: PoliceLaneHit[] = [];
    const seen = new Set<string>();
    for (let cx = Math.floor((x - radius) / cellSize); cx <= Math.floor((x + radius) / cellSize); cx += 1) {
      for (let cz = Math.floor((z - radius) / cellSize); cz <= Math.floor((z + radius) / cellSize); cz += 1) {
        const bucket = buckets.get(`${cx},${cz}`);
        if (bucket === undefined) continue;
        for (const laneId of bucket) {
          if (seen.has(laneId)) continue;
          seen.add(laneId);
          const arc = graph.project(laneId, x, z);
          const pose = graph.pose(laneId, arc);
          if (pose === null) continue;
          const distance = Math.hypot(pose.position[0] - x, pose.position[2] - z);
          if (distance > radius) continue;
          hits.push({ lane: laneId, arc, distance });
        }
      }
    }
    hits.sort((a, b) => a.distance - b.distance || (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : 0));
    return hits.slice(0, limit);
  }

  const sites: PoliceRoadblockSite[] = [];
  for (const marker of markers) {
    if (!kinds.has(marker.kind)) continue;
    const hit = lanesNear(marker.position.x, marker.position.z, joinRadius, 1)[0];
    if (hit === undefined) continue;
    const pose = graph.pose(hit.lane, hit.arc);
    if (pose === null) continue;
    sites.push({
      id: marker.id,
      lane: hit.lane,
      arc: hit.arc,
      at: [pose.position[0], pose.position[2]],
      heading: pose.heading,
    });
  }
  if (sites.length === 0) {
    for (const intersection of graph.intersections()) {
      const lane = intersection.outLanes[0];
      if (lane === undefined) continue;
      sites.push({
        id: `node:${intersection.node}`,
        lane,
        arc: 0,
        at: [intersection.at[0], intersection.at[2]],
        heading: graph.heading(lane, 0),
      });
    }
  }
  sites.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    lanesNear,
    roadblockSites: () => sites,
  };
}
