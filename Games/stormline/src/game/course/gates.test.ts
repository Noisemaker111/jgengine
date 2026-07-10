import { describe, expect, test } from "bun:test";
import { GATES } from "./catalog";
import { createTruckRaceState, TRUCK_RACER_ID } from "./track";

describe("stormline gate sequencing", () => {
  test("fires checkpoint.hit for each gate in order as progress advances", () => {
    const race = createTruckRaceState();
    const hits: number[] = [];
    const finish = GATES[GATES.length - 1]!.progress;
    for (let progress = 0; progress <= finish + 10; progress += 5) {
      const events = race.update(progress / 20, { [TRUCK_RACER_ID]: [0, 0, progress] });
      for (const evt of events) if (evt.type === "checkpoint.hit") hits.push(evt.checkpoint);
    }
    expect(hits).toEqual(GATES.map((_, i) => i));
  });

  test("fires race.finished only after all six gates have been hit, in order", () => {
    const race = createTruckRaceState();
    const finish = GATES[GATES.length - 1]!.progress;
    const hitOrder: number[] = [];
    let finishedAfterHits = -1;
    for (let progress = 0; progress <= finish + 50; progress += 5) {
      const events = race.update(progress / 20, { [TRUCK_RACER_ID]: [0, 0, progress] });
      for (const evt of events) {
        if (evt.type === "checkpoint.hit") hitOrder.push(evt.checkpoint);
        if (evt.type === "race.finished") finishedAfterHits = hitOrder.length;
      }
    }
    expect(hitOrder).toEqual([0, 1, 2, 3, 4, 5]);
    expect(finishedAfterHits).toBe(6);
  });

  test("reset clears progress so the same instance can be reused across a restart", () => {
    const race = createTruckRaceState();
    race.update(10, { [TRUCK_RACER_ID]: [0, 0, GATES[0]!.progress] });
    expect(race.progressOf(TRUCK_RACER_ID)!.lastCheckpoint).toBe(0);
    race.reset();
    race.addRacer(TRUCK_RACER_ID);
    expect(race.progressOf(TRUCK_RACER_ID)!.lastCheckpoint).toBe(-1);
    expect(race.finished).toBe(false);
  });
});
