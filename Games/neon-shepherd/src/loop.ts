import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { CREATURE_RADIUS, PARK_Z, SANCTUARY_Z } from "./game/constants";
import { TIERS, isTierId, type TierId } from "./game/difficulty/tiers";
import { SHEPHERD_ENTITY_ID } from "./game/entities/shepherd/catalog";
import { DEFAULT_FLOCK_TUNING, stepFlock, type CreaturePos, type HerdMode } from "./game/flock/boids";
import { ROADS } from "./game/roads/catalog";
import { advanceHold, canTriggerWhistle, isGatherActive, triggerWhistle, type HoldState } from "./game/session/gather";
import { hasLost, hasWon, resolveMedal } from "./game/session/runState";
import {
  aliveCount,
  createInitialRunState,
  RUN_STORE_KEY,
  type RunState,
  type ToastEntry,
} from "./game/session/store";
import { laneVehicleX, pointHitByVehicle } from "./game/vehicles/schedule";
import { placeProps, resetCreatureEntities, spawnVehiclePool, vehicleEntityId } from "./game/world/setup";

let toastCounter = 0;

function pushToast(run: RunState, text: string, now: number): RunState {
  const toast: ToastEntry = { id: `toast-${toastCounter}`, text, createdAt: now };
  toastCounter += 1;
  return { ...run, toasts: [...run.toasts, toast].slice(-4) };
}

function readRun(ctx: GameContext): RunState {
  const existing = ctx.game.store.get(RUN_STORE_KEY) as RunState | undefined;
  if (existing !== undefined) return existing;
  const fresh = createInitialRunState();
  ctx.game.store.set(RUN_STORE_KEY, fresh);
  return fresh;
}

function writeRun(ctx: GameContext, run: RunState): void {
  ctx.game.store.set(RUN_STORE_KEY, run);
}

export function onInit(ctx: GameContext): void {
  placeProps(ctx);
  spawnVehiclePool(ctx);
  resetCreatureEntities(ctx);

  ctx.game.commands.define<{ tier?: string }>("selectTier", {
    apply(state, input) {
      const run = readRun(state);
      if (run.phase !== "start" || input.tier === undefined || !isTierId(input.tier)) return;
      writeRun(state, { ...run, tier: input.tier });
    },
  });

  ctx.game.commands.define<{ tier?: string }>("start", {
    apply(state, input) {
      const run = readRun(state);
      if (run.phase !== "start") return;
      const tier: TierId = input.tier !== undefined && isTierId(input.tier) ? input.tier : run.tier;
      const next = createInitialRunState(tier);
      next.phase = "playing";
      next.playStartedAt = state.time.now();
      resetCreatureEntities(state);
      writeRun(state, next);
    },
  });

  ctx.game.commands.define("restart", {
    apply(state) {
      const run = readRun(state);
      resetCreatureEntities(state);
      writeRun(state, createInitialRunState(run.tier));
    },
  });

  ctx.game.commands.define("gatherPulse", {
    apply(state) {
      const run = readRun(state);
      if (run.phase !== "playing") return;
      const now = state.time.now();
      const canFire = canTriggerWhistle(run.whistle, now);
      const whistle = triggerWhistle(run.whistle, now);
      const message = canFire
        ? "The whistle carries. Come to me, lights."
        : "The boulevard hasn't let the whistle catch its breath yet.";
      writeRun(state, pushToast({ ...run, whistle }, message, now));
    },
  });

  ctx.game.commands.define("toggleMap", {
    apply(state) {
      const run = readRun(state);
      writeRun(state, { ...run, mapOpen: !run.mapOpen });
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SHEPHERD_ENTITY_ID, {
    id: ctx.player.userId,
    position: [0, ctx.world.groundHeightAt(0, PARK_Z), PARK_Z],
    role: "player",
  });
  readRun(ctx);
}

export function onTick(ctx: GameContext, dt: number): void {
  const run = readRun(ctx);
  const player = ctx.scene.entity.get(ctx.player.userId);
  const shepherd = player !== null ? { x: player.position[0], z: player.position[2] } : { x: 0, z: PARK_Z };
  const now = ctx.time.now();
  const tier = TIERS[run.tier];

  const heldShift = ctx.input.isDown("holdHerd");
  const nextHold: HoldState = advanceHold(run.hold, heldShift && run.phase === "playing", shepherd);

  let mode: HerdMode = "idle";
  if (run.phase === "playing") {
    mode = nextHold.holding ? "hold" : isGatherActive(run.whistle, now) ? "gather" : "follow";
  }

  const t = run.playStartedAt === null ? 0 : now - run.playStartedAt;
  const strayBase = new Map(Object.entries(run.strayBase));
  const creatureList: CreaturePos[] = Object.values(run.creatures);

  const stepped =
    run.phase === "playing"
      ? stepFlock({
          creatures: creatureList,
          shepherd,
          mode,
          holdAnchor: nextHold.anchor,
          strayBase,
          dt,
          t,
          tuning: DEFAULT_FLOCK_TUNING,
        })
      : creatureList;

  const nextStrayBase: Record<string, { x: number; z: number }> = { ...run.strayBase };
  for (const creature of stepped) {
    const wasStraggler = run.creatures[creature.id]?.straggler ?? false;
    if (creature.straggler && !wasStraggler) {
      nextStrayBase[creature.id] = { x: creature.x, z: creature.z };
    } else if (!creature.straggler && wasStraggler) {
      delete nextStrayBase[creature.id];
    }
  }

  const nextCreatures: Record<string, CreaturePos> = {};
  const extinguishedThisTick: string[] = [];
  let extinguishRoadIndex: number | null = null;

  for (const creature of stepped) {
    if (!creature.alive) {
      nextCreatures[creature.id] = creature;
      continue;
    }
    let hit = false;
    if (run.phase === "playing") {
      for (let i = 0; i < ROADS.length; i += 1) {
        const road = ROADS[i]!;
        if (Math.abs(creature.z - road.z) > road.halfDepth) continue;
        if (pointHitByVehicle(road, tier, t, creature.x, creature.z, CREATURE_RADIUS)) {
          hit = true;
          if (extinguishRoadIndex === null) extinguishRoadIndex = i;
          break;
        }
      }
    }
    if (hit) {
      extinguishedThisTick.push(creature.id);
      ctx.scene.entity.despawn(creature.id);
      nextCreatures[creature.id] = { ...creature, alive: false, vx: 0, vz: 0 };
    } else {
      nextCreatures[creature.id] = creature;
      ctx.scene.entity.setPose(creature.id, {
        position: [creature.x, ctx.world.groundHeightAt(creature.x, creature.z), creature.z],
        dt,
      });
    }
  }

  if (run.phase === "playing") {
    for (const road of ROADS) {
      road.lanes.forEach((lane, laneIndex) => {
        const id = vehicleEntityId(road.id, laneIndex);
        const x = laneVehicleX(lane, tier, t);
        const pose = x === null ? { x: 9999, z: road.z } : { x, z: road.z + lane.laneOffsetZ };
        ctx.scene.entity.setPose(id, {
          position: [pose.x, ctx.world.groundHeightAt(pose.x, pose.z), pose.z],
          rotationY: lane.direction > 0 ? Math.PI / 2 : -Math.PI / 2,
          dt,
        });
      });
    }
  }

  let nextRun: RunState = { ...run, creatures: nextCreatures, strayBase: nextStrayBase, hold: nextHold };

  if (extinguishedThisTick.length > 0) {
    const roadLabel = extinguishRoadIndex !== null ? ROADS[extinguishRoadIndex]!.label : "the boulevard";
    nextRun = pushToast(
      nextRun,
      extinguishedThisTick.length === 1
        ? `A light gutters out over ${roadLabel}.`
        : `${extinguishedThisTick.length} lights gutter out over ${roadLabel}.`,
      now,
    );
    nextRun = { ...nextRun, lostAtRoadIndex: extinguishRoadIndex };
  }

  if (run.phase === "playing") {
    const alive = aliveCount(nextRun);
    if (hasLost(alive)) {
      nextRun = { ...nextRun, phase: "lost", finishedAt: t };
    } else if (hasWon(shepherd.z, SANCTUARY_Z, alive)) {
      nextRun = { ...nextRun, phase: "won", finishedAt: t, medal: resolveMedal(alive) };
    }
  }

  writeRun(ctx, nextRun);
}
