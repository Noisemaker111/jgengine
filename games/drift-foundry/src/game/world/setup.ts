import { seededStreams } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { MAIN_ROUTE } from "@jgengine/core/world/routeCourse";
import { scatter } from "@jgengine/core/world/scatter";

import {
  EXIT_GATE_ARCH,
  GATE_BARRICADE_JUMP,
  GATE_BARRICADE_PLOW,
  PICKUP_STATIONS,
  JUMP_CUE,
  PROP_YARD_LAMP,
  PROP_YARD_TOWER,
  TRACK_OBJECT,
} from "../objects/catalog";
import { EXIT_Z, RUN_SEED } from "../run/constants";
import { gateStanding, type RouteGate } from "../route/gates";
import { ZONES } from "../zones/catalog";
import { partById } from "../parts/catalog";
import { ROW_SIX_TRACK, TRACKS, type Track } from "../tracks/catalog";

const CORRIDOR_AVOID = { minX: -21, maxX: 21 };
const PROP_COUNT_PER_ZONE = 46;
/** Floodlights alternate sides down the corridor edge — the vertical beat that reads as speed. */
const LAMP_SPACING_Z = 34;
const LAMP_X = 23.5;
/** Water towers punctuate the skyline; sparse on purpose, they are the tallest thing in the yard. */
const TOWER_POSITIONS: readonly (readonly [number, number])[] = [
  [-58, 74],
  [62, 168],
  [-64, 262],
  [56, 352],
  [-56, 438],
];

export interface PropRow {
  instanceId: string;
  z: number;
}

function placeIdempotent(
  ctx: GameContext,
  catalogId: string,
  x: number,
  y: number,
  z: number,
  instanceId: string,
  rotation?: number,
): void {
  ctx.scene.object.remove(instanceId);
  ctx.scene.object.place(catalogId, x, y, z, { instanceId, ...(rotation === undefined ? {} : { rotation }) });
}

/** Row Six's corridor scenery: the zone scatter, the floodlights and the water towers the crusher eats. */
export function placeZoneDressing(ctx: GameContext): readonly PropRow[] {
  const rows: PropRow[] = [];
  for (const zone of ZONES) {
    const stream = seededStreams(RUN_SEED)(`props-${zone.id}`);
    const points = scatter({
      area: { w: 108, d: zone.end - zone.start, center: [0, (zone.start + zone.end) / 2] },
      count: PROP_COUNT_PER_ZONE,
      seed: `drift-foundry-props-${zone.id}`,
      minDistance: 3.4,
      avoid: [{ minX: CORRIDOR_AVOID.minX, minZ: zone.start, maxX: CORRIDOR_AVOID.maxX, maxZ: zone.end }],
    });
    points.forEach((point, index) => {
      const propId = zone.propIds[Math.min(zone.propIds.length - 1, Math.floor(stream() * zone.propIds.length))]!;
      const instanceId = `prop-${zone.id}-${index}`;
      const y = ctx.world.groundHeightAt(point.x, point.z);
      const rotationY = stream() * Math.PI * 2;
      placeIdempotent(ctx, propId, point.x, y, point.z, instanceId, rotationY);
      rows.push({ instanceId, z: point.z });
    });
  }
  rows.push(...placeCorridorLamps(ctx), ...placeYardTowers(ctx));
  return rows.sort((a, b) => a.z - b.z);
}

function placeCorridorLamps(ctx: GameContext): PropRow[] {
  const rows: PropRow[] = [];
  for (let index = 0, z = 18; z < EXIT_Z; z += LAMP_SPACING_Z, index += 1) {
    const x = index % 2 === 0 ? -LAMP_X : LAMP_X;
    const instanceId = `lamp-${index}`;
    placeIdempotent(ctx, PROP_YARD_LAMP, x, ctx.world.groundHeightAt(x, z), z, instanceId, x < 0 ? 0 : Math.PI);
    rows.push({ instanceId, z });
  }
  return rows;
}

function placeYardTowers(ctx: GameContext): PropRow[] {
  return TOWER_POSITIONS.map(([x, z], index) => {
    const instanceId = `tower-${index}`;
    placeIdempotent(ctx, PROP_YARD_TOWER, x, ctx.world.groundHeightAt(x, z), z, instanceId);
    return { instanceId, z };
  });
}

/**
 * Every other track's standing scenery, placed once for the whole yard: posts down each route edge,
 * lamps alternating sides, clutter scattered off the road, the landmarks, and the set-pieces that
 * show where each hazard is — vents beside the slag, belts in the road, signals at the crossings.
 */
export function placeTrackScenery(ctx: GameContext): number {
  let placed = 0;
  const put = (catalogId: string, x: number, z: number, instanceId: string, rotation?: number, lift = 0) => {
    placeIdempotent(ctx, catalogId, x, ctx.world.groundHeightAt(x, z) + lift, z, instanceId, rotation);
    placed += 1;
  };
  for (const track of TRACKS) {
    const dressing = track.def.dressing;
    if (dressing === undefined) continue;
    const id = track.id;
    track.course.edges(dressing.edgeSpacing, -0.6).forEach((post, index) => put(dressing.edge, post.x, post.z, `${id}-edge-${index}`, post.heading));

    const main = track.course.routes.find((route) => route.id === MAIN_ROUTE)!;
    let lamp = 0;
    for (let s = 10; s < main.length - 5; s += dressing.lampSpacing, lamp += 1) {
      const side = lamp % 2 === 0 ? 1 : -1;
      const at = track.course.pointAt(MAIN_ROUTE, s, side * (track.def.halfWidth + 1.6));
      put(dressing.lamp, at.x, at.z, `${id}-lamp-${lamp}`, at.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
    }

    const b = track.course.bounds;
    const stream = seededStreams(RUN_SEED)(`track-props-${id}`);
    const liquid = track.def.liquid?.level;
    const candidates = scatter({
      area: { minX: b.minX - 45, minZ: b.minZ - 45, maxX: b.maxX + 45, maxZ: b.maxZ + 45 },
      count: dressing.scatterCount * 4,
      seed: `drift-foundry-track-props-${id}`,
      minDistance: 6,
    });
    let kept = 0;
    for (const point of candidates) {
      if (kept >= dressing.scatterCount) break;
      // Off the road with a five-metre margin.
      const fix = track.locate(point.x, point.z);
      if (Math.abs(fix.offset) < fix.halfWidth + 5 || track.course.contains(point.x, point.z)) continue;
      if (liquid !== undefined && ctx.world.groundHeightAt(point.x, point.z) < liquid + 0.3) continue;
      const object = dressing.scatter[Math.floor(stream() * dressing.scatter.length)]!;
      put(object, point.x, point.z, `${id}-prop-${kept}`, stream() * Math.PI * 2);
      kept += 1;
    }

    dressing.landmarks.forEach((mark, index) => {
      if (typeof mark.at === "number") {
        const at = track.point(MAIN_ROUTE, mark.at, mark.side ?? 0);
        put(mark.object, at.x, at.z, `${id}-mark-${index}`, mark.rotation ?? at.heading + Math.PI / 2);
      } else {
        put(mark.object, mark.at[0], mark.at[1], `${id}-mark-${index}`, mark.rotation ?? 0);
      }
    });

    for (const span of track.hazardSpans) {
      const mid = (span.from + span.to) / 2;
      const centre = track.course.pointAt(span.route, mid);
      const hw = centre.halfWidth;
      if (span.kind === "slag") {
        for (const side of [1, -1]) {
          const at = track.course.pointAt(span.route, mid, side * (hw + 2.6));
          put(TRACK_OBJECT.slagVent, at.x, at.z, `${id}-vent-${span.id}-${side}`, at.heading);
        }
      } else if (span.kind === "train") {
        for (const side of [1, -1]) {
          const before = track.course.pointAt(span.route, Math.max(0, span.from - 3), side * (hw + 1.4));
          put(TRACK_OBJECT.crossing, before.x, before.z, `${id}-xing-${span.id}-${side}`, before.heading);
        }
      } else if (span.kind === "belt") {
        const band = span.offset ?? [-hw, hw];
        const width = band[1] - band[0];
        for (let s = span.from + 4, n = 0; s < span.to; s += 8, n += 1) {
          for (let lane = 0; lane < Math.ceil(width / 8); lane += 1) {
            const offset = band[0] + 4 + lane * 8;
            const at = track.course.pointAt(span.route, s, width < 8 ? (band[0] + band[1]) / 2 : Math.min(offset, band[1] - 4));
            put(TRACK_OBJECT.belt, at.x, at.z, `${id}-belt-${span.id}-${n}-${lane}`, at.heading, 0.02);
          }
        }
      } else if (span.kind === "flood") {
        const at = track.course.pointAt(span.route, span.from, hw + 4);
        put(TRACK_OBJECT.pumpRig, at.x, at.z, `${id}-pump-${span.id}`, at.heading);
      }
    }
  }
  return placed;
}

/** Width covered by a single barricade prop — segments are tiled to seal a wider span. */
const BARRICADE_SEGMENT_WIDTH = 8;
const gateSegments = (span: number) => Math.max(1, Math.ceil(span / BARRICADE_SEGMENT_WIDTH) + 1);

function placeGate(ctx: GameContext, track: Track, gate: RouteGate): void {
  const catalogId = gate.requirement === "plow" ? GATE_BARRICADE_PLOW : GATE_BARRICADE_JUMP;
  const span = gate.laneX[1] - gate.laneX[0];
  // +1 so the even spacing lands at <= one segment width apart and the props seal the span solidly.
  const segments = gateSegments(span);
  const flat = track === ROW_SIX_TRACK;
  if (gate.requirement === "jump") {
    const cue = track.point(gate.route, gate.atZ - 10, 0);
    placeIdempotent(ctx, JUMP_CUE, cue.x, ctx.world.groundHeightAt(cue.x, cue.z) + 0.03, cue.z, `cue-${gate.id}`, flat ? undefined : cue.heading);
  }
  for (let i = 0; i < segments; i += 1) {
    // Even spacing across the lane band so a road-spanning gate reads as a solid wall.
    const t = segments === 1 ? 0.5 : i / (segments - 1);
    const at = track.point(gate.route, gate.atZ, gate.laneX[0] + t * span);
    placeIdempotent(ctx, catalogId, at.x, ctx.world.groundHeightAt(at.x, at.z), at.z, `gate-${gate.id}-${i}`, flat ? undefined : at.heading);
  }
}

function removeGate(ctx: GameContext, gate: RouteGate): void {
  for (let i = 0; i < gateSegments(gate.laneX[1] - gate.laneX[0]); i++) ctx.scene.object.remove(`gate-${gate.id}-${i}`);
  ctx.scene.object.remove(`cue-${gate.id}`);
}

/** The track's barricades. A set-piece barricade (`dropsAt`) is open road until it falls; see {@link syncDroppedGates}. */
export function placeGateBarricades(ctx: GameContext, track: Track = ROW_SIX_TRACK): void {
  for (const gate of track.gates) {
    if (gate.dropsAt !== undefined) {
      removeGate(ctx, gate);
      continue;
    }
    placeGate(ctx, track, gate);
  }
}

/** Barricades that fall mid-run: placed once the run clock passes their drop, unless already smashed. */
export function syncDroppedGates(ctx: GameContext, track: Track, runTime: number, cleared: ReadonlySet<string>, dropped: Set<string>): void {
  for (const gate of track.gates) {
    if (gate.dropsAt === undefined || dropped.has(gate.id) || cleared.has(gate.id) || !gateStanding(gate, runTime)) continue;
    dropped.add(gate.id);
    placeGate(ctx, track, gate);
  }
}

export function placePickupMarkers(ctx: GameContext, track: Track = ROW_SIX_TRACK): void {
  for (const pickup of track.pickups) {
    const y = ctx.world.groundHeightAt(pickup.position[0], pickup.position[2]);
    const slot = partById(pickup.partId)!.slot;
    placeIdempotent(ctx, PICKUP_STATIONS[slot], pickup.position[0], y, pickup.position[2], `marker-${pickup.id}`);
  }
}

export function placeExitGate(ctx: GameContext, track: Track = ROW_SIX_TRACK): void {
  const at = track.point(MAIN_ROUTE, track.exitAt, 0);
  placeIdempotent(ctx, EXIT_GATE_ARCH, at.x, ctx.world.groundHeightAt(at.x, at.z), at.z, "exit-gate", track === ROW_SIX_TRACK ? undefined : at.heading);
}

/** Take one track's run objects off the yard before another track's go down. */
export function clearRunObjects(ctx: GameContext, track: Track): void {
  for (const gate of track.gates) removeGate(ctx, gate);
  for (const pickup of track.pickups) ctx.scene.object.remove(`marker-${pickup.id}`);
  ctx.scene.object.remove("exit-gate");
}

/** Everything one run on `track` races through: its barricades, its drops and its exit gate. */
export function placeRunObjects(ctx: GameContext, track: Track): void {
  placeGateBarricades(ctx, track);
  placePickupMarkers(ctx, track);
  placeExitGate(ctx, track);
}

export function syncPickupMarkers(ctx: GameContext, collected: ReadonlySet<string>, removed: Set<string>, track: Track = ROW_SIX_TRACK): void {
  for (const pickup of track.pickups) {
    if (!collected.has(pickup.id) || removed.has(pickup.id)) continue;
    removed.add(pickup.id);
    ctx.scene.object.remove(`marker-${pickup.id}`);
  }
}

export function syncCompactorRow(ctx: GameContext, compactorZ: number, rows: readonly PropRow[], cursor: { index: number }): void {
  const margin = 6;
  while (cursor.index < rows.length && rows[cursor.index]!.z < compactorZ - margin) {
    ctx.scene.object.remove(rows[cursor.index]!.instanceId);
    cursor.index += 1;
  }
}

export function syncClearedGates(ctx: GameContext, cleared: ReadonlySet<string>, removed: Set<string>, track: Track = ROW_SIX_TRACK): void {
  for (const gate of track.gates) {
    if (!cleared.has(gate.id) || removed.has(gate.id)) continue;
    removed.add(gate.id);
    removeGate(ctx, gate);
  }
}

/** Freight wagons per train, and each wagon's length. */
const TRAIN_WAGONS = 5;
const WAGON_LENGTH = 17.25;

/**
 * Where the freight is on each crossing at `time`: a train long enough to fill the crossing for its
 * whole red window, rolling in before it and out after it, square across the road.
 */
export function freightWagons(track: Track, time: number): { id: string; position: [number, number, number]; rotationY: number }[] {
  const out: { id: string; position: [number, number, number]; rotationY: number }[] = [];
  for (const span of track.hazardSpans) {
    if (span.kind !== "train" || span.cycle === undefined) continue;
    const { period, active, phase = 0 } = span.cycle;
    const centre = track.course.pointAt(span.route, (span.from + span.to) / 2);
    const width = 2 * centre.halfWidth + 4;
    const length = TRAIN_WAGONS * WAGON_LENGTH;
    const speed = (length - width) / active;
    let tau = (((time - phase) % period) + period) % period;
    if (tau > period / 2) tau -= period;
    const front = width / 2 + speed * tau;
    // Across the road: the left normal of the road's heading.
    const ax = Math.cos(centre.heading);
    const az = -Math.sin(centre.heading);
    for (let i = 0; i < TRAIN_WAGONS; i += 1) {
      const along = front - WAGON_LENGTH * (i + 0.5);
      if (Math.abs(along) > 160) continue;
      out.push({
        id: `${span.id}-wagon-${i}`,
        position: [centre.x + ax * along, centre.elevation, centre.z + az * along],
        rotationY: centre.heading + Math.PI / 2,
      });
    }
  }
  return out;
}
