import { describe, expect, test } from "bun:test";

import { weatherBoundsRect } from "./EnvironmentScene.draw";

describe("environment weather bounds", () => {
  test("a descriptor's centred bounds become the rectangle the weather fields clip to", () => {
    expect(weatherBoundsRect(undefined)).toBeUndefined();
    expect(weatherBoundsRect({ w: 400, d: 225, position: [10, -187.5], fade: 12 })).toEqual({ minX: -190, minZ: -300, maxX: 210, maxZ: -75, fade: 12 });
    expect(weatherBoundsRect({ w: 40, d: 20 })).toEqual({ minX: -20, minZ: -10, maxX: 20, maxZ: 10 });
  });
});
