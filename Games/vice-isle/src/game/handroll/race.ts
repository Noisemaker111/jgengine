import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { RACE_ROUTES, type RaceRoute } from "../world/districts";
import { vehicleById } from "../entities/vehicles/catalog";
import type { Driving } from "./driving";
import { RIVAL_RACER_ID, raceStore, type RaceSnapshot } from "./shared";

/**
 * The race slice: authored street-race circuits and their scripted rival racer. Every `route` path in
 * the scene document is a startable race; starting picks the circuit whose start line (last authored
 * checkpoint) is nearest the player. Reads the player's world position through the {@link Driving}
 * seam and gates starting on the player being in a ground vehicle.
 */
export interface Race {
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  tick(ctx: GameContext, dt: number): void;
}

/** The circuit whose start line (last checkpoint) is nearest to a world position. */
export function nearestRoute(pos: readonly [number, number, number]): RaceRoute | null {
  let best: RaceRoute | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const route of RACE_ROUTES) {
    const start = route.checkpoints[route.checkpoints.length - 1];
    if (start === undefined) continue;
    const dist = Math.hypot(pos[0] - start[0], pos[2] - start[1]);
    if (dist < bestDist) {
      best = route;
      bestDist = dist;
    }
  }
  return best;
}

export function createRace(driving: Driving): Race {
  let race: RaceState | null = null;
  let activeRoute: RaceRoute | null = null;
  let raceStartedAt = 0;
  let rivalState: PathFollowState | null = null;
  let rivalConfig: PathFollowConfig | null = null;

  function publishRace(ctx: GameContext, snapshot: RaceSnapshot): void {
    raceStore.write(ctx, snapshot);
  }

  function endRace(ctx: GameContext, won: boolean): void {
    if (activeRoute === null) return;
    const standings = race?.standings() ?? [];
    const player = standings.find((s) => s.racerId === ctx.player.userId);
    publishRace(ctx, {
      routeId: activeRoute.id,
      label: activeRoute.label,
      active: false,
      checkpoint: player?.progress ?? 0,
      total: activeRoute.checkpoints.length,
      position: won ? 1 : 2,
      timeSec: ctx.time.now() - raceStartedAt,
      finished: true,
      won,
    });
    ctx.scene.entity.despawn(RIVAL_RACER_ID);
    race = null;
    activeRoute = null;
    rivalState = null;
    rivalConfig = null;
  }

  function tickRace(ctx: GameContext, dt: number): void {
    if (race === null || activeRoute === null || rivalConfig === null || rivalState === null) return;
    rivalState = advancePathFollow(rivalConfig, rivalState, dt);
    const [rx, , rz] = rivalState.position;
    ctx.scene.entity.setPose(RIVAL_RACER_ID, {
      position: [rx, ctx.world.groundHeightAt(rx, rz), rz],
      rotationY: rivalState.heading,
      dt,
    });
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const events = race.update(ctx.time.now(), {
      [ctx.player.userId]: playerPos,
      [RIVAL_RACER_ID]: [rx, 0, rz] as const,
    });
    const finished = events.find((event) => event.type === "race.finished");
    if (finished !== undefined) {
      const standings = race.standings();
      endRace(ctx, standings[0]?.racerId === ctx.player.userId);
      return;
    }
    const player = race.standings().find((s) => s.racerId === ctx.player.userId);
    const rivalProgress = race.standings().find((s) => s.racerId === RIVAL_RACER_ID)?.progress ?? 0;
    publishRace(ctx, {
      routeId: activeRoute.id,
      label: activeRoute.label,
      active: true,
      checkpoint: player?.progress ?? 0,
      total: activeRoute.checkpoints.length,
      position: (player?.progress ?? 0) >= rivalProgress ? 1 : 2,
      timeSec: ctx.time.now() - raceStartedAt,
      finished: false,
      won: false,
    });
  }

  return {
    startRace(ctx) {
      if (race !== null) return false;
      const drivenId = driving.drivingVehicleId();
      if (drivenId === null) return false;
      if (vehicleById(ctx.scene.entity.get(drivenId)?.name ?? "")?.dynamics.type !== "ground") return false;
      const playerPos = driving.playerWorldPos(ctx);
      if (playerPos === null) return false;
      const route = nearestRoute(playerPos);
      if (route === null || route.checkpoints.length === 0) return false;
      const checkpoints = route.checkpoints;
      const track = raceTrack({
        checkpoints: checkpoints.map(([x, z], i) => ({
          id: `cp_${i}`,
          center: [x, 2, z] as const,
          half: [10, 8, 10] as const,
        })),
        laps: 1,
      });
      race = createRaceState({ track, win: firstPastPost(1) });
      activeRoute = route;
      raceStartedAt = ctx.time.now();
      race.addRacer(ctx.player.userId, raceStartedAt);
      race.addRacer(RIVAL_RACER_ID, raceStartedAt);
      const start = checkpoints[checkpoints.length - 1]!;
      ctx.scene.entity.spawn("car_muscle", {
        id: RIVAL_RACER_ID,
        position: [start[0], ctx.world.groundHeightAt(start[0], start[1]), start[1]],
        role: "prop",
      });
      rivalConfig = {
        waypoints: [...checkpoints, checkpoints[0]!].map(([x, z]) => [x, 0, z] as const),
        speed: 15.5,
        loop: false,
      };
      rivalState = createPathFollow(rivalConfig);
      publishRace(ctx, {
        routeId: route.id,
        label: route.label,
        active: true,
        checkpoint: 0,
        total: checkpoints.length,
        position: 1,
        timeSec: 0,
        finished: false,
        won: false,
      });
      return true;
    },
    raceActive: () => race !== null,
    tick: tickRace,
  };
}
