import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RaceState } from "@jgengine/core/game/race";

import { createTruckRaceState, TRUCK_RACER_ID } from "./game/course/track";
import { advanceRun, applyRaceEvents, initialRunState, startRun, type RunInput, type RunState } from "./game/course/run";
import { TRUCK_ENTITY_NAME } from "./game/entities/catalog";
import { placeProps } from "./game/world/setup";
import { LANE_WORLD_WIDTH, worldZ } from "./world";

function resetRun(ctx: GameContext): void {
  ctx.game.store.set("run", startRun());
  ctx.game.store.set("raceState", createTruckRaceState());
}

export function onInit(ctx: GameContext): void {
  ctx.game.store.set("run", initialRunState());
  ctx.game.store.set("raceState", createTruckRaceState());
  ctx.game.commands.define("confirm", { apply: (state) => resetRun(state) });
  ctx.game.commands.define("restart", { apply: (state) => resetRun(state) });
  placeProps(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(TRUCK_ENTITY_NAME, {
    id: ctx.player.userId,
    position: [0, 0, worldZ(0)],
    role: "player",
  });
}

export function onTick(ctx: GameContext, dt: number): void {
  const run = ctx.game.store.get("run") as RunState | undefined;
  if (run === undefined || run.status !== "playing") return;

  const input: RunInput = {
    throttle: ctx.input.isDown("throttle"),
    brake: ctx.input.isDown("brake"),
    steerLeft: ctx.input.isDown("steerLeft"),
    steerRight: ctx.input.isDown("steerRight"),
    handbrake: ctx.input.isDown("handbrake"),
  };

  let next = advanceRun(run, input, dt);

  const raceState = ctx.game.store.get("raceState") as RaceState | undefined;
  if (raceState !== undefined) {
    const raceEvents = raceState.update(next.now, { [TRUCK_RACER_ID]: [0, 0, next.progress] });
    next = applyRaceEvents(next, raceEvents);
  }

  ctx.game.store.set("run", next);

  if (ctx.scene.entity.get(ctx.player.userId) !== null) {
    ctx.scene.entity.setPose(ctx.player.userId, {
      position: [next.lane * LANE_WORLD_WIDTH, 0, worldZ(next.progress)],
      rotationY: -next.lane * 0.15,
      dt,
    });
  }
}
