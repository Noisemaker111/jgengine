import { describe, expect, test } from "bun:test";

import { SANDY_LOAM } from "../granular/granularMaterial";
import { createSoftGround } from "../granular/softGround";
import { NEUTRAL_AXIS } from "../input/axisInput";
import { createEditableTerrain } from "../terrain/terraform";
import { flatField } from "../terrain/terrain";
import { tickDrivableVehicle } from "./drivableVehicle";
import { createVehicleDynamics } from "./vehicleDynamics";
import { vehicleTuning } from "./vehicleSpec";

const TUNING = vehicleTuning({
  tires: { grip: 1.2, drift: 0.15 },
  brakes: { abs: 1, brake: 12 },
  aids: { stability: 1 },
  chassis: { bodyRoll: 0.4 },
  engine: { topSpeed: 20, accel: 6 },
  steering: { turnRate: 2 },
});

describe("a car on soft ground", () => {
  test("its wheels leave ruts behind it in the terrain while the car itself is unchanged", () => {
    const terrain = createEditableTerrain({ bounds: { minX: -4, minZ: -2, maxX: 4, maxZ: 30 }, base: flatField(), cellSize: 0.1 });
    const ground = createSoftGround(terrain, { soil: { materials: [SANDY_LOAM], looseDepth: () => 0.3 } });
    const soft = createVehicleDynamics(TUNING, { position: [0, 0, 0], heading: 0 });
    const hard = createVehicleDynamics(TUNING, { position: [0, 0, 0], heading: 0 });
    for (let i = 0; i < 120; i += 1) {
      const a = tickDrivableVehicle(soft, 1 / 60, { ...NEUTRAL_AXIS, throttle: 0.6 }, { tires: { id: "car", time: i / 60, soil: { ground } } });
      const b = tickDrivableVehicle(hard, 1 / 60, { ...NEUTRAL_AXIS, throttle: 0.6 });
      expect(a.step.position).toEqual(b.step.position);
    }
    ground.step(0);
    const half = TUNING.trackWidth / 2;
    expect(ground.rutDepthAt(half, 2)).toBeGreaterThan(0.005);
    expect(terrain.sampleHeight(half, 2)).toBeLessThan(-0.005);
    expect(ground.rutDepthAt(0, 2)).toBeLessThan(ground.rutDepthAt(half, 2));
  });
});
