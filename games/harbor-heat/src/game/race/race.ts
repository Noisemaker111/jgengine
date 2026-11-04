import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { RACE_ROUTES, type RaceRoute } from "../world/districts";
import { vehicleById } from "../entities/vehicles/catalog";
import type { Driving } from "../driving/driving";
import { defineStore } from "@jgengine/core/store/defineStore";
import { rivalsFor, type StreetRival } from "./rivals";

export const RIVAL_RACER_ID = "race_rival";
/** How close to a circuit's start line a car must be for that circuit to start. */
export const RACE_START_RADIUS = 14;
/** A gate's half-height above and below the ground it stands on. */
const GATE_HALF_HEIGHT = 6;

export interface RaceSnapshot {
  routeId: string;
  label: string;
  /** Who the player is racing, and in what. */
  rival: string;
  active: boolean;
  checkpoint: number;
  total: number;
  position: number;
  timeSec: number;
  finished: boolean;
  won: boolean;
  /** Why a race ended without a finish (the player left the car), else null. */
  forfeit: string | null;
}

export const raceStore = defineStore<RaceSnapshot | undefined>("harbor.race", undefined);

/**
 * The race slice: authored street-race circuits, each raced against its own rival from the circuit's
 * crew. Every `route` path in the scene document is a startable race at its start line (last authored
 * checkpoint). Reads the player's world position through the {@link Driving} seam; the race is run in
 * the ground car it started in, and leaving or swapping that car forfeits it.
 */
export interface Race {
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  tick(ctx: GameContext, dt: number): void;
}

function startOf(route: RaceRoute): readonly [number, number] | undefined {
  return route.checkpoints[route.checkpoints.length - 1];
}

/** The circuit whose start line is nearest a world position, and how far it is. */
export function nearestRoute(pos: readonly [number, number, number]): { route: RaceRoute; distance: number } | null {
  let best: { route: RaceRoute; distance: number } | null = null;
  for (const route of RACE_ROUTES) {
    const start = startOf(route);
    if (start === undefined) continue;
    const distance = Math.hypot(pos[0] - start[0], pos[2] - start[1]);
    if (best === null || distance < best.distance) best = { route, distance };
  }
  return best;
}

function rivalLine(rival: StreetRival): string {
  return `${rival.name} · ${vehicleById(rival.car)?.label ?? rival.car}`;
}

export function createRace(driving: Driving): Race {
  let race: RaceState | null = null;
  let activeRoute: RaceRoute | null = null;
  let activeRival: StreetRival | null = null;
  let raceCar: string | null = null;
  let raceStartedAt = 0;
  let rivalState: PathFollowState | null = null;
  let rivalConfig: PathFollowConfig | null = null;

  function snapshot(ctx: GameContext, route: RaceRoute, patch: Partial<RaceSnapshot>): RaceSnapshot {
    return {
      routeId: route.id,
      label: route.label,
      rival: activeRival === null ? "" : rivalLine(activeRival),
      active: true,
      checkpoint: 0,
      total: route.checkpoints.length,
      position: 1,
      timeSec: ctx.time.now() - raceStartedAt,
      finished: false,
      won: false,
      forfeit: null,
      ...patch,
    };
  }

  function endRace(ctx: GameContext, won: boolean, forfeit: string | null = null): void {
    if (activeRoute === null) return;
    const player = race?.standings().find((s) => s.racerId === ctx.player.userId);
    raceStore.write(ctx, snapshot(ctx, activeRoute, { active: false, checkpoint: player?.progress ?? 0, position: won ? 1 : 2, finished: true, won, forfeit }));
    ctx.scene.entity.despawn(RIVAL_RACER_ID);
    race = null;
    activeRoute = null;
    activeRival = null;
    raceCar = null;
    rivalState = null;
    rivalConfig = null;
  }

  function tickRace(ctx: GameContext, dt: number): void {
    if (race === null || activeRoute === null || rivalConfig === null || rivalState === null) return;
    // The race is run in the car it started in: getting out, or into another car, gives it up.
    if (driving.drivingVehicleId() !== raceCar) {
      endRace(ctx, false, "You left the car, so the race is forfeit.");
      return;
    }
    rivalState = advancePathFollow(rivalConfig, rivalState, dt);
    const [rx, , rz] = rivalState.position;
    const ry = ctx.world.groundHeightAt(rx, rz);
    ctx.scene.entity.setPose(RIVAL_RACER_ID, { position: [rx, ry, rz], rotationY: rivalState.heading, dt });
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const events = race.update(ctx.time.now(), {
      [ctx.player.userId]: playerPos,
      [RIVAL_RACER_ID]: [rx, ry, rz] as const,
    });
    if (events.some((event) => event.type === "race.finished")) {
      endRace(ctx, race.standings()[0]?.racerId === ctx.player.userId);
      return;
    }
    const standings = race.standings();
    const player = standings.find((s) => s.racerId === ctx.player.userId);
    const rivalProgress = standings.find((s) => s.racerId === RIVAL_RACER_ID)?.progress ?? 0;
    raceStore.write(ctx, snapshot(ctx, activeRoute, { checkpoint: player?.progress ?? 0, position: (player?.progress ?? 0) >= rivalProgress ? 1 : 2 }));
  }

  return {
    startRace(ctx) {
      if (race !== null) return false;
      const drivenId = driving.drivingVehicleId();
      if (drivenId === null) return false;
      if (vehicleById(ctx.scene.entity.get(drivenId)?.name ?? "")?.dynamics.type !== "ground") return false;
      const playerPos = driving.playerWorldPos(ctx);
      if (playerPos === null) return false;
      const nearest = nearestRoute(playerPos);
      if (nearest === null || nearest.distance > RACE_START_RADIUS) return false;
      const route = nearest.route;
      const checkpoints = route.checkpoints;
      const first = checkpoints[0];
      const start = startOf(route);
      const rival = rivalsFor(route.id)[0];
      if (first === undefined || start === undefined || rival === undefined) return false;
      // Gates stand on the ground under them, so a climb's top gate is as reachable as the harbour's.
      const track = raceTrack({
        checkpoints: checkpoints.map(([x, z], i) => ({
          id: `cp_${i}`,
          center: [x, ctx.world.groundHeightAt(x, z), z] as const,
          half: [10, GATE_HALF_HEIGHT, 10] as const,
        })),
        laps: 1,
      });
      race = createRaceState({ track, win: firstPastPost(1) });
      activeRoute = route;
      raceCar = drivenId;
      raceStartedAt = ctx.time.now();
      race.addRacer(ctx.player.userId, raceStartedAt);
      race.addRacer(RIVAL_RACER_ID, raceStartedAt);
      activeRival = rival;
      // The rival lines up beside the player on the grid, not inside their car.
      const grid: readonly [number, number] = [start[0] + 4, start[1] + 4];
      ctx.scene.entity.spawn(rival.car, {
        id: RIVAL_RACER_ID,
        position: [grid[0], ctx.world.groundHeightAt(grid[0], grid[1]), grid[1]],
        role: "prop",
      });
      rivalConfig = {
        waypoints: [grid, ...checkpoints, first].map(([x, z]) => [x, 0, z] as const),
        speed: rival.pace,
        loop: false,
      };
      rivalState = createPathFollow(rivalConfig);
      raceStore.write(ctx, snapshot(ctx, route, {}));
      return true;
    },
    raceActive: () => race !== null,
    tick: tickRace,
  };
}
