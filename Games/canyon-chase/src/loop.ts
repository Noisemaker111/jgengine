import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { PLAYER_CAR_ENTITY, SMUGGLER_TRUCK_ENTITY } from "./game/entities/catalog";
import { type RunState, advanceRun, beginRun, createInitialRunState } from "./game/run/runState";
import { MAP_SLOW_TIME_SCALE, MARKERS_STORE_KEY, RUN_STORE_KEY, SELECTED_SEED_STORE_KEY, TRUCK_ENTITY_ID } from "./game/run/storeKeys";
import { DEFAULT_TRUCK_SEED_ID } from "./game/run/truckSchedule";
import { createCanyonMarkerSet, syncLiveMarkers } from "./game/world/canyonMarkers";
import { setupWorld } from "./game/world/setup";

function readRun(ctx: GameContext): RunState {
  return ctx.game.store.get(RUN_STORE_KEY) as RunState;
}

function writeRun(ctx: GameContext, run: RunState): void {
  ctx.game.store.set(RUN_STORE_KEY, run);
}

function syncPhase(ctx: GameContext, phase: RunState["phase"]): void {
  setGamePhase(ctx, phase === "playing" ? "playing" : phase === "idle" ? "menu" : "ended");
}

export function onInit(ctx: GameContext): void {
  setupWorld(ctx);
  ctx.game.store.set(SELECTED_SEED_STORE_KEY, DEFAULT_TRUCK_SEED_ID);
  ctx.game.store.set(MARKERS_STORE_KEY, createCanyonMarkerSet());
  writeRun(ctx, createInitialRunState(DEFAULT_TRUCK_SEED_ID));
  syncPhase(ctx, "idle");

  ctx.game.commands.define("selectSeed", {
    apply(state, input: { seedId: string }) {
      state.game.store.set(SELECTED_SEED_STORE_KEY, input.seedId);
      const current = readRun(state);
      if (current.phase === "idle") writeRun(state, createInitialRunState(input.seedId));
    },
  });

  ctx.game.commands.define("startRun", {
    apply(state) {
      const seedId = (state.game.store.get(SELECTED_SEED_STORE_KEY) as string | undefined) ?? DEFAULT_TRUCK_SEED_ID;
      writeRun(state, beginRun(seedId));
      syncPhase(state, "playing");
    },
  });

  ctx.game.commands.define("restart", {
    apply(state) {
      const current = readRun(state);
      writeRun(state, beginRun(current.seedId));
      syncPhase(state, "playing");
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  const run = readRun(ctx);
  ctx.scene.entity.spawn(PLAYER_CAR_ENTITY, {
    id: ctx.player.userId,
    position: run.car.position,
    rotationY: run.car.heading,
    role: "player",
    movement: { frozen: true },
  });
  ctx.scene.entity.spawn(SMUGGLER_TRUCK_ENTITY, {
    id: TRUCK_ENTITY_ID,
    position: run.truck.position,
    rotationY: run.car.heading,
    role: "npc",
    movement: { frozen: true },
  });
}

export function onTick(ctx: GameContext, dt: number): void {
  const run = readRun(ctx);
  if (run.phase !== "playing") {
    ctx.time.setSpeed(1);
    return;
  }

  const input = {
    car: {
      throttle: ctx.input.isDown("throttle"),
      brake: ctx.input.isDown("brake"),
      steerLeft: ctx.input.isDown("steerLeft"),
      steerRight: ctx.input.isDown("steerRight"),
      handbrake: ctx.input.isDown("handbrake"),
    },
    surveyMapHeld: ctx.input.isDown("surveyMap"),
  };

  const previousTruckPosition = run.truck.position;
  const next = advanceRun(run, input, dt);
  if (next.phase !== run.phase) syncPhase(ctx, next.phase);

  ctx.time.setSpeed(next.mapSlow.active ? MAP_SLOW_TIME_SCALE : 1);

  ctx.scene.entity.setPose(ctx.player.userId, {
    position: next.car.position,
    rotationY: next.car.heading,
    dt,
  });

  const truckDx = next.truck.position[0] - previousTruckPosition[0];
  const truckDz = next.truck.position[2] - previousTruckPosition[2];
  const truckMoved = Math.hypot(truckDx, truckDz) > 1e-5;
  const previousTruck = ctx.scene.entity.get(TRUCK_ENTITY_ID);
  const truckHeading = truckMoved ? Math.atan2(truckDx, truckDz) : (previousTruck?.rotationY ?? 0);
  ctx.scene.entity.setPose(TRUCK_ENTITY_ID, {
    position: next.truck.position,
    rotationY: truckHeading,
    dt,
  });

  const markers = ctx.game.store.get(MARKERS_STORE_KEY) as ReturnType<typeof createCanyonMarkerSet> | undefined;
  if (markers !== undefined) syncLiveMarkers(markers, next.car.position, next.truck.position);

  writeRun(ctx, next);
}

export const loop = { onInit, onNewPlayer, onTick };
