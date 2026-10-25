import { describe, expect, test } from "bun:test";

import { enclosurePreset, reverbZoneAt, type ReverbZoneDef } from "./reverb";

describe("reverbZoneAt", () => {
  const zones: ReverbZoneDef[] = [
    { id: "crypt", preset: "cave", center: [0, 0, 0], radius: 5 },
    { id: "hall", preset: "hall", min: [10, 0, 10], max: [20, 8, 20] },
  ];

  test("finds the sphere or box holding a point, and nothing outside them", () => {
    expect(reverbZoneAt(zones, 1, 1, 1)?.id).toBe("crypt");
    expect(reverbZoneAt(zones, 15, 2, 12)?.id).toBe("hall");
    expect(reverbZoneAt(zones, 15, 9, 12)).toBeNull();
    expect(reverbZoneAt(zones, 6, 0, 0)).toBeNull();
  });
});

describe("enclosurePreset", () => {
  test("open sky is outdoor even beside a wall", () => {
    expect(enclosurePreset({ ceiling: null, walls: [2, null, null, null, null, null] })).toBe("outdoor");
  });

  test("a low roof with walls close around is a room; far walls or a high roof make a hall", () => {
    expect(enclosurePreset({ ceiling: 3, walls: [3, 4, 2, 3, null, 4] })).toBe("room");
    expect(enclosurePreset({ ceiling: 12, walls: [12, 10, 11, 13, 12, null] })).toBe("hall");
  });

  test("a roof with open sides reads as a room only when low (an awning), else outdoor", () => {
    expect(enclosurePreset({ ceiling: 4, walls: [null, null, null, null, null, 3] })).toBe("room");
    expect(enclosurePreset({ ceiling: 20, walls: [null, null, null, null, null, null] })).toBe("outdoor");
  });
});
