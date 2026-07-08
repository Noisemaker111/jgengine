import { describe, expect, test } from "bun:test";
import { createRaceState } from "@jgengine/core/game/race";

import { pointAtDistance } from "./geometry";
import { LAPS, TRACK, TRACK_CENTERLINE, TRACK_CHECKPOINTS, TRACK_LENGTHS } from "./track";

describe("speed-circuit track checkpoints and laps", () => {
  test("driving the full loop hits every checkpoint in order and completes a lap", () => {
    const race = createRaceState({ track: TRACK });
    race.addRacer("driver");

    const total = TRACK_LENGTHS[TRACK_LENGTHS.length - 1]!;
    const steps = 400;
    const hitOrder: number[] = [];
    let now = 0;
    for (let i = 0; i < steps; i += 1) {
      const distance = (i / steps) * total;
      const p = pointAtDistance(TRACK_CENTERLINE, TRACK_LENGTHS, distance);
      now += 0.05;
      const events = race.update(now, { driver: [p.x, 0, p.z] });
      for (const event of events) if (event.type === "checkpoint.hit") hitOrder.push(event.checkpoint);
    }

    expect(hitOrder.slice(0, TRACK_CHECKPOINTS.length)).toEqual([...Array(TRACK_CHECKPOINTS.length).keys()]);
    expect(race.progressOf("driver")?.lap).toBe(2);
  });

  test("completing all laps finishes the race", () => {
    const race = createRaceState({ track: TRACK });
    race.addRacer("driver");
    const total = TRACK_LENGTHS[TRACK_LENGTHS.length - 1]!;
    let now = 0;
    for (let lap = 0; lap < LAPS; lap += 1) {
      for (let i = 0; i < TRACK_CHECKPOINTS.length; i += 1) {
        const distance = (i / TRACK_CHECKPOINTS.length) * total;
        const p = pointAtDistance(TRACK_CENTERLINE, TRACK_LENGTHS, distance);
        now += 1;
        race.update(now, { driver: [p.x, 0, p.z] });
      }
    }
    expect(race.finished).toBe(true);
    expect(race.progressOf("driver")?.finished).toBe(true);
  });
});
