import { describe, expect, test } from "bun:test";

import { buildIceWorld } from "../ice/build";
import { advanceLapBoundary, markCrossed } from "../ice/grid";
import { CORRIDOR_LINES, legSampleRange } from "../race/track";
import { chooseCorridor, sledderById } from "./sledders";

const rng = () => 0;

function crackLeg(worldIn: ReturnType<typeof buildIceWorld>, corridor: "inner" | "mid" | "outer", leg: number) {
  const [start] = legSampleRange(leg);
  const point = CORRIDOR_LINES[corridor][start]!;
  let world = markCrossed(worldIn, point[0], point[1]);
  ({ world } = advanceLapBoundary(world));
  return world;
}

describe("AI sledder corridor choice", () => {
  test("a fresh circuit is a tie — rotator falls back to rng-broken choice", () => {
    const world = buildIceWorld();
    const rotator = sledderById("polaris");
    const corridor = chooseCorridor(rotator, world, 2, rng);
    expect(["inner", "mid", "outer"]).toContain(corridor);
  });

  test("the rotator avoids a corridor once it is cracked", () => {
    let world = buildIceWorld();
    world = crackLeg(world, "mid", 2);
    const rotator = sledderById("polaris");
    const corridor = chooseCorridor(rotator, world, 2, rng);
    expect(corridor).not.toBe("mid");
  });

  test("the rotator strongly avoids open water over merely cracked ice", () => {
    let world = buildIceWorld();
    world = crackLeg(world, "inner", 3);
    world = crackLeg(world, "inner", 3);
    world = crackLeg(world, "mid", 3);
    const rotator = sledderById("polaris");
    const corridor = chooseCorridor(rotator, world, 3, rng);
    expect(corridor).toBe("outer");
  });

  test("the line-repeater always takes its favorite corridor regardless of ice state", () => {
    let world = buildIceWorld();
    world = crackLeg(world, "inner", 0);
    world = crackLeg(world, "inner", 0);
    const repeater = sledderById("borealis");
    expect(repeater.favoriteCorridor).toBe("inner");
    const corridor = chooseCorridor(repeater, world, 0, rng);
    expect(corridor).toBe("inner");
  });
});
