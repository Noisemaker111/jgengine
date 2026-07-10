import { describe, expect, test } from "bun:test";
import { zoneAt, ZONE_IDS, zoneCentroid } from "./zones";

describe("zoneAt", () => {
  test("maps due east to the east cut", () => {
    expect(zoneAt(50, 0)).toBe("east");
  });

  test("maps upper-left arc to the center channel", () => {
    expect(zoneAt(-30, 50)).toBe("center");
  });

  test("maps lower-left arc to the west reach", () => {
    expect(zoneAt(-30, -50)).toBe("west");
  });

  test("wraps cleanly across the 0/360 seam", () => {
    expect(zoneAt(10, -5)).toBe("east");
  });

  test("every zone id resolves at its own centroid", () => {
    for (const zoneId of ZONE_IDS) {
      const [x, z] = zoneCentroid(zoneId, 70);
      expect(zoneAt(x, z)).toBe(zoneId);
    }
  });
});
