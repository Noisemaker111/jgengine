import { describe, expect, test } from "bun:test";

import type { RigidAircraftTuning } from "../aircraftDynamics";
import { compareRotorcraft } from "./rotorcraftComparison";

const helicopter: RigidAircraftTuning = {
  massKg: 1450,
  inertia: { pitch: 4000, yaw: 4500, roll: 1500 },
  surfaces: [],
  rotor: { maxThrust: 26000, radius: 5.1, torque: 10000, spoolRate: 0.9, tail: { maxThrust: 2500, at: [0, 0, -7.5] } },
};

describe("compareRotorcraft", () => {
  test("lines a game rotor up against the Bo-105 rotor and the NASA data", () => {
    const [table, ...rest] = compareRotorcraft([{ name: "test heli", tuning: helicopter }, { name: "glider", tuning: { massKg: 300, inertia: { pitch: 1, yaw: 1, roll: 1 }, surfaces: [] } }]);
    expect(rest).toHaveLength(0);
    expect(table?.rows).toHaveLength(7);
    const row = (label: string) => table?.rows.find((entry) => entry.label.startsWith(label));
    // The game rotor's inflow factor clamps at 1 + 1/2 descending at v_h; the blade-element rotor gains about a quarter.
    expect(row("thrust descending")?.game).toBeCloseTo(1.5, 3);
    expect(row("thrust descending")?.reference).toBeGreaterThan(1.1);
    expect(row("thrust descending")?.reference).toBeLessThan(1.35);
    expect(row("hover torque")?.real).toBeCloseTo(7.56, 1);
    expect(row("rotor power")?.game).toBeNaN();
    // The game rotor spins down with the throttle; the reference autorotates.
    expect(row("rotor speed")?.game).toBeLessThan(0.05);
    expect(row("rotor speed")?.reference).toBeGreaterThan(0.85);
  });
});
