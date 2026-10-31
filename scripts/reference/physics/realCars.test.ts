import { describe, expect, test } from "bun:test";

import { checkReferenceAgainstPublished, PUBLISHED_TOLERANCES, type ComparableHandlingMetrics } from "./compareHandling";
import { MAZDA_MX5_ND, REAL_CARS } from "./realCars";
import { createReferenceCar } from "./referenceCar";

const KMH_100 = 100 / 3.6;
const DT = 1 / 60;

// Fast subset: 0–100 km/h and the stop from 100 km/h for every real car. The skidpad and the ISO tests run in
// `bun run games:capabilities handling --validate`.
describe("reference car against published test numbers", () => {
  for (const car of REAL_CARS) {
    test(`${car.name}: 0-100 km/h and 100-0 km/h braking`, () => {
      const reference = createReferenceCar(car.spec);
      const full = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
      let time = 0;
      let step = reference.tick(DT, full);
      while (step.forwardSpeed < KMH_100 && time < 20) {
        time += DT;
        step = reference.tick(DT, full);
      }
      const zeroTo100 = time + DT;
      // Braking starts one tick past 100 km/h; v² scaling gives the distance from exactly 100.
      const start = step.forwardSpeed;
      let distance = 0;
      while (step.forwardSpeed > 0.3 && distance < 100) {
        step = reference.tick(DT, { throttle: 0, brake: 1, steer: 0, handbrake: 0 });
        distance += Math.max(0, step.forwardSpeed) * DT;
      }
      const brake100To0 = distance * (KMH_100 / start) ** 2;
      expect(Math.abs(zeroTo100 - car.tested.zeroTo100) / car.tested.zeroTo100).toBeLessThan(PUBLISHED_TOLERANCES.zeroTo100);
      expect(Math.abs(brake100To0 - car.tested.brake100To0) / car.tested.brake100To0).toBeLessThan(PUBLISHED_TOLERANCES.brake100To0);
    }, 30000);
  }

  test("every real car names a source for each published number", () => {
    for (const car of REAL_CARS) {
      for (const source of Object.values(car.tested.sources)) expect(source.length).toBeGreaterThan(10);
      expect(car.specSources["massKg"]).toBeDefined();
    }
  });

  test("checkReferenceAgainstPublished applies relative and absolute tolerances", () => {
    const tested = MAZDA_MX5_ND.tested;
    const metrics: ComparableHandlingMetrics = {
      zeroTo100: tested.zeroTo100 * 1.04,
      brake100To0: tested.brake100To0 * 1.06,
      topSpeed: 200,
      skidpadG: tested.skidpadG - 0.02,
      understeerGradient: 1,
      steadyStateMaxG: 0.9,
      stepResponseTime: 0.2,
      stepOvershoot: 1.1,
      laneChangeSpeed: 70,
    };
    const checks = checkReferenceAgainstPublished(MAZDA_MX5_ND, metrics);
    expect(checks.map((check) => check.pass)).toEqual([true, false, true]);
    expect(checks[0]?.gap).toBeCloseTo(0.04, 9);
    expect(checks[2]?.gap).toBeCloseTo(-0.02, 9);
  });
});
