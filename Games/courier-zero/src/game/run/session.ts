import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  command,
  keybind,
  proximityPrompt,
  type PositionedPrompt,
} from "@jgengine/core/interaction/proximityPrompt";
import { passabilityAt, tideLevelAt, waterDepthAt, WADE_SPEED_MULTIPLIER } from "../tide/catalog";
import { jobById } from "../delivery/catalog";
import { HOME_VILLAGE_ID, VILLAGES, villageById, type Village } from "../world/villages";
import {
  COURIER_BASE_WALK_SPEED,
  COURIER_ENTITY,
  STAMINA_MAX,
  STAMINA_REGEN_PER_SECOND,
  STAMINA_SPRINT_DRAIN_PER_SECOND,
  STAMINA_STAT,
} from "../entities/catalog";
import {
  advanceElapsed,
  applyDrown,
  createInitialRun,
  deliverPackage,
  isFrozen,
  pickupPackage,
  restartRun,
  startRun,
  touchVillage,
  type RunState,
} from "./runState";
import { ISLAND_SEED } from "../../world";

const RUN_KEY = "run";
const STARTED_AT_KEY = "startedAt";
const MAP_OPEN_KEY = "mapOpen";

export const COMMAND_PICKUP = "courier.pickup";
export const COMMAND_DELIVER = "courier.deliver";
export const COMMAND_START = "startRun";
export const COMMAND_RESTART = "restartRun";
export const COMMAND_TOGGLE_MAP = "toggleMap";

export function getRun(ctx: GameContext): RunState {
  return (ctx.game.store.get(RUN_KEY) as RunState | undefined) ?? createInitialRun(ISLAND_SEED);
}

function setRun(ctx: GameContext, run: RunState): void {
  ctx.game.store.set(RUN_KEY, run);
}

export function isMapOpen(ctx: GameContext): boolean {
  return (ctx.game.store.get(MAP_OPEN_KEY) as boolean | undefined) ?? false;
}

function homePosition(ctx: GameContext): readonly [number, number, number] {
  const home = villageById(HOME_VILLAGE_ID);
  const y = ctx.world.groundHeightAt(home.position[0], home.position[1]);
  return [home.position[0], y, home.position[1]];
}

export function initRun(ctx: GameContext): void {
  setRun(ctx, createInitialRun(ISLAND_SEED));
  ctx.game.store.set(MAP_OPEN_KEY, false);

  ctx.game.commands.define(COMMAND_START, {
    apply(state: GameContext) {
      const run = getRun(state);
      if (run.status !== "start") return state;
      state.game.store.set(STARTED_AT_KEY, state.time.now());
      setRun(state, startRun(run));
      return state;
    },
  });

  ctx.game.commands.define(COMMAND_RESTART, {
    apply(state: GameContext) {
      setRun(state, restartRun(ISLAND_SEED));
      state.game.store.set(MAP_OPEN_KEY, false);
      state.scene.entity.setPose(state.player.userId, { position: homePosition(state) });
      state.scene.entity.stats.set(state.player.userId, STAMINA_STAT, { current: STAMINA_MAX });
      state.scene.entity.update(state.player.userId, { movement: { walkSpeed: COURIER_BASE_WALK_SPEED } });
      return state;
    },
  });

  ctx.game.commands.define(COMMAND_TOGGLE_MAP, {
    apply(state: GameContext) {
      state.game.store.set(MAP_OPEN_KEY, !isMapOpen(state));
      return state;
    },
  });

  ctx.game.commands.define<{ villageId: string }>(COMMAND_PICKUP, {
    apply(state: GameContext, input) {
      setRun(state, pickupPackage(getRun(state), input.villageId));
      return state;
    },
  });

  ctx.game.commands.define<{ villageId: string }>(COMMAND_DELIVER, {
    apply(state: GameContext, input) {
      setRun(state, deliverPackage(getRun(state), input.villageId));
      return state;
    },
  });
}

export function spawnCourier(ctx: GameContext): void {
  ctx.scene.entity.spawn(COURIER_ENTITY, {
    id: ctx.player.userId,
    position: homePosition(ctx),
    role: "player",
  });
}

export function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  const run = getRun(ctx);
  if (run.status !== "playing" || isFrozen(run)) return [];

  if (run.carried === null) {
    const jobId = run.queue[0];
    if (jobId === undefined) return [];
    const job = jobById(jobId);
    const origin = villageById(job.originId);
    return [
      {
        id: `pickup-${job.id}`,
        position: { x: origin.position[0], z: origin.position[1] },
        prompt: proximityPrompt({
          radius: origin.radius,
          display: keybind("interact"),
          invoke: command(COMMAND_PICKUP, { villageId: origin.id }),
        }),
      },
    ];
  }

  const job = jobById(run.carried.jobId);
  const destination = villageById(job.destinationId);
  return [
    {
      id: `deliver-${job.id}`,
      position: { x: destination.position[0], z: destination.position[1] },
      prompt: proximityPrompt({
        radius: destination.radius,
        display: keybind("interact"),
        invoke: command(COMMAND_DELIVER, { villageId: destination.id }),
      }),
    },
  ];
}

function nearestVillage(x: number, z: number): Village | null {
  for (const village of VILLAGES) {
    const distance = Math.hypot(village.position[0] - x, village.position[1] - z);
    if (distance <= village.radius) return village;
  }
  return null;
}

export function tick(ctx: GameContext, dt: number): void {
  let run = getRun(ctx);
  if (run.status !== "playing") {
    if (ctx.scene.entity.get(ctx.player.userId) !== null) {
      ctx.scene.entity.update(ctx.player.userId, { movement: { walkSpeed: 0 } });
    }
    return;
  }

  const startedAt = (ctx.game.store.get(STARTED_AT_KEY) as number | undefined) ?? ctx.time.now();
  const elapsed = Math.max(0, ctx.time.now() - startedAt);
  run = advanceElapsed(run, elapsed);

  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) {
    setRun(ctx, run);
    return;
  }

  const tideLevel = tideLevelAt(run.elapsed);

  if (isFrozen(run)) {
    const respawn = homePositionFor(ctx, run.lastVillageId);
    ctx.scene.entity.setPose(ctx.player.userId, { position: respawn });
    ctx.scene.entity.update(ctx.player.userId, { movement: { walkSpeed: 0 } });
    setRun(ctx, run);
    return;
  }

  const village = nearestVillage(player.position[0], player.position[2]);
  if (village !== null) {
    const villageDepth = waterDepthAt(village.elevation, tideLevel);
    if (passabilityAt(villageDepth) !== "blocked") {
      run = touchVillage(run, village.id);
    }
  }

  const groundHeight = ctx.world.groundHeightAt(player.position[0], player.position[2]);
  const depth = waterDepthAt(groundHeight, tideLevel);
  const passability = passabilityAt(depth);

  if (passability === "blocked") {
    run = applyDrown(run);
    setRun(ctx, run);
    return;
  }

  const stamina = ctx.scene.entity.stats.get(ctx.player.userId, STAMINA_STAT);
  const staminaCurrent = stamina?.current ?? STAMINA_MAX;
  const sprintHeld = ctx.input.isDown("sprint");
  const isMoving = ctx.input.isDown("moveForward") || ctx.input.isDown("moveBack") || ctx.input.isDown("moveLeft") || ctx.input.isDown("moveRight");
  const sprinting = sprintHeld && isMoving && staminaCurrent > 0;
  ctx.scene.entity.stats.delta(
    ctx.player.userId,
    STAMINA_STAT,
    sprinting ? -STAMINA_SPRINT_DRAIN_PER_SECOND * dt : STAMINA_REGEN_PER_SECOND * dt,
  );

  const staminaExhausted = staminaCurrent <= 0 && sprintHeld;
  const wadeMultiplier = passability === "wade" ? WADE_SPEED_MULTIPLIER : 1;
  const sprintCancel = staminaExhausted ? 1 / 2.25 : 1;
  const walkSpeed = COURIER_BASE_WALK_SPEED * wadeMultiplier * sprintCancel;
  ctx.scene.entity.update(ctx.player.userId, { movement: { walkSpeed } });

  setRun(ctx, run);
}

function homePositionFor(ctx: GameContext, villageId: string): readonly [number, number, number] {
  const village = villageById(villageId);
  const y = ctx.world.groundHeightAt(village.position[0], village.position[1]);
  return [village.position[0], y, village.position[1]];
}
