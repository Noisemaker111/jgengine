import { describe, expect, test } from "bun:test";

import { magicFormulaTrail, magicFormulaWheel, TNO_205_60R15_TIRE } from "./tireMagicFormula";
import { createVehicleDynamics, type VehicleDynamicsTuning } from "./vehicleDynamics";

const tire = TNO_205_60R15_TIRE;

describe("magicFormulaWheel", () => {
  test("at nominal load it is the fitted tyre: μy = PDY1, μx = PDX1, about 53 kN/rad", () => {
    const wheel = magicFormulaWheel(tire, tire.fnomin);
    expect(wheel.muY).toBeCloseTo(tire.pdy1, 9);
    expect(wheel.muX).toBeCloseTo(tire.pdx1, 9);
    expect(wheel.stiffness / 1000).toBeCloseTo(53.3, 1);
    expect(wheel.e).toBeLessThan(1);
  });

  test("grip per newton falls with load, so moving load across an axle costs it grip", () => {
    const loads = [1000, 2000, 3000, 4000, 6000];
    const mu = loads.map((fz) => magicFormulaWheel(tire, fz).muY);
    for (let i = 1; i < mu.length; i += 1) expect(mu[i] ?? 0).toBeLessThan(mu[i - 1] ?? 0);
    const axle = (transfer: number) => {
      const outer = magicFormulaWheel(tire, 3000 + transfer);
      const inner = magicFormulaWheel(tire, 3000 - transfer);
      return outer.muY * (3000 + transfer) + inner.muY * (3000 - transfer);
    };
    expect(axle(1500)).toBeLessThan(axle(0));
  });

  test("the load-sensitivity dial keeps nominal load fixed and scales the fall with load", () => {
    const at = (fz: number, dial: number) => magicFormulaWheel(tire, fz, 0, dial).muY;
    expect(at(tire.fnomin, 4)).toBeCloseTo(at(tire.fnomin, 1), 12);
    expect(at(6000, 0)).toBeCloseTo(tire.pdy1, 12);
    expect(at(6000, 4)).toBeLessThan(at(6000, 1));
    expect(at(1e6, 4)).toBeGreaterThan(0);
  });

  test("pneumatic trail is a few centimetres at small slip and collapses past the peak", () => {
    const small = magicFormulaTrail(tire, 3000, 0.01);
    expect(small).toBeGreaterThan(0.015);
    expect(small).toBeLessThan(0.05);
    expect(magicFormulaTrail(tire, 3000, 0.3)).toBeLessThan(small * 0.3);
    expect(magicFormulaTrail(tire, 0, 0.01)).toBe(0);
  });
});

describe("magicFormula effect", () => {
  const car: VehicleDynamicsTuning = {
    massKg: 1150,
    wheelbase: 2.3,
    frontWeight: 0.5,
    comHeight: 0.45,
    trackWidth: 1.5,
    front: { peakGrip: 0.93, peakSlipAngle: 0.15, slideGrip: 0.87, corneringStiffness: 15.3 },
    driveFront: 0,
    powertrain: { kind: "direct", maxForce: 6000, maxPower: 90000, coastForce: 0 },
    brakeForce: 12000,
    steering: { maxAngle: 0.5, rate: 6 },
    effects: { lateralLoadTransfer: {} },
  };
  const lateral = (tuning: VehicleDynamicsTuning) => {
    const dynamics = createVehicleDynamics(tuning);
    dynamics.restore({ ...dynamics.snapshot(), motion: { ...dynamics.snapshot().motion, vz: 20 } });
    let peak = 0;
    for (let i = 0; i < 240; i += 1) {
      const step = dynamics.tick(1 / 60, { throttle: 0.4, brake: 0, steer: 0.6, handbrake: 0 });
      peak = Math.max(peak, Math.abs(step.motion.lateralAccel));
    }
    return peak / 9.81;
  };

  test("each wheel at its own load holds less in a corner than one curve for the axle", () => {
    const plain = lateral(car);
    const formula = lateral({ ...car, effects: { ...car.effects, magicFormula: {} } });
    expect(formula).toBeLessThan(plain);
    expect(formula).toBeGreaterThan(plain * 0.85);
  });

  test("strength 0 drives exactly like the axle curves", () => {
    expect(lateral({ ...car, effects: { ...car.effects, magicFormula: { strength: 0 } } })).toBe(lateral(car));
  });
});
