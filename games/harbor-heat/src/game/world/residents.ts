import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { tickCooldown } from "@jgengine/core/time/cooldown";
import {
  createOffScreenWorld,
  resolveRoutine,
  type NearAgents,
  type NearHandoff,
  type NearSpawn,
  type OffScreenWorld,
  type RoutineTimeline,
} from "@jgengine/core/gameplay";
import type { AgentScheduleStop } from "@jgengine/core/agents/schedule";
import type { Vec3 } from "@jgengine/core/world/geometry";
import type { NavMeshData } from "@jgengine/core/nav/navMesh";
import { createNavTiles, navTileFromGrid, type NavTileRequest, type NavTiles } from "@jgengine/core/nav/navTiles";

import { editorLayers } from "../../editorLayers";
import { fearAt, PANIC_FEAR } from "../cityRuntime";
import { createResidentAgents, residentAgentStore, type ResidentAgentSystem } from "./residentAgents";
import { cityRoadWidth, type CityLayout } from "../../engine-local/city/cityLayout";
import { nearestOnPath } from "@jgengine/core/roads/roads";

import { cityLayout, LOT_ROADS } from "./cityLayout";
import { onCityRelaid, type BuildingFootprintXZ } from "./setup";

/**
 * Mainsail's named residents (D1.1, engine B1.3): every resident follows an authored day — home,
 * work, a meal, home again — resolved against the world clock by `resolveRoutine`, and the population
 * is split by distance through `createOffScreenWorld`, so a resident across the city is a schedule, a
 * position and a needs record and costs nothing per frame.
 *
 * The near half is this city's own: residents walk around the authored buildings on nav tiles
 * streamed around the player, so a resident that comes into range appears exactly where the cheap state already had it and
 * walks on from there.
 */

/** One game day in game-seconds — the same 720 s the clock in `game.config.ts` runs on. */
export const CYCLE_SECONDS = 720;
/** Walking pace in metres per game-second. */
const WALK_SPEED = 1.35;
/** Distance at which a resident is simulated for real, and the band past which it goes cheap again. */
const NEAR_RADIUS = 62;
const FAR_RADIUS = 88;
/** Most residents that may switch sides of the boundary in one tick. */
const SWITCH_BUDGET = 4;
/** How close a walker must be to a waypoint before it turns for the next one. */
const WAYPOINT_REACH = 0.6;

/** An authored `resident_place` marker: where a routine stop actually happens. */
export interface ResidentPlace {
  id: string;
  label: string;
  position: readonly [number, number, number];
}

export const RESIDENT_PLACES: readonly ResidentPlace[] = editorLayers.markers
  .filter((marker) => marker.kind === "resident_place")
  .map((marker) => ({
    id: marker.id,
    label: marker.label ?? marker.id,
    position: [marker.position.x, marker.position.y, marker.position.z] as const,
  }));

const PLACES: Readonly<Record<string, readonly [number, number, number]>> = Object.fromEntries(
  RESIDENT_PLACES.map((place) => [place.id, place.position]),
);

/**
 * One resident: a name, the model it wears, and the three authored places its day runs between. The
 * times are content (one shared coastal work day); the places are the scene document's.
 */
export interface ResidentSpec {
  id: string;
  name: string;
  kind: string;
  home: string;
  work: string;
  meal: string;
}

export const RESIDENTS: readonly ResidentSpec[] = [
  { id: "rosa", name: "Rosa Quill", kind: "ped_beach", home: "place_home_gull", work: "place_shack", meal: "place_kiosk" },
  { id: "tino", name: "Tino Bate", kind: "ped_beach", home: "place_kiosk", work: "place_home_gull", meal: "place_shack" },
  { id: "mae", name: "Mae Sonder", kind: "ped_beach", home: "place_shack", work: "place_kiosk", meal: "place_home_gull" },
  { id: "walt", name: "Walt Gorse", kind: "ped_beach", home: "place_home_salt", work: "place_cafe", meal: "place_market" },
  { id: "dee", name: "Dee Marrow", kind: "ped_beach", home: "place_diner", work: "place_market", meal: "place_cafe" },
  { id: "ada", name: "Ada Verge", kind: "ped_city", home: "place_home_verge", work: "place_newsstand", meal: "place_busstop" },
  { id: "cyrus", name: "Cyrus Mott", kind: "ped_beach", home: "place_kiosk", work: "place_shack", meal: "place_kiosk" },
  { id: "ines", name: "Ines Rook", kind: "ped_city", home: "place_diner", work: "place_newsstand", meal: "place_busstop" },
  { id: "pim", name: "Pim Tallow", kind: "ped_city", home: "place_home_verge", work: "place_corner_cafe", meal: "place_cafe" },
  { id: "juno", name: "Juno Marsh", kind: "ped_city", home: "place_home_salt", work: "place_corner_cafe", meal: "place_newsstand" },
  { id: "elroy", name: "Elroy Snapp", kind: "ped_city", home: "place_diner", work: "place_busstop", meal: "place_newsstand" },
  { id: "nia", name: "Nia Pike", kind: "ped_city", home: "place_flat", work: "place_offices", meal: "place_avenue_cafe" },
  { id: "ossie", name: "Ossie Rand", kind: "ped_city", home: "place_avenue_cafe", work: "place_offices", meal: "place_flat" },
  { id: "bex", name: "Bex Corvo", kind: "ped_city", home: "place_flat", work: "place_avenue_cafe", meal: "place_offices" },
  { id: "tess", name: "Tess Amado", kind: "ped_city", home: "place_offices", work: "place_flat", meal: "place_avenue_cafe" },
  { id: "rufus", name: "Rufus Hake", kind: "ped_city", home: "place_avenue_cafe", work: "place_flat", meal: "place_offices" },
  { id: "opal", name: "Opal Vey", kind: "ped_city", home: "place_flat", work: "place_avenue_cafe", meal: "place_flat" },
  { id: "hollis", name: "Hollis Fen", kind: "ped_docks", home: "place_canteen", work: "place_docks", meal: "place_warehouse" },
  { id: "gil", name: "Gil Roper", kind: "ped_docks", home: "place_warehouse", work: "place_canteen", meal: "place_docks" },
  { id: "ned", name: "Ned Scurry", kind: "ped_docks", home: "place_docks", work: "place_warehouse", meal: "place_canteen" },
  { id: "cass", name: "Cass Dobbs", kind: "ped_docks", home: "place_canteen", work: "place_warehouse", meal: "place_docks" },
  { id: "wren", name: "Wren Fitch", kind: "ped_docks", home: "place_warehouse", work: "place_docks", meal: "place_canteen" },
];

/**
 * Time to walk between two authored places, in game-seconds.
 *
 * Whole seconds on purpose: a fractional boundary plus the engine's `wrap()` loses a bit, which makes
 * `RoutineTimeline.nextChangeAfter(t)` return `t` itself for a far resident refreshed exactly on a
 * departure — `createOffScreenWorld` then spins on that boundary forever. Integer stops keep the
 * boundary comparison exact.
 */
export function walkTime(from: string, to: string): number {
  const a = PLACES[from];
  const b = PLACES[to];
  if (a === undefined || b === undefined) return 0;
  return Math.ceil(Math.hypot(a[0] - b[0], a[2] - b[2]) / WALK_SPEED);
}

/**
 * One resident's day, as authored stops. Shared by the routine the city walks and the agent schedule
 * that decides the same resident's meals and moods, so the two can never disagree.
 */
export function residentStops(spec: ResidentSpec, index: number): AgentScheduleStop[] {
  // Up to twenty minutes off the shared work day, so neighbours leave for lunch at different times.
  const jitter = ((index * 13) % 21) - 10;
  return [
    { place: spec.home, arriveAt: 0, activity: "sleep" },
    { place: spec.work, arriveAt: 240 + jitter, activity: "work" },
    { place: spec.meal, arriveAt: 372 + jitter, activity: "meal", refill: { hunger: 45 } },
    { place: spec.work, arriveAt: 450 + jitter, activity: "work" },
    { place: spec.home, arriveAt: 630 + jitter, activity: "home" },
  ];
}

/**
 * One resident's day resolved against the world clock: home overnight, work from the morning, a
 * proper sit-down meal at lunch, a second stretch at work and home for the evening.
 */
export function routineFor(spec: ResidentSpec, index: number): RoutineTimeline {
  return resolveRoutine({
    cycleSeconds: CYCLE_SECONDS,
    travelSeconds: walkTime,
    stops: residentStops(spec, index),
  });
}

interface Walker {
  id: string;
  entityId: string;
  path: readonly NavPoint[];
  index: number;
  position: [number, number, number];
  /** Where the walk is headed, kept apart from the path: a route into tiles not yet loaded ends short of it. */
  goal: readonly [number, number];
  /** The route stopped short of the goal at the edge of the loaded tiles. */
  partial: boolean;
}

/** A point on a walker's route, world XZ. */
type NavPoint = readonly [number, number];

/** The near half: nav-mesh routes stepped along by hand, one entity per resident in range. */
interface CityWalkers extends NearAgents {
  count(): number;
  /** Where a walker's route currently ends, in world XZ, for a caller deciding whether to re-aim it. */
  goal(id: string): readonly [number, number] | null;
}

/** Where walk tiles may stand, metres. */
const WALK_BOUNDS = { min: [-320, -320] as const, max: [320, 320] as const };
/** A walk tile's edge and its sampling cell, metres. */
const WALK_TILE = 64;
const WALK_CELL = 2;
/** Walk tiles load this far from the player and stay until past the keep band: a near walker's whole block, plus where it is headed. */
const WALK_LOAD_RADIUS = NEAR_RADIUS + WALK_TILE;
const WALK_KEEP_RADIUS = WALK_LOAD_RADIUS + WALK_TILE;
/** Room a walker keeps from a wall, metres: half a body plus a step. */
const WALL_CLEARANCE = 1.8;
/** Area id of the carriageway; a step on it costs this many sidewalk steps, so walkers keep to the pavement and cross where they must. */
const ROAD_AREA = 1;
const ROAD_STEP_COST = 6;

/** Whether a point is on a street's carriageway (kerb to kerb) as the layout draws it now. */
function onCarriageway(layout: CityLayout, x: number, z: number): boolean {
  for (const road of LOT_ROADS) {
    const near = nearestOnPath(road.path, x, z);
    if (near !== null && near.distance < cityRoadWidth(layout, road.roadClass) / 2) return true;
  }
  return false;
}

interface LotBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Every lot's rotated footprint as the box a walker keeps out of, wall clearance included. */
function lotBoxes(buildings: readonly BuildingFootprintXZ[]): LotBox[] {
  return buildings.map((lot) => {
    const c = Math.abs(Math.cos(lot.rotationY));
    const s = Math.abs(Math.sin(lot.rotationY));
    const halfX = lot.halfW * c + lot.halfD * s + WALL_CLEARANCE;
    const halfZ = lot.halfW * s + lot.halfD * c + WALL_CLEARANCE;
    return { minX: lot.x - halfX, minZ: lot.z - halfZ, maxX: lot.x + halfX, maxZ: lot.z + halfZ };
  });
}

/**
 * One walk tile of the city as a walker sees it: the lots blocked and the carriageway costly, both
 * from the layout as it is now. Only the lots and roads reaching this tile are read.
 */
function walkTile(tile: NavTileRequest, boxes: readonly LotBox[], layout: CityLayout, ground: (x: number, z: number) => number): NavMeshData {
  const [x0, z0] = tile.bounds.min;
  const [x1, z1] = tile.bounds.max;
  const here = boxes.filter((box) => box.maxX > x0 && box.minX < x1 && box.maxZ > z0 && box.minZ < z1);
  return navTileFromGrid({
    bounds: tile.bounds,
    cellSize: WALK_CELL,
    heightAt: ground,
    areaAt(x, z) {
      for (const box of here) if (x >= box.minX && x < box.maxX && z >= box.minZ && z < box.maxZ) return null;
      return onCarriageway(layout, x, z) ? ROAD_AREA : 0;
    },
  });
}

/**
 * Build the near half: residents that walk the city's sidewalks on nav tiles of the blocks as the
 * layout lays them. Tiles stream in around the player, a slider re-lay rebuilds the loaded ones, and
 * a route that ended at the edge of the loaded tiles is planned again once more of the city loads.
 */
function createCityWalkers(ctx: GameContext, buildings: readonly BuildingFootprintXZ[]): CityWalkers {
  let boxes = lotBoxes(buildings);
  const ground = (x: number, z: number) => ctx.world.groundHeightAt(x, z);
  const tiles: NavTiles = createNavTiles({
    tileSize: WALK_TILE,
    build: (tile) => walkTile(tile, boxes, cityLayout.get(), ground),
    areaCosts: { [ROAD_AREA]: ROAD_STEP_COST },
    maxNodes: 4096,
    streaming: { area: WALK_BOUNDS, loadRadius: WALK_LOAD_RADIUS, keepRadius: WALK_KEEP_RADIUS, loadsPerUpdate: 1, unloadsPerUpdate: 1 },
    devtoolsName: "harbor.walkTiles",
  });
  const walkers = new Map<string, Walker>();

  function route(walker: Walker): void {
    const [x, , z] = walker.position;
    const path = tiles.runtime.plan([x, ground(x, z), z], [walker.goal[0], ground(walker.goal[0], walker.goal[1]), walker.goal[1]]);
    const end = path?.points[path.points.length - 1];
    walker.path = path === null ? [walker.goal] : path.points.map((point): NavPoint => [point[0], point[2]]);
    walker.partial = end === undefined || Math.hypot(end[0] - walker.goal[0], end[2] - walker.goal[1]) > WAYPOINT_REACH;
    walker.index = 0;
  }

  const follow = () => {
    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player === null) return;
    const changed = tiles.follow({ x: player.position[0], z: player.position[2] });
    if (changed.load.length === 0 && changed.unload.length === 0) return;
    for (const walker of walkers.values()) if (walker.partial) route(walker);
  };
  follow();

  const stopRelay = onCityRelaid(ctx, (relaid) => {
    boxes = lotBoxes(relaid);
    tiles.invalidate({ min: WALK_BOUNDS.min, max: WALK_BOUNDS.max });
    for (const walker of walkers.values()) route(walker);
  });

  const kindOf = new Map(RESIDENTS.map((spec) => [spec.id, spec.kind]));

  return {
    spawn(next: NearSpawn) {
      if (walkers.has(next.id)) return;
      const entityId = `resident-${next.id}`;
      // A restored world can still hold this resident's body while the schedule has it far: the near
      // copy owns the id, so the stale one goes rather than colliding with `spawn`.
      if (ctx.scene.entity.get(entityId) !== null) ctx.scene.entity.despawn(entityId);
      const [x, , z] = next.position;
      ctx.scene.entity.spawn(kindOf.get(next.id) ?? "ped_city", {
        id: entityId,
        position: [x, ctx.world.groundHeightAt(x, z), z],
        rotationY: 0,
        role: "npc",
      });
      const walker: Walker = {
        id: next.id,
        entityId,
        path: [],
        index: 0,
        position: [x, next.position[1], z],
        goal: [next.goal[0], next.goal[2]],
        partial: false,
      };
      route(walker);
      walkers.set(next.id, walker);
    },
    despawn(id: string): NearHandoff | null {
      const walker = walkers.get(id);
      if (walker === undefined) return null;
      ctx.scene.entity.despawn(walker.entityId);
      walkers.delete(id);
      return { position: walker.position, needs: {} };
    },
    position(id: string) {
      const walker = walkers.get(id);
      if (walker === undefined) return null;
      return ctx.scene.entity.get(walker.entityId)?.position ?? walker.position;
    },
    setGoal(id: string, goal) {
      const walker = walkers.get(id);
      if (walker === undefined) return;
      walker.goal = [goal[0], goal[2]];
      route(walker);
    },
    tick(dt: number) {
      if (!(dt > 0)) return;
      follow();
      for (const walker of walkers.values()) {
        const entity = ctx.scene.entity.get(walker.entityId);
        if (entity === null) continue;
        let [x, , z] = entity.position;
        const fromX = x;
        const fromZ = z;
        let budget = WALK_SPEED * dt;
        while (budget > 0 && walker.index < walker.path.length) {
          const target = walker.path[walker.index]!;
          const dx = target[0] - x;
          const dz = target[1] - z;
          const distance = Math.hypot(dx, dz);
          if (distance <= WAYPOINT_REACH) {
            walker.index += 1;
            continue;
          }
          const step = Math.min(budget, distance);
          x += (dx / distance) * step;
          z += (dz / distance) * step;
          budget -= step;
        }
        const moved = Math.abs(x - fromX) > 1e-6 || Math.abs(z - fromZ) > 1e-6;
        const y = ctx.world.groundHeightAt(x, z);
        walker.position = [x, y, z];
        if (moved || Math.abs(entity.position[1] - y) > 0.05) {
          ctx.scene.entity.setPose(walker.entityId, {
            position: [x, y, z],
            rotationY: moved ? Math.atan2(x - fromX, z - fromZ) : entity.rotationY,
            dt,
          });
        }
      }
    },
    count: () => walkers.size,
    goal(id) {
      const walker = walkers.get(id);
      return walker === undefined ? null : walker.goal;
    },
    dispose() {
      stopRelay();
      tiles.dispose();
      for (const walker of walkers.values()) ctx.scene.entity.despawn(walker.entityId);
      walkers.clear();
    },
  };
}

/** One resident as the HUD reads them: who, how they feel, and what they decided to do. */
export interface ResidentCard {
  id: string;
  name: string;
  mood: number;
  moodLabel: string;
  doing: string;
}

/** The nearest few residents, refreshed a few times a second for the HUD. */
export const residentBoardStore = defineStore<readonly ResidentCard[]>("harbor.residentBoard", []);

const BOARD_RADIUS = 46;
const BOARD_SIZE = 3;
const BOARD_INTERVAL = 0.4;

interface CityResidents {
  world: OffScreenWorld;
  near: CityWalkers;
  people: ResidentAgentSystem;
  /** Place each near body was last aimed at, so a decision re-routes once rather than every tick. */
  aimed: Map<string, string>;
  boardTimer: number;
  day: number;
}

const residentsStore = perContext<{ value: CityResidents | null }>(() => ({ value: null }));

function city(ctx: GameContext): CityResidents | null {
  return residentsStore(ctx).value;
}

const PLACE_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  RESIDENT_PLACES.map((place) => [place.id, place.label]),
);

function placeOf(id: string): Vec3 | null {
  return PLACES[id] ?? null;
}

/**
 * Build Mainsail's population: one off-screen world over the authored places, one resident per
 * authored day, the near half that walks the ones in range, and one agent system over the whole cast.
 */
export function setupResidents(ctx: GameContext, buildings: readonly BuildingFootprintXZ[]): void {
  const near = createCityWalkers(ctx, buildings);
  const world = createOffScreenWorld({
    places: PLACES,
    needs: [],
    policy: { nearRadius: NEAR_RADIUS, farRadius: FAR_RADIUS, switchBudget: SWITCH_BUDGET },
    near,
    residents: RESIDENTS.map((spec, index) => ({
      id: spec.id,
      home: PLACES[spec.home] ?? [0, 0, 0],
      routine: routineFor(spec, index),
    })),
    devtoolsName: "harbor.residents",
  });
  const people = createResidentAgents({
    clock: ctx.time,
    rng: ctx.rng,
    position: (id) => world.agent(id)?.position ?? null,
    places: placeOf,
    storage: {
      read: () => residentAgentStore.read(ctx),
      write: (next) => residentAgentStore.write(ctx, next),
    },
  });
  residentsStore(ctx).value = {
    world,
    near,
    people,
    aimed: new Map(),
    boardTimer: 0,
    day: Math.floor(ctx.time.now() / CYCLE_SECONDS),
  };
}

/** Split the population by distance, advance the ones in range, then let every resident decide. */
export function tickResidents(ctx: GameContext, dt: number): void {
  const residents = city(ctx);
  if (residents === null) return;
  const now = ctx.time.now();
  const player = ctx.scene.entity.get(ctx.player.userId);
  residents.world.tick(dt, now, player?.position ?? [0, 0, 0]);
  residents.people.system.tick(dt);
  applyDecisions(residents, now, dt, (x, z) => fearAt(ctx, x, z));
  publishBoard(ctx, residents, dt);
  // A day is the natural save point: the cast writes its needs and moods into the world save once a cycle.
  const day = Math.floor(now / CYCLE_SECONDS);
  if (day !== residents.day) {
    residents.day = day;
    residents.people.system.save();
  }
}

/**
 * Where a near body should walk: an urgent need overrides the day (a hungry resident leaves its
 * shift for a meal, a spent one goes home), and otherwise the authored routine owns the walk. The
 * walker is only re-aimed when its route ends somewhere other than that answer, so a resident never
 * replans on every frame.
 */
function applyDecisions(residents: CityResidents, now: number, dt: number, fear: (x: number, z: number) => number): void {
  for (const id of residents.world.ids()) {
    const view = residents.world.agent(id);
    if (view === null || view.mode !== "near") continue;
    const agent = residents.people.system.get(id);
    if (agent === null) continue;
    const action = residents.people.system.action(id);
    // A scared block outranks every need: residents caught in it head home until the city calms.
    const home = fear(view.position[0], view.position[2]) >= PANIC_FEAR ? residents.people.spec(id)?.home : undefined;
    const urgent = home !== undefined || (action !== null && (action.option === "meal" || action.option === "home"));
    // The member's own day says where it is heading when its needs are not pulling it anywhere.
    const phase = action === null ? null : agent.phaseAt(now);
    const wanted = home ?? (urgent ? action!.target : (phase === null ? null : (phase.nextPlace ?? phase.place)));
    if (wanted === null) continue;
    const place = PLACES[wanted];
    if (place === undefined) continue;
    const goal = residents.near.goal(id);
    if (goal === null || Math.hypot(goal[0] - place[0], goal[1] - place[2]) > 1.5) {
      residents.aimed.set(id, wanted);
      residents.near.setGoal(id, place);
    }
    if (home !== undefined || action === null || action.option !== "meal") continue;
    if (Math.hypot(view.position[0] - place[0], view.position[2] - place[2]) < 3) {
      agent.needs.refill("hunger", 9 * dt);
    }
  }
}

function publishBoard(ctx: GameContext, residents: CityResidents, dt: number): void {
  residents.boardTimer = tickCooldown(residents.boardTimer, dt);
  if (residents.boardTimer > 0) return;
  residents.boardTimer = BOARD_INTERVAL;
  const cards = residents.world
    .ids()
    .map((id) => residents.world.agent(id))
    .filter((view): view is NonNullable<typeof view> => view !== null && view.distance <= BOARD_RADIUS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, BOARD_SIZE)
    .map((view): ResidentCard => {
      const agent = residents.people.system.get(view.id);
      const mood = agent?.mood();
      const action = residents.people.system.action(view.id);
      const scared = fearAt(ctx, view.position[0], view.position[2]) >= PANIC_FEAR;
      const doing = scared
        ? "Running home"
        : action?.target !== null && action?.target !== undefined
          ? (PLACE_LABEL[action.target] ?? view.activity ?? "about")
          : (view.activity === null ? "walking" : PLACE_LABEL[view.place ?? ""] ?? view.activity);
      return {
        id: view.id,
        name: residents.people.spec(view.id)?.name ?? view.id,
        mood: scared ? Math.min(mood?.score ?? 50, 15) : (mood?.score ?? 50),
        moodLabel: scared ? "Scared" : (mood?.label ?? "Fine"),
        doing,
      };
    });
  residentBoardStore.write(ctx, cards);
}

/** Where a resident is and what it is doing, for a HUD, a probe or a test. */
export function residentAt(ctx: GameContext, id: string) {
  return city(ctx)?.world.agent(id) ?? null;
}

/** A resident's live mind: mood and the action its own needs chose, for a probe or a test. */
export function residentMind(ctx: GameContext, id: string) {
  const residents = city(ctx);
  if (residents === null) return null;
  const agent = residents.people.system.get(id);
  if (agent === null) return null;
  return {
    mood: agent.mood(),
    action: residents.people.system.action(id),
    agent,
  };
}

/** Population counters: how many residents exist, how many are simulated, how many are cheap. */
export function residentStats(ctx: GameContext) {
  return city(ctx)?.world.stats() ?? null;
}

/** Tear the population down with the world. */
export function disposeResidents(ctx: GameContext): void {
  const residents = city(ctx);
  if (residents === null) return;
  residents.people.system.save();
  residents.people.system.dispose();
  residents.world.dispose();
  residentsStore(ctx).value = null;
}
