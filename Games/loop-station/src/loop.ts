import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { GHOST_ENTITY, GHOST_ENTITY_FADED, RUNNER_ENTITY, ghostEntityId } from "./game/entities/catalog";
import { ghostPositionAt } from "./game/run/ghosts";
import { freshRunState, stepRun } from "./game/run/runState";
import { RUN_STORE_KEY, type RunInputState, type RunState } from "./game/run/types";
import { placeTrackProps } from "./game/world/setup";

function readRun(ctx: GameContext): RunState {
  return ctx.game.store.get(RUN_STORE_KEY) as RunState;
}

function sampleInput(ctx: GameContext): RunInputState {
  return {
    throttleUp: ctx.input.isDown("throttleUp"),
    throttleDown: ctx.input.isDown("throttleDown"),
    steerLeft: ctx.input.isDown("steerLeft"),
    steerRight: ctx.input.isDown("steerRight"),
    brake: ctx.input.isDown("brakeDrift"),
    jumpHop: ctx.input.isDown("jumpHop"),
    restart: ctx.input.isDown("restartRun"),
    start: ctx.input.isDown("startRun"),
  };
}

function syncGhostEntities(ctx: GameContext, run: RunState): void {
  const desired = new Map(run.ghosts.map((ghost) => [ghostEntityId(ghost.lapIndex), ghost] as const));
  for (const entity of ctx.scene.entity.list()) {
    if (entity.name !== GHOST_ENTITY && entity.name !== GHOST_ENTITY_FADED) continue;
    if (!desired.has(entity.id)) ctx.scene.entity.despawn(entity.id);
  }
  for (const [id, ghost] of desired) {
    const name = ghost.faded ? GHOST_ENTITY_FADED : GHOST_ENTITY;
    const existing = ctx.scene.entity.get(id);
    if (existing === null) {
      ctx.scene.entity.spawn(name, { id, position: [0, 0, 0], role: "npc" });
    } else if (existing.name !== name) {
      ctx.scene.entity.update(id, { name });
    }
  }
}

export function onInit(ctx: GameContext): void {
  placeTrackProps(ctx);
  ctx.game.store.set(RUN_STORE_KEY, freshRunState(null, "start", ctx.time.now()));
}

export function onNewPlayer(ctx: GameContext): void {
  const run = readRun(ctx);
  ctx.scene.entity.spawn(RUNNER_ENTITY, {
    id: ctx.player.userId,
    position: [run.position.x, run.position.y, run.position.z],
    rotationY: run.position.headingRad,
    role: "player",
  });
}

export function onTick(ctx: GameContext, dt: number): void {
  const run = readRun(ctx);
  const input = sampleInput(ctx);
  const { state } = stepRun(run, input, dt, ctx.time.now());
  ctx.game.store.set(RUN_STORE_KEY, state);

  ctx.scene.entity.setPose(ctx.player.userId, {
    position: [state.position.x, state.position.y, state.position.z],
    rotationY: state.position.headingRad,
    dt,
  });

  syncGhostEntities(ctx, state);

  const now = ctx.time.now();
  for (const ghost of state.ghosts) {
    if (ghost.faded) continue;
    const data = ghostPositionAt(ghost, now);
    if (data === null) continue;
    ctx.scene.entity.setPose(ghostEntityId(ghost.lapIndex), {
      position: [data.x, data.y, data.z],
      rotationY: data.headingRad,
      dt,
    });
  }
}
