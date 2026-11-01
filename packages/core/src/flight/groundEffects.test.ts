import { describe, expect, test } from "bun:test";

import { machDragArea } from "./machDrag";
import { mainGearMoment } from "./mainGear";
import { nozzleThrust } from "./nozzle";
import { inducedDragFactor } from "./wingGroundEffect";

describe("wing ground effect", () => {
  test("McCormick's factor: a wing a tenth of its span up keeps about 72% of its induced drag", () => {
    // (16h/b)² / (1 + (16h/b)²) at h/b = 0.1.
    expect(inducedDragFactor({ span: 10 }, 1, 1)).toBeCloseTo(2.56 / 3.56, 9);
    expect(inducedDragFactor({ span: 10 }, 1, 100)).toBeGreaterThan(0.99);
    expect(inducedDragFactor({ span: 10 }, 0, 0.5)).toBe(1);
    expect(inducedDragFactor({ span: 10 }, 40, 0.5)).toBe(0);
  });
});

describe("main gear", () => {
  test("the wheels push the nose down by load times arm", () => {
    expect(mainGearMoment({ arm: 0.45 }, 1, 91000)).toBeCloseTo(40950, 6);
    expect(mainGearMoment({ arm: 0.45 }, 0, 91000)).toBe(0);
    expect(mainGearMoment({ arm: 0.45 }, 2, 91000)).toBeCloseTo(81900, 6);
  });
});

describe("Mach drag", () => {
  test("the Saturn V's axial-force coefficient rises through Mach 1", () => {
    const effect = { area: 79.5, coefficient: [[0, 0.3], [0.8, 0.32], [1, 0.45], [1.2, 0.52], [2, 0.4]] as const };
    expect(machDragArea(effect, 0.5) / 79.5).toBeCloseTo(0.3125, 9);
    expect(machDragArea(effect, 1.2) / 79.5).toBeCloseTo(0.52, 9);
    expect(machDragArea(effect, 9) / 79.5).toBeCloseTo(0.4, 9);
  });
});

describe("nozzle", () => {
  test("an F-1 delivers its 6.8 MN at sea level from 7.955 MN in vacuum through an 11.4 m² exit", () => {
    expect(nozzleThrust({ exitArea: 11.4 }, 1, 7.955e6, 7.955e6, 101325) / 1e6).toBeCloseTo(6.80, 2);
    expect(nozzleThrust({ exitArea: 11.4 }, 1, 7.955e6, 7.955e6, 0)).toBe(7.955e6);
    expect(nozzleThrust({ exitArea: 57 }, 1, 4 * 7.955e6, 5 * 7.955e6, 101325) / 1e6).toBeCloseTo(4 * 6.8, 0);
    expect(nozzleThrust({ exitArea: 11.4 }, 100, 7.955e6, 7.955e6, 101325)).toBe(0);
  });
});
