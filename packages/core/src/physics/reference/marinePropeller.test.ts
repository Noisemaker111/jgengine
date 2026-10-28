import { describe, expect, test } from "bun:test";

import { bSeriesBladeSection, bSeriesOpenWater, bSeriesShipOpenWater, propellerForThrust, propellerProfileDragIncrement, waterjetThrust } from "./marinePropeller";
import { HOLTROP_MENNEN_EXAMPLE } from "./shipResistance";

describe("Wageningen B-series", () => {
  const { published } = HOLTROP_MENNEN_EXAMPLE;
  const advance = (HOLTROP_MENNEN_EXAMPLE.speed * (1 - published.wake)) / (published.revolutions * 8);

  test("Holtrop and Mennen's blade section and ITTC-1978 profile drag increment match the example within 0.5%", () => {
    const section = bSeriesBladeSection({ diameter: 8, blades: 4, areaRatio: published.bladeAreaRatio, pitchRatio: 1 });
    expect(Math.abs(section.chord / published.chord075 - 1)).toBeLessThan(5e-3);
    expect(Math.abs(section.thicknessRatio / published.thicknessChord075 - 1)).toBeLessThan(5e-3);
    expect(Math.abs(propellerProfileDragIncrement(section) / published.profileDragIncrement - 1)).toBeLessThan(5e-3);
  });

  test("at the pitch giving the example's K_T (the paper prints none), K_Q and open-water efficiency are within 0.5% of 0.033275 and 0.6461", () => {
    let low = 0.5;
    let high = 1.4;
    const geometry = (pitchRatio: number) => ({ diameter: 8, blades: 4, areaRatio: published.bladeAreaRatio, pitchRatio });
    for (let i = 0; i < 80; i += 1) {
      const mid = 0.5 * (low + high);
      if (bSeriesOpenWater(geometry(mid), advance).thrust < published.thrustCoefficient) low = mid;
      else high = mid;
    }
    const point = bSeriesOpenWater(geometry(low), advance);
    expect(Math.abs(point.torque / published.torqueCoefficient - 1)).toBeLessThan(5e-3);
    expect(Math.abs(point.efficiency / published.openWaterEfficiency - 1)).toBeLessThan(5e-3);
  });

  test("the full-scale correction lowers K_T and raises K_Q, and the operating point delivers the thrust asked", () => {
    const propeller = { diameter: 8, blades: 4, areaRatio: 0.74, pitchRatio: 1 };
    expect(bSeriesShipOpenWater(propeller, 0.7).thrust).toBeLessThan(bSeriesOpenWater(propeller, 0.7).thrust);
    expect(bSeriesShipOpenWater(propeller, 0.7).torque).toBeGreaterThan(bSeriesOpenWater(propeller, 0.7).torque);
    const point = propellerForThrust(propeller, 2.17e6, 9.54);
    expect((1025 * point.revolutions ** 2 * 8 ** 4 * point.thrust) / 2.17e6).toBeCloseTo(1, 6);
  });
});

describe("waterjet", () => {
  test("a lossless jet matches momentum theory: bollard thrust (4ρA·P²)^(1/3) and propulsive efficiency 2/(1 + V_j/V)", () => {
    const jet = { nozzleArea: 0.05, inletVelocityRatio: 1, pumpEfficiency: 1, nozzleLoss: 0, inletLoss: 0 };
    const bollard = waterjetThrust(jet, 500e3, 0);
    expect(bollard.thrust / Math.cbrt(4 * 1025 * 0.05 * 500e3 ** 2)).toBeCloseTo(1, 8);
    const running = waterjetThrust(jet, 500e3, 15);
    expect(running.efficiency).toBeCloseTo(2 / (1 + running.jetVelocity / 15), 8);
  });

  test("losses cost thrust", () => {
    const ideal = waterjetThrust({ nozzleArea: 0.05, pumpEfficiency: 1, nozzleLoss: 0, inletLoss: 0 }, 500e3, 15);
    expect(waterjetThrust({ nozzleArea: 0.05 }, 500e3, 15).thrust).toBeLessThan(ideal.thrust);
  });
});
