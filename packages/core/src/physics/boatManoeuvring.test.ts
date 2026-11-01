import { describe, expect, test } from "bun:test";

import { hullManoeuvringForces, rudderForces, type HullManoeuvring } from "./boatManoeuvring";

// KVLCC2 hull derivatives and rudder (Yasukawa and Yoshimura 2015).
const kvlcc2: HullManoeuvring = {
  draft: 0.46,
  derivatives: { Xvv: -0.04, Xvr: 0.002, Xrr: 0.011, Xvvvv: 0.771, Yv: -0.315, Yr: 0.083, Yvvv: -1.607, Yvvr: 0.379, Yvrr: -0.391, Yrrr: 0.008, Nv: -0.137, Nr: -0.049, Nvvv: -0.03, Nvvr: -0.294, Nvrr: 0.055, Nrrr: -0.013 },
  rudder: { area: 0.0539, height: 0.345, position: -0.5, deduction: 0.387, hullForceFactor: 0.312, hullForcePosition: -0.464, straighteningNegative: 0.395, straighteningPositive: 0.64, inflowLever: -0.71, wakeRatio: 1.09, raceFactor: 0.5, liftSlope: 2.747 },
};

describe("boatManoeuvring", () => {
  test("a hull running straight feels no side force; sliding to starboard pushes back to port", () => {
    expect(hullManoeuvringForces(kvlcc2, 7, 1000, 1.18, 0, 0)).toEqual([0, 0, 0]);
    const [, y] = hullManoeuvringForces(kvlcc2, 7, 1000, 1.18, 0.1, 0);
    expect(y).toBeLessThan(0);
    const [, , n] = hullManoeuvringForces(kvlcc2, 7, 1000, 1.18, 0, 0.05);
    expect(n).toBeLessThan(0);
  });

  test("starboard rudder in the propeller race yaws the ship to starboard and costs speed", () => {
    const rudder = kvlcc2.rudder;
    if (rudder === undefined) throw new Error("no rudder");
    const race = { inflow: 0.71, thrustCoefficient: 0.2, advance: 0.3, diameter: 0.216 };
    const [x, y, n] = rudderForces(rudder, 7, 1000, 1.18, 0, 0, 0.3, race);
    expect(n).toBeGreaterThan(0);
    expect(y).toBeLessThan(0);
    expect(x).toBeLessThan(0);
    const [, , weaker] = rudderForces(rudder, 7, 1000, 1.18, 0, 0, 0.3, { ...race, thrustCoefficient: 0 });
    expect(weaker).toBeLessThan(n);
  });
});
