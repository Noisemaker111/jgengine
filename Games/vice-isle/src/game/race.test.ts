import { describe, expect, test } from "bun:test";
import { createRaceState, firstPastPost, raceTrack } from "@jgengine/core/game/race";
import { RACE_CHECKPOINTS } from "./world/districts";

describe("vice-isle ocean loop", () => {
  test("driving the checkpoint line wins the race", () => {
    const track = raceTrack({
      checkpoints: RACE_CHECKPOINTS.map(([x, z], i) => ({
        id: `cp_${i}`,
        center: [x, 2, z] as const,
        half: [10, 8, 10] as const,
      })),
      laps: 1,
    });
    const race = createRaceState({ track, win: firstPastPost(1) });
    race.addRacer("player", 0);
    race.addRacer("rival", 0);
    let finished = false;
    RACE_CHECKPOINTS.forEach(([x, z], i) => {
      const events = race.update(i + 1, { player: [x, 2, z] as const, rival: [0, 2, 400] as const });
      if (events.some((e) => e.type === "race.finished")) finished = true;
    });
    expect(finished).toBe(true);
    expect(race.standings()[0]?.racerId).toBe("player");
  });
});
