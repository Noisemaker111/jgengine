import { describe, expect, test } from "bun:test";

import { propellerLoads, propellerThrust, settledShaftSpeed, type PropellerLoads } from "./propeller";

const RPM = 60 / (2 * Math.PI);
const loads = (): PropellerLoads => ({ thrust: 0, torque: 0, engineTorque: 0 });

describe("propeller", () => {
  test("the Cessna 172's fixed-pitch prop turns about 2300 rpm static and speeds up with airspeed", () => {
    // Cessna 172N POH: static rpm 2280 to 2380 at full throttle on the 1C160.
    const statics = settledShaftSpeed({}, 0, 1, 1.225, 340.294) * RPM;
    expect(statics).toBeGreaterThan(2200);
    expect(statics).toBeLessThan(2450);
    expect(settledShaftSpeed({}, 55, 1, 1.225, 340.294) * RPM).toBeGreaterThan(statics + 100);
  });

  test("thrust falls with advance ratio, and the engine loses torque in thin air", () => {
    const omega = settledShaftSpeed({}, 0, 1, 1.225, 340.294);
    const staticThrust = propellerLoads({}, omega, 0, 1, 1.225, 340.294, loads()).thrust;
    expect(staticThrust).toBeGreaterThan(2500);
    expect(propellerLoads({}, omega, 50, 1, 1.225, 340.294, loads()).thrust).toBeLessThan(0.7 * staticThrust);
    const sea = propellerLoads({}, omega, 0, 1, 1.225, 340.294, loads()).engineTorque;
    // Gagg–Ferrar at 8000 ft (σ 0.786): power 1.132σ − 0.132 = 0.758.
    expect(propellerLoads({}, omega, 0, 1, 0.9629, 340.294, loads()).engineTorque / sea).toBeCloseTo(0.758, 2);
  });

  test("strength 0 is the simple thrust, 1 the propeller's, past 1 its fall-off steepens", () => {
    expect(propellerThrust(3000, 2000, 0)).toBe(3000);
    expect(propellerThrust(3000, 2000, 0.5)).toBe(2500);
    expect(propellerThrust(3000, 2000, 1)).toBe(2000);
    expect(propellerThrust(3000, 2000, 2)).toBeCloseTo(2000 * (2 / 3), 9);
  });
});
