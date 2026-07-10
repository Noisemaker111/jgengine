import { describe, expect, test } from "bun:test";
import { createRaceState } from "@jgengine/core/game/race";
import { ASTEROID_OBSTACLES, PLANETOIDS } from "../cluster/catalog";
import { spawnKartState, stepKart, type KartPhysicsState } from "../physics/orbitalSim";
import { RACER_SPAWNS, TRACK } from "../race/track";
import { RIVALS, steerRival } from "./rivals";

const DT = 1 / 30;
const TIME_BOUND_SECONDS = 1300;

describe("orbit-kart AI rivals", () => {
  for (const personality of RIVALS) {
    test(`${personality.name} (${personality.kind}) completes all laps within ${TIME_BOUND_SECONDS}s`, () => {
      const spawn = RACER_SPAWNS[personality.id]!;
      let state: KartPhysicsState = spawnKartState(spawn.position[0], spawn.position[2], spawn.heading);
      const raceState = createRaceState({ track: TRACK });
      raceState.addRacer(personality.id, 0);

      let now = 0;
      let finished = false;
      while (now < TIME_BOUND_SECONDS && !finished) {
        const progress = raceState.progressOf(personality.id);
        const targetIndex = progress?.nextCheckpoint ?? 0;
        const input = steerRival(state, personality, targetIndex, PLANETOIDS);
        state = stepKart(state, input, DT, PLANETOIDS, ASTEROID_OBSTACLES).state;
        now += DT;
        const events = raceState.update(now, { [personality.id]: [state.x, 1.4, state.z] });
        if (events.some((event) => event.type === "race.finished")) finished = true;
      }

      const progress = raceState.progressOf(personality.id);
      expect(progress?.finished).toBe(true);
      expect(progress?.finishTime).not.toBeNull();
      expect(progress?.finishTime ?? Number.POSITIVE_INFINITY).toBeLessThan(TIME_BOUND_SECONDS);
    }, 20000);
  }
});
