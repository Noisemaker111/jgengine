import { describe, expect, test } from "bun:test";
import { pickSpawnPoint } from "@jgengine/core/ai/spawnDirector";

const candidates = [
  [0, 0],
  [50, 0],
] as const;
const playerPositions = [[0, 0]] as const;

function rolls(step = 0.05): number[] {
  const values: number[] = [];
  for (let value = 0; value < 1; value += step) values.push(value);
  return values;
}

describe("pickSpawnPoint semantic API", () => {
  test("far distance bias favors candidates away from avoided positions", () => {
    let far = 0;
    for (const roll of rolls()) {
      const point = pickSpawnPoint({
        candidates,
        avoid: playerPositions,
        random: () => roll,
        distanceBias: "far",
        biasStrength: 4,
      });
      if (point?.[0] === 50) far += 1;
    }
    expect(far).toBeGreaterThan(10);
  });

  test("near distance bias favors candidates close to avoided positions", () => {
    let near = 0;
    for (const roll of rolls()) {
      const point = pickSpawnPoint({
        candidates,
        avoid: playerPositions,
        random: () => roll,
        distanceBias: "near",
        biasStrength: 4,
      });
      if (point?.[0] === 0) near += 1;
    }
    expect(near).toBeGreaterThan(10);
  });

  test("none selects uniformly without requiring avoided positions", () => {
    expect(
      pickSpawnPoint({ candidates, random: () => 0.75, distanceBias: "none" }),
    ).toEqual([50, 0]);
  });

  test("returns null when no candidates exist", () => {
    expect(pickSpawnPoint({ candidates: [], random: () => 0.5 })).toBeNull();
  });
});
