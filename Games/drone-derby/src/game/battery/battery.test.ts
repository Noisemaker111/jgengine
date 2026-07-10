import { describe, expect, test } from "bun:test";

import {
  BATTERY_MAX,
  batteryStatus,
  chargeBattery,
  computeLoad,
  createBattery,
  currentDrainRate,
  drainBattery,
  estimateRangeMeters,
} from "./battery";

describe("computeLoad", () => {
  test("coasting with no input yields the baseline load of 1", () => {
    expect(computeLoad({ throttleMagnitude: 0, verticalSpeed: 0, boost: false, headwind: 0 })).toBe(1);
  });

  test("full throttle increases load monotonically", () => {
    const half = computeLoad({ throttleMagnitude: 0.5, verticalSpeed: 0, boost: false, headwind: 0 });
    const full = computeLoad({ throttleMagnitude: 1, verticalSpeed: 0, boost: false, headwind: 0 });
    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(1);
  });

  test("boost adds a flat bonus on top of throttle load", () => {
    const withoutBoost = computeLoad({ throttleMagnitude: 0.5, verticalSpeed: 0, boost: false, headwind: 0 });
    const withBoost = computeLoad({ throttleMagnitude: 0.5, verticalSpeed: 0, boost: true, headwind: 0 });
    expect(withBoost).toBeGreaterThan(withoutBoost);
  });

  test("climbing and headwind both raise load", () => {
    const base = computeLoad({ throttleMagnitude: 0, verticalSpeed: 0, boost: false, headwind: 0 });
    const climbing = computeLoad({ throttleMagnitude: 0, verticalSpeed: 10, boost: false, headwind: 0 });
    const headwind = computeLoad({ throttleMagnitude: 0, verticalSpeed: 0, boost: false, headwind: 8 });
    expect(climbing).toBeGreaterThan(base);
    expect(headwind).toBeGreaterThan(base);
  });

  test("descending does not reduce load below baseline", () => {
    expect(computeLoad({ throttleMagnitude: 0, verticalSpeed: -10, boost: false, headwind: 0 })).toBe(1);
  });
});

describe("drainBattery", () => {
  test("drains at rate * load * dt", () => {
    const battery = createBattery();
    drainBattery(battery, 1, 2);
    expect(battery.value("cell")).toBeCloseTo(BATTERY_MAX - currentDrainRate(2), 5);
  });

  test("higher load drains faster than coasting over the same duration", () => {
    const coasting = createBattery();
    const loaded = createBattery();
    for (let i = 0; i < 10; i += 1) {
      drainBattery(coasting, 1, 1);
      drainBattery(loaded, 1, 4);
    }
    expect(loaded.value("cell")).toBeLessThan(coasting.value("cell"));
  });

  test("never drains below zero", () => {
    const battery = createBattery();
    for (let i = 0; i < 500; i += 1) drainBattery(battery, 1, 10);
    expect(battery.value("cell")).toBe(0);
  });
});

describe("chargeBattery", () => {
  test("refills cells while grounded and stops draining", () => {
    const battery = createBattery();
    drainBattery(battery, 10, 5);
    const beforeCharge = battery.value("cell");
    chargeBattery(battery, 2);
    expect(battery.value("cell")).toBeGreaterThan(beforeCharge);
  });

  test("never overfills past the max", () => {
    const battery = createBattery();
    for (let i = 0; i < 50; i += 1) chargeBattery(battery, 1);
    expect(battery.value("cell")).toBeLessThanOrEqual(BATTERY_MAX);
  });
});

describe("estimateRangeMeters", () => {
  test("range shrinks as load increases for the same cell count", () => {
    const lowLoadRange = estimateRangeMeters(50, 1);
    const highLoadRange = estimateRangeMeters(50, 4);
    expect(highLoadRange).toBeLessThan(lowLoadRange);
  });

  test("range is consistent with the drain-rate model", () => {
    const cells = 40;
    const load = 2.5;
    const expected = (cells / currentDrainRate(load)) * 18;
    expect(estimateRangeMeters(cells, load)).toBeCloseTo(expected, 5);
  });
});

describe("batteryStatus", () => {
  test("classifies thresholds correctly", () => {
    expect(batteryStatus(80)).toBe("ok");
    expect(batteryStatus(15)).toBe("low");
    expect(batteryStatus(5)).toBe("critical");
    expect(batteryStatus(0)).toBe("empty");
  });
});
