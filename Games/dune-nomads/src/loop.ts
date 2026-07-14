import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createDecayMeterSet, type DecayMeterSet } from "@jgengine/core/survival/decayMeter";
import { createRaceState, type RaceState } from "@jgengine/core/game/race";
import type { LifecycleConfig } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { defineStore } from "@jgengine/core/store/defineStore";

import type { BodySnapshot } from "@jgengine/core/scene/bodyBind";

import { CAMEL_LEAD_KIND, CAMEL_PACK_KIND, CAMEL_RIVAL_KIND } from "./game/entities/kinds";
import { PACK_ENTITY_IDS, placeDuneProps, spawnCaravan } from "./game/world/setup";
import { RIVAL_WAYPOINTS, WIND_SCHEDULE } from "./game/run/deps";
import { CARAVAN_RACE_TRACK, CARAVAN_WIN_CONDITION, PLAYER_RACER_ID, RIVAL_RACER_ID } from "./game/race/track";
import { WATER_MAX } from "./game/caravan/water";
import {
  applyRaceFinish,
  beginRun,
  cancelDockChoice,
  commitDock,
  initialRunState,
  openDockChoice,
  pinFlag,
  racerPositions,
  runStore,
  stepRun,
  toggleMap,
  unpinFlag,
  type RunState,
} from "./game/run/runState";
import { terrainField } from "./world";

function freshWaterMeter(): DecayMeterSet {
  return createDecayMeterSet([{ id: "water", max: WATER_MAX, start: WATER_MAX, rate: 1 }]);
}

function freshRaceEngine(): RaceState {
  const engine = createRaceState({ track: CARAVAN_RACE_TRACK, win: CARAVAN_WIN_CONDITION });
  engine.addRacer(PLAYER_RACER_ID);
  engine.addRacer(RIVAL_RACER_ID);
  return engine;
}

const waterMeterStore = defineStore<DecayMeterSet>("waterMeter", () => freshWaterMeter());
const raceEngineStore = defineStore<RaceState>("raceEngine", () => freshRaceEngine());

function getRun(ctx: GameContext): RunState {
  return runStore.read(ctx);
}

function setRun(ctx: GameContext, next: RunState): void {
  runStore.write(ctx, next);
  setGamePhase(ctx, next.phase === "playing" ? "playing" : next.phase === "start" ? "menu" : "ended");
}

export const lifecycle: LifecycleConfig<RunState> = {
  store: runStore,
  start: (state) => beginRun(state),
  restart(state, ctx) {
    waterMeterStore.write(ctx, freshWaterMeter());
    raceEngineStore.write(ctx, freshRaceEngine());
    return initialRunState("playing", RIVAL_WAYPOINTS);
  },
  phaseOf: (state) => (state.phase === "playing" ? "playing" : state.phase === "start" ? "menu" : "ended"),
};

export function onInit(ctx: GameContext): void {
  placeDuneProps(ctx);
  waterMeterStore.write(ctx, freshWaterMeter());
  raceEngineStore.write(ctx, freshRaceEngine());
  setRun(ctx, initialRunState("start", RIVAL_WAYPOINTS));

  ctx.game.commands.define<void>("toggleMap", {
    apply(state) {
      setRun(state, toggleMap(getRun(state)));
    },
  });

  ctx.game.commands.define<{ oasisId: string }>("dock.open", {
    apply(state, input) {
      setRun(state, openDockChoice(getRun(state), input.oasisId));
    },
  });

  ctx.game.commands.define<{ kind: "full" | "quick" }>("dock.commit", {
    apply(state, input) {
      setRun(state, commitDock(getRun(state), input.kind));
    },
  });

  ctx.game.commands.define<void>("dock.cancel", {
    apply(state) {
      setRun(state, cancelDockChoice(getRun(state)));
    },
  });

  ctx.game.commands.define<{ x: number; z: number }>("map.pin", {
    apply(state, input) {
      setRun(state, pinFlag(getRun(state), input));
    },
  });

  ctx.game.commands.define<{ index: number }>("map.unpin", {
    apply(state, input) {
      setRun(state, unpinFlag(getRun(state), input.index));
    },
  });

}

export function onNewPlayer(ctx: GameContext): void {
  const run = getRun(ctx);
  spawnCaravan(ctx, run.player.heading);
}

function headingFromDelta(dx: number, dz: number, fallback: number): number {
  if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) return fallback;
  return Math.atan2(dx, dz);
}

export function onTick(ctx: GameContext, dt: number): void {
  const run = getRun(ctx);
  if (run.phase !== "playing") return;

  const input = {
    urge: ctx.input.isDown("urge"),
    ease: ctx.input.isDown("ease"),
    steerLeft: ctx.input.isDown("steerLeft"),
    steerRight: ctx.input.isDown("steerRight"),
  };

  const waterMeter = waterMeterStore.read(ctx);
  let next = stepRun(run, dt, input, {
    terrainField,
    windSchedule: WIND_SCHEDULE,
    rivalWaypoints: RIVAL_WAYPOINTS,
    waterMeter,
  });

  const playerY = terrainField.sampleHeight(next.player.x, next.player.z);
  const bodies: BodySnapshot[] = [
    {
      id: ctx.player.userId,
      kind: CAMEL_LEAD_KIND,
      position: [next.player.x, playerY, next.player.z],
      rotationY: next.player.heading,
      role: "player",
    },
  ];

  for (let index = 0; index < PACK_ENTITY_IDS.length; index += 1) {
    const id = PACK_ENTITY_IDS[index]!;
    const previous = run.followers[index]!;
    const follower = next.followers[index]!;
    const fallback = ctx.scene.entity.get(id)?.rotationY ?? next.player.heading;
    const heading = headingFromDelta(follower.x - previous.x, follower.z - previous.z, fallback);
    const y = terrainField.sampleHeight(follower.x, follower.z);
    bodies.push({ id, kind: CAMEL_PACK_KIND, position: [follower.x, y, follower.z], rotationY: heading, role: "npc" });
  }

  const rivalY = terrainField.sampleHeight(next.rival.position[0], next.rival.position[2]);
  bodies.push({
    id: RIVAL_RACER_ID,
    kind: CAMEL_RIVAL_KIND,
    position: [next.rival.position[0], rivalY, next.rival.position[2]],
    rotationY: next.rival.heading,
    role: "npc",
  });

  ctx.scene.entity.bind("caravan").sync(bodies, dt);

  if (next.phase === "playing") {
    const raceEngine = raceEngineStore.read(ctx);
    const events = raceEngine.update(next.elapsed, racerPositions(next));
    for (const event of events) {
      if (event.type === "race.finished") {
        next = applyRaceFinish(next, event.ranking[0]!);
      }
    }
  }

  setRun(ctx, next);
}
