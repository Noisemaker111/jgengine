import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { BodySnapshot } from "@jgengine/core/scene/bodyBind";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EditorDocument } from "@jgengine/core/editor/index";
import { createTraffic, laneGraphFromDocument, type LaneGraph, type Traffic } from "@jgengine/core/world";
import { cityRoadWidth, type CityLayout } from "@jgengine/core/world/cityLayout";
import { nearestOnPath } from "@jgengine/core/world/roads";

import { editorLayers } from "../../editorLayers";
import { cityLayout, LOT_ROADS } from "./cityLayout";

/**
 * Mainsail's street traffic (D1.1): the lane graph, its signals, its kerbside spots and the fleet on
 * it all come from the authored scene document through the engine's lane-graph reader. This module
 * owns only the city's own policy — how busy the streets are at each hour, how the fleet is seeded,
 * and when a car pulls over — and mirrors the fleet onto scene entities with the shared body bind.
 */

/**
 * Every authored lane span is cut at its own junction, so an endpoint that meets a crossing marker
 * sits within this radius of it. Mainsail's crossings are 120 m apart, so nothing else joins.
 */
const JOIN_RADIUS = 7.5;

/** Authored lane levels are the speed policy: an avenue carries 16 m/s, a side street 13. */
const SPEED_BY_LEVEL = { avenue: 16, street: 13 };

/** The car models a traffic variant picks from, indexed by the injected generator's `variant`. */
const CAR_KINDS = ["car_compact", "car_muscle", "car_sport", "car_suv", "car_compact", "car_muscle", "car_suv", "car_sport"];

/**
 * Fleet target by in-game hour. Mainsail has a morning and an evening rush, a busy working day and
 * almost empty small hours — the density change the player watches as the clock runs.
 */
const FLEET_BY_HOUR = [
  8, 6, 5, 5, 6, 12, 24, 44, 66, 78, 72, 68, 72, 68, 72, 80, 92, 100, 94, 84, 70, 50, 34, 20,
];

/** Seconds of game time between demand and parking passes — both are policy, not per-frame work. */
const POLICY_INTERVAL = 2;
/** A parked car holds its kerb for this long before pulling back into the lane, seconds. */
const PARK_DWELL_MAX = 120;
/** A car only takes a free spot it can still reach comfortably, metres. */
const PARK_APPROACH = 90;

interface CityTraffic {
  graph: LaneGraph;
  traffic: Traffic;
  /** Car id → game time it parked, so a car eventually gives the kerb back. */
  parkedAt: Map<string, number>;
  /** Cars that have parked once; they do not take a second spot, so the kerbs stay a sample. */
  hasParked: Set<string>;
  /** Game time of the last demand/parking pass. */
  lastPolicy: number;
}

const cityStore = perContext<{ value: CityTraffic | null; stop: (() => void) | null }>(() => ({ value: null, stop: null }));

function city(ctx: GameContext): CityTraffic | null {
  return cityStore(ctx).value;
}

type LotRoad = (typeof LOT_ROADS)[number];

/** The street a lane or kerb spot runs along: the nearest centreline running the same way. */
function streetFor(x: number, z: number, dirX: number, dirZ: number): { road: LotRoad; side: number; at: readonly [number, number]; normal: readonly [number, number] } | null {
  let best: { road: LotRoad; side: number; at: readonly [number, number]; normal: readonly [number, number]; distance: number } | null = null;
  for (const road of LOT_ROADS) {
    const near = nearestOnPath(road.path, x, z);
    if (near === null) continue;
    const [tx, tz] = near.tangent;
    // A lane runs along its street; a kerb spot (no direction) takes the nearest street outright.
    if ((dirX !== 0 || dirZ !== 0) && Math.abs(tx * dirX + tz * dirZ) < 0.9 * Math.hypot(dirX, dirZ)) continue;
    if (best !== null && near.distance >= best.distance) continue;
    const normal = [-tz, tx] as const;
    const side = Math.sign((x - near.point[0]) * normal[0] + (z - near.point[1]) * normal[1]) || 1;
    best = { road, side, at: near.point, normal, distance: near.distance };
  }
  return best;
}

/** Move a point onto the line `offset` metres to `side` of its street's centreline. */
function onOffset(x: number, z: number, road: LotRoad, side: number, offset: number): { x: number; z: number } {
  const near = nearestOnPath(road.path, x, z);
  if (near === null) return { x, z };
  const [tx, tz] = near.tangent;
  return { x: near.point[0] - tz * side * offset, z: near.point[1] + tx * side * offset };
}

/**
 * The scene document's lanes and kerb spots re-seated on the streets the layout draws now. Authored
 * lanes name their slot (`_in_` the inside lane of a direction, `_out_` the outside one); each moves
 * to its slot's centre for the current lane width, a lane the layout no longer has is dropped (with
 * any lane-change link to it), and kerb spots move to the kerb's parking lane. Junction markers stay
 * where the streets cross.
 */
export function layoutLanes(doc: EditorDocument, layout: CityLayout): Pick<EditorDocument, "paths" | "markers"> {
  const dropped = new Set<string>();
  const paths = doc.paths.flatMap((path) => {
    if (path.kind !== "traffic_lane" || path.points.length < 2) return [path];
    const first = path.points[0]!;
    const last = path.points[path.points.length - 1]!;
    const midX = (first.x + last.x) / 2;
    const midZ = (first.z + last.z) / 2;
    const street = streetFor(midX, midZ, last.x - first.x, last.z - first.z);
    if (street === null) return [path];
    const slot = /_out_/.test(path.id) ? 1 : 0;
    const perSide = Math.max(1, Math.floor((street.road.roadClass === "avenue" ? layout.avenueLanes : layout.streetLanes) / 2));
    if (slot >= perSide) {
      dropped.add(path.id);
      return [];
    }
    const offset = (slot + 0.5) * layout.laneWidth;
    return [{
      ...path,
      points: path.points.map((point) => {
        const moved = onOffset(point.x, point.z, street.road, street.side, offset);
        return { ...point, x: moved.x, z: moved.z };
      }),
    }];
  });
  const unlinked = paths.map((path) => {
    if (path.meta === undefined || dropped.size === 0) return path;
    const meta = { ...path.meta };
    for (const key of ["left", "right"]) if (typeof meta[key] === "string" && dropped.has(meta[key] as string)) delete meta[key];
    return { ...path, meta };
  });
  const markers = doc.markers.map((marker) => {
    if (marker.kind !== "traffic_parking") return marker;
    const street = streetFor(marker.position.x, marker.position.z, 0, 0);
    if (street === null) return marker;
    const parking = street.road.roadClass === "avenue" ? layout.avenueParking : layout.streetParking;
    const offset = cityRoadWidth(layout, street.road.roadClass) / 2 - (parking > 0 ? parking / 2 : 0.6);
    const moved = onOffset(marker.position.x, marker.position.z, street.road, street.side, offset);
    return { ...marker, position: { ...marker.position, x: moved.x, z: moved.z } };
  });
  return { paths: unlinked, markers };
}

/** The lane graph for the layout as it is now, rebuilt from the scene document — never serialized. */
export function laneGraph(layout: CityLayout = cityLayout.get()): LaneGraph {
  return laneGraphFromDocument(layoutLanes(editorLayers, layout), {
    // The street bake renders the roads; the `traffic_lane` paths are the lane graph.
    roadKinds: [],
    joinRadius: JOIN_RADIUS,
    speedByLevel: SPEED_BY_LEVEL,
  });
}

/** Fleet target for an in-game hour, interpolated so a clock jump never steps the count. */
export function fleetAtHour(hour: number): number {
  const wrapped = ((hour % 24) + 24) % 24;
  const lower = FLEET_BY_HOUR[Math.floor(wrapped) % 24]!;
  const upper = FLEET_BY_HOUR[Math.ceil(wrapped) % 24]!;
  const t = wrapped - Math.floor(wrapped);
  return Math.round(lower + (upper - lower) * t);
}

/** Spread the opening fleet along the whole graph so the city starts busy instead of filling from its edges. */
function seedFleet(traffic: Traffic, graph: LaneGraph, count: number): void {
  // Lanes in a stable, non-geographic order so the fleet lands on avenues and side streets alike
  // instead of filling one street type first.
  const lanes = graph
    .laneIds()
    .map((id) => ({ id, key: hashLane(id) }))
    .sort((a, b) => a.key - b.key || (a.id < b.id ? -1 : 1))
    .map((entry) => entry.id);
  let total = 0;
  for (const id of lanes) total += graph.lane(id)?.length ?? 0;
  if (total <= 0) return;
  const spacing = total / count;
  let cursor = spacing * 0.37;
  let placed = 0;
  for (const laneId of lanes) {
    const lane = graph.lane(laneId);
    if (lane === null) continue;
    while (cursor < lane.length && placed < count) {
      if (traffic.add(`traffic-${placed}`, { laneId, arc: cursor, speed: lane.speed * 0.55 })) placed += 1;
      cursor += spacing;
    }
    cursor -= lane.length;
  }
}

/** FNV-style hash of a lane id — a deterministic shuffle with no generator state to keep. */
function hashLane(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** How many of the authored kerb spaces start the scene already occupied. */
const KERB_FILLED_AT_BOOT = 10;

/** Park cars in the authored kerb spaces so the avenue reads as a working street from the first frame. */
function seedKerb(traffic: Traffic, graph: LaneGraph, world: CityTraffic, now: number): void {
  const spots = graph.spots();
  for (let index = 0; index < Math.min(KERB_FILLED_AT_BOOT, spots.length); index += 1) {
    const spot = spots[index]!;
    const id = `parked-${index}`;
    if (!traffic.add(id, { laneId: spot.lane, arc: spot.arc, speed: 0 })) continue;
    if (!traffic.park(id, spot.id)) continue;
    world.parkedAt.set(id, now);
  }
}

/** Pull over into a free kerbside spot on the car's own lane, and later give the kerb back. */
function parkPass(ctx: GameContext, now: number): void {
  const world = city(ctx);
  if (world === null) return;
  const { graph, traffic, parkedAt, hasParked } = world;
  for (const [id, since] of parkedAt) {
    if (!traffic.has(id)) {
      parkedAt.delete(id);
      continue;
    }
    if (now - since >= PARK_DWELL_MAX) {
      traffic.releaseParking(id);
      parkedAt.delete(id);
    }
  }
  for (const spot of graph.spots()) {
    if (traffic.spotOwner(spot.id) !== null) continue;
    let candidate: string | null = null;
    let candidateArc = Number.NEGATIVE_INFINITY;
    traffic.forEachCar((car) => {
      if (car.state !== "driving" || car.spotId !== null || hasParked.has(car.id)) return;
      if (car.laneId !== spot.lane) return;
      if (car.arc >= spot.arc || spot.arc - car.arc > PARK_APPROACH) return;
      if (car.arc <= candidateArc) return;
      candidate = car.id;
      candidateArc = car.arc;
    });
    if (candidate === null) continue;
    if (!traffic.park(candidate, spot.id)) continue;
    hasParked.add(candidate);
    parkedAt.set(candidate, now);
  }
}

/**
 * Create the authored lane graph and put a fleet on it. Called once per world from the game loop;
 * the traffic itself is rebuilt rather than restored, so a save never has to carry a car's arc.
 */
export function setupTraffic(ctx: GameContext): void {
  buildTraffic(ctx);
  const store = cityStore(ctx);
  store.stop?.();
  // A layout slider moves the lanes with the streets: the fleet is rebuilt on the new graph rather
  // than left driving the old lane lines.
  store.stop = cityLayout.subscribe(() => {
    store.value?.traffic.dispose();
    buildTraffic(ctx);
  });
}

function buildTraffic(ctx: GameContext): void {
  const graph = laneGraph();
  const traffic = createTraffic({
    graph,
    seed: "harbor-heat-traffic",
    idPrefix: "traffic",
    devtoolsName: "harbor.traffic",
    tuning: {
      // A coastal city's kerbside parking is tight: a car pulls over rather than stopping short.
      spawnGap: 18,
      laneChangeCooldown: 3.5,
    },
  });
  const now = ctx.time.now();
  const demand = fleetAtHour(ctx.time.calendar().hour);
  seedFleet(traffic, graph, demand);
  traffic.setDemand(demand);
  const world: CityTraffic = { graph, traffic, parkedAt: new Map(), hasParked: new Set(), lastPolicy: now };
  seedKerb(traffic, graph, world, now);
  cityStore(ctx).value = world;
}

/** Advance the fleet, mirror its cars onto scene entities, and re-aim the city's density at the clock. */
export function tickTraffic(ctx: GameContext, dt: number): void {
  const world = city(ctx);
  if (world === null) return;
  const { traffic } = world;
  traffic.tick(dt);
  const now = ctx.time.now();
  if (now - world.lastPolicy >= POLICY_INTERVAL) {
    world.lastPolicy = now;
    traffic.setDemand(fleetAtHour(ctx.time.calendar().hour));
    parkPass(ctx, now);
  }
  const bodies: BodySnapshot[] = [];
  traffic.forEachCar((car) => {
    const [x, , z] = car.position;
    // `role` is only read when the entity is first spawned; passing it every tick would make the body
    // bind write a second store update per car per tick.
    const known = ctx.scene.entity.get(car.id) !== null;
    bodies.push({
      id: car.id,
      kind: CAR_KINDS[car.variant % CAR_KINDS.length]!,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      rotationY: car.heading,
      ...(known ? {} : { role: "prop" as const }),
    });
  });
  ctx.scene.entity.bind("traffic").sync(bodies);
}

/** Fleet counters for a probe or a test. */
export function trafficStats(ctx: GameContext): ReturnType<Traffic["stats"]> | null {
  return city(ctx)?.traffic.stats() ?? null;
}

/** Drop the fleet and its devtools probe; used when a world is torn down. */
export function disposeTraffic(ctx: GameContext): void {
  const store = cityStore(ctx);
  store.stop?.();
  store.stop = null;
  store.value?.traffic.dispose();
  store.value = null;
}
