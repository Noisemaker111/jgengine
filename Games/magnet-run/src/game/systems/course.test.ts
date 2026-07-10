import { describe, expect, test } from "bun:test";
import { gateAt, stripPolarityAt, type GateSegment, type StripSegment } from "./course";

const strips: StripSegment[] = [
  { surface: "floor", lane: 1, fromZ: 0, toZ: 10, polarity: "blue" },
  { surface: "floor", lane: 1, fromZ: 10, toZ: 20, polarity: "red" },
  { surface: "ceiling", lane: 0, fromZ: 0, toZ: 10, polarity: "red" },
];

const gates: GateSegment[] = [{ surface: "floor", lane: 2, z: 50, width: 1, requires: "blue" }];

describe("course lookups", () => {
  test("stripPolarityAt finds the covering segment", () => {
    expect(stripPolarityAt(strips, "floor", 1, 5)).toBe("blue");
    expect(stripPolarityAt(strips, "floor", 1, 15)).toBe("red");
  });
  test("stripPolarityAt returns null on a gap", () => {
    expect(stripPolarityAt(strips, "floor", 1, 25)).toBeNull();
    expect(stripPolarityAt(strips, "floor", 2, 5)).toBeNull();
  });
  test("stripPolarityAt is surface-specific", () => {
    expect(stripPolarityAt(strips, "ceiling", 0, 5)).toBe("red");
    expect(stripPolarityAt(strips, "floor", 0, 5)).toBeNull();
  });
  test("gateAt finds a gate within tolerance", () => {
    expect(gateAt(gates, "floor", 2, 50)?.requires).toBe("blue");
    expect(gateAt(gates, "floor", 2, 50.4)?.requires).toBe("blue");
  });
  test("gateAt misses outside tolerance and on other lanes", () => {
    expect(gateAt(gates, "floor", 2, 55)).toBeNull();
    expect(gateAt(gates, "floor", 0, 50)).toBeNull();
  });
});
