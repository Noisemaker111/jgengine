import { describe, expect, test } from "bun:test";
import { createRaceState } from "@jgengine/core/game/race";
import { ASTEROID_OBSTACLES, CHECKPOINT_DEFS, PLANETOIDS } from "../cluster/catalog";
import { MAX_SPEED, spawnKartState, stepKart, type KartPhysicsState } from "../physics/orbitalSim";
import { KART_Y } from "../constants";
import { RACER_SPAWNS, TRACK } from "../race/track";
import { RIVALS, steerRival, type RivalPersonality } from "./rivals";

const DT = 1 / 30;
const SIM_CAP_SECONDS = 200;

function referenceRaceSeconds(): number {
  let perimeter = 0;
  for (let i = 0; i < CHECKPOINT_DEFS.length; i += 1) {
    const a = CHECKPOINT_DEFS[i]!.position;
    const b = CHECKPOINT_DEFS[(i + 1) % CHECKPOINT_DEFS.length]!.position;
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return (perimeter * TRACK.laps) / MAX_SPEED;
}

function isolatedFinishTime(personality: RivalPersonality): number | null {
  const spawn = RACER_SPAWNS[personality.id]!;
  let state: KartPhysicsState = spawnKartState(spawn.position[0], spawn.position[2], spawn.heading);
  const raceState = createRaceState({ track: TRACK });
  raceState.addRacer(personality.id, 0);

  let now = 0;
  while (now < SIM_CAP_SECONDS) {
    const progress = raceState.progressOf(personality.id);
    if (progress?.finished === true) return progress.finishTime;
    const input = steerRival(state, personality, progress?.nextCheckpoint ?? 0, PLANETOIDS);
    state = stepKart(state, input, DT, PLANETOIDS, ASTEROID_OBSTACLES).state;
    now += DT;
    raceState.update(now, { [personality.id]: [state.x, KART_Y, state.z] });
  }
  return raceState.progressOf(personality.id)?.finishTime ?? null;
}

describe("orbit-kart AI rivals", () => {
  const referenceBound = referenceRaceSeconds() * 1.5;

  test("straight-line-optimal reference bound is sane", () => {
    expect(referenceBound).toBeGreaterThan(60);
    expect(referenceBound).toBeLessThan(200);
  });

  for (const personality of RIVALS) {
    test(`${personality.name} (${personality.kind}) finishes 3 laps within 1.5x of the straight-line reference`, () => {
      const finishTime = isolatedFinishTime(personality);
      expect(finishTime).not.toBeNull();
      expect(finishTime ?? Number.POSITIVE_INFINITY).toBeLessThan(referenceBound);
    }, 20000);
  }

  test("the aggressive slinger is decisively faster than the cautious orbiter", () => {
    const cautious = isolatedFinishTime(RIVALS.find((rival) => rival.kind === "cautious")!);
    const aggressive = isolatedFinishTime(RIVALS.find((rival) => rival.kind === "aggressive")!);
    expect(cautious).not.toBeNull();
    expect(aggressive).not.toBeNull();
    expect(aggressive!).toBeLessThan(cautious! - 10);
  }, 20000);

  test("rival pacing is deterministic across identical runs", () => {
    const first = isolatedFinishTime(RIVALS[0]!);
    const second = isolatedFinishTime(RIVALS[0]!);
    expect(first).toBe(second);
  }, 20000);
});
