import { describe, expect, test } from "bun:test";

import { isLocalSource } from "./ShotFeedback";

function ctx(possessed: string) {
  return { player: { userId: "p1", possession: { active: () => possessed } } } as never;
}

describe("isLocalSource", () => {
  test("the local player and what they drive count as local", () => {
    expect(isLocalSource(ctx("p1"), "p1")).toBe(true);
    expect(isLocalSource(ctx("car-7"), "car-7")).toBe(true);
    expect(isLocalSource(ctx("car-7"), "p1")).toBe(true);
  });

  test("anyone else, or no source, does not", () => {
    expect(isLocalSource(ctx("p1"), "enemy-3")).toBe(false);
    expect(isLocalSource(ctx("p1"), undefined)).toBe(false);
  });
});
