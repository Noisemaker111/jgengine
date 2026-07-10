import { describe, expect, test } from "bun:test";

import {
  BOOST_DURATION_CAP,
  chargeDriftMeter,
  driftStyleFromSlip,
  initialDriftMeter,
  startBoost,
  tickBoost,
} from "./driftMeter";

describe("drift meter", () => {
  test("starts empty and idle", () => {
    const meter = initialDriftMeter();
    expect(meter.charge).toBe(0);
    expect(meter.boosting).toBe(false);
  });

  test("charges up over time proportional to drift style", () => {
    let meter = initialDriftMeter();
    for (let i = 0; i < 60; i += 1) meter = chargeDriftMeter(meter, 1 / 60, 1);
    expect(meter.charge).toBeGreaterThan(0);
    expect(meter.charge).toBeLessThanOrEqual(1);
  });

  test("charges faster with a higher style value", () => {
    const low = chargeDriftMeter(initialDriftMeter(), 0.5, 0.2);
    const high = chargeDriftMeter(initialDriftMeter(), 0.5, 1);
    expect(high.charge).toBeGreaterThan(low.charge);
  });

  test("zero style does not charge the meter", () => {
    const meter = chargeDriftMeter(initialDriftMeter(), 1, 0);
    expect(meter.charge).toBe(0);
  });

  test("charge clamps at 1", () => {
    let meter = initialDriftMeter();
    for (let i = 0; i < 600; i += 1) meter = chargeDriftMeter(meter, 1 / 60, 1);
    expect(meter.charge).toBeLessThanOrEqual(1);
  });

  test("startBoost requires existing charge", () => {
    const empty = startBoost(initialDriftMeter());
    expect(empty.boosting).toBe(false);
    const charged = startBoost({ charge: 0.6, boosting: false, boostTimeRemaining: 0 });
    expect(charged.boosting).toBe(true);
    expect(charged.boostTimeRemaining).toBe(BOOST_DURATION_CAP);
  });

  test("boost drains the meter over time and ends when charge or time expires", () => {
    let meter = startBoost({ charge: 0.4, boosting: false, boostTimeRemaining: 0 });
    for (let i = 0; i < 120 && meter.boosting; i += 1) meter = tickBoost(meter, 1 / 60);
    expect(meter.boosting).toBe(false);
    expect(meter.charge).toBe(0);
  });

  test("charging is paused while boosting", () => {
    const boosting = { charge: 0.3, boosting: true, boostTimeRemaining: 1 };
    const next = chargeDriftMeter(boosting, 1, 1);
    expect(next).toEqual(boosting);
  });

  test("driftStyleFromSlip maps slip to a 0..1 style value", () => {
    expect(driftStyleFromSlip(0)).toBe(0);
    expect(driftStyleFromSlip(2)).toBe(1);
    expect(driftStyleFromSlip(0.55)).toBeGreaterThan(0.3);
    expect(driftStyleFromSlip(0.55)).toBeLessThan(0.7);
  });
});
