import { describe, expect, test } from "bun:test";

import { ZONE_AIR, airAt, gust } from "./air";
import { ZONES } from "./zones";

describe("zone air", () => {
  test("every zone describes its own air", () => {
    for (const zone of ZONES) expect(ZONE_AIR[zone.id]).toBeDefined();
  });

  test("an unknown or absent zone still resolves", () => {
    expect(airAt(null).wind).toBeGreaterThan(0);
    expect(airAt("not_a_zone").wind).toBeGreaterThan(0);
  });

  test("zones read as different places, not one tuned setting", () => {
    const gale = airAt("windshear_waste");
    const blight = airAt("eridium_blight");
    expect(gale.wind).toBeGreaterThan(blight.wind);
    expect(blight.industry).toBeGreaterThan(gale.industry);
    // The Blight carries reactor ash, not sand — the two must not share a colour.
    expect(blight.dust).not.toBe(gale.dust);
  });

  test("the gust curve stays in a sane band and actually varies", () => {
    const samples = [0, 1500, 4000, 9000, 21000, 44000].map((ms) => gust(ms));
    for (const sample of samples) {
      expect(sample).toBeGreaterThan(0.3);
      expect(sample).toBeLessThan(1.1);
    }
    expect(new Set(samples).size).toBeGreaterThan(4);
  });
});
