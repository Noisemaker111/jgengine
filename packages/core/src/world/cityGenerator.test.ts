import { describe, expect, test } from "bun:test";
import { generateCity } from "./cityGenerator";
import { isOnRoad } from "./roads";

describe("cityGenerator", () => {
  const city = generateCity({ seed: "spec-city" }, 300, 300);

  test("one seed grows a populated city: streets plus street-facing lots", () => {
    expect(city.network.mode).toBe("net");
    expect(city.network.streets.length).toBeGreaterThan(4);
    expect(city.lots.length).toBeGreaterThan(10);
  });

  test("identical options generate the identical city", () => {
    const again = generateCity({ seed: "spec-city" }, 300, 300);
    expect(again.network).toEqual(city.network);
    expect(again.lots).toEqual(city.lots);
    const other = generateCity({ seed: "other-city" }, 300, 300);
    expect(other.lots).not.toEqual(city.lots);
  });

  test("no lot center sits on any street ribbon", () => {
    for (const lot of city.lots) {
      const clear = city.network.streets.every(
        (street) => !isOnRoad(street.points, street.width, lot.center[0], lot.center[1]),
      );
      expect(clear).toBe(true);
    }
  });

  test("lots stay inside the default clip area and respect the lane opt-out", () => {
    for (const lot of city.lots) {
      expect(Math.abs(lot.center[0])).toBeLessThanOrEqual(300);
      expect(Math.abs(lot.center[1])).toBeLessThanOrEqual(300);
    }
    const laneIndexes = new Set(
      city.network.streets.flatMap((street, i) => (street.level === "lane" ? [i] : [])),
    );
    expect(laneIndexes.size).toBeGreaterThan(0);
    const frontageCount = city.network.streets.length - laneIndexes.size;
    for (const lot of city.lots) {
      expect(lot.road).toBeLessThan(frontageCount);
    }
  });

  test("street overrides pass through to the network", () => {
    const circuitish = generateCity({ seed: "spec-city", streets: { loopiness: 1, connectivity: 0, branching: 0, deadEnds: 0 } }, 300, 300);
    expect(circuitish.network.mode).toBe("circuit");
  });
});
