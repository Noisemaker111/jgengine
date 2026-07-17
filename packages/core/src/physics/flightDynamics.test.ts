import { describe, expect, test } from "bun:test";

import { createAircraftDynamics, type AircraftTuning, type FlightControlInput } from "./flightDynamics";

const DT = 1 / 60;
const NEUTRAL: FlightControlInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };

const FIXED_WING: AircraftTuning = {
  kind: "fixedWing",
  mass: 4,
  maxThrust: 42,
  maxSpeed: 90,
  drag: 0.018,
  sideDrag: 0.035,
  lift: 12,
  stallSpeed: 12,
  controls: { pitch: 1.2, roll: 1.8, yaw: 0.65, response: 5, damping: 0.8, stability: 0.8 },
  afterburnerMultiplier: 1.5,
};

const HELICOPTER: AircraftTuning = {
  kind: "rotorcraft",
  mass: 5,
  maxThrust: 16,
  maxSpeed: 55,
  drag: 0.035,
  sideDrag: 0.08,
  lift: 0,
  stallSpeed: 1,
  hoverThrust: 58,
  controls: { pitch: 0.8, roll: 1, yaw: 1.1, response: 4, damping: 1.2, stability: 1.4 },
};

describe("createAircraftDynamics", () => {
  test("a powered fixed-wing aircraft accelerates, lifts, and responds smoothly to pitch and roll", () => {
    const aircraft = createAircraftDynamics(FIXED_WING, { position: [0, 20, 0], velocity: [0, 0, 16] });
    let step = aircraft.tick(DT, { ...NEUTRAL, throttle: 1, pitch: 0.4, roll: 0.3 });
    for (let i = 0; i < 240; i += 1) step = aircraft.tick(DT, { ...NEUTRAL, throttle: 1, pitch: 0.4, roll: 0.3 });
    expect(step.airspeed).toBeGreaterThan(16);
    expect(step.position[1]).toBeGreaterThan(20);
    expect(step.rotation[0]).toBeGreaterThan(0);
    expect(step.rotation[2]).toBeGreaterThan(0);
    expect(step.stalled).toBe(false);
  });

  test("a helicopter reaches a controllable hover and cyclic tilt produces forward travel", () => {
    const aircraft = createAircraftDynamics(HELICOPTER, { position: [0, 8, 0] });
    let step = aircraft.tick(DT, { ...NEUTRAL, throttle: 0.86, collective: 0.86, pitch: -0.35 });
    for (let i = 0; i < 300; i += 1) step = aircraft.tick(DT, { ...NEUTRAL, throttle: 0.86, collective: 0.86, pitch: -0.35 });
    expect(step.position[2]).toBeGreaterThan(1);
    expect(step.position[1]).toBeGreaterThan(1);
    expect(Math.abs(step.rotation[0])).toBeGreaterThan(0.05);
  });

  test("ground contact prevents tunneling below terrain", () => {
    const aircraft = createAircraftDynamics(FIXED_WING, {
      position: [0, 3, 0],
      velocity: [0, -30, 0],
      groundHeight: () => 2,
    });
    let step = aircraft.tick(DT, NEUTRAL);
    for (let i = 0; i < 30; i += 1) step = aircraft.tick(DT, NEUTRAL);
    expect(step.position[1]).toBeGreaterThanOrEqual(2.6);
  });

  test("VTOL transition blends hover lift into wing-borne flight", () => {
    const aircraft = createAircraftDynamics(
      { ...FIXED_WING, kind: "vtol", hoverThrust: 62, vtolTransitionSpeed: 28 },
      { position: [0, 8, 0] },
    );
    let step = aircraft.tick(DT, { ...NEUTRAL, throttle: 1, collective: 1, vectoring: 1 });
    for (let i = 0; i < 120; i += 1) step = aircraft.tick(DT, { ...NEUTRAL, throttle: 1, collective: 1, vectoring: 1 });
    const hoverAltitude = step.position[1];
    for (let i = 0; i < 240; i += 1) step = aircraft.tick(DT, { ...NEUTRAL, throttle: 1, collective: 0.7, vectoring: 0 });
    expect(hoverAltitude).toBeGreaterThan(8);
    expect(step.position[2]).toBeGreaterThan(5);
    expect(step.airspeed).toBeGreaterThan(5);
  });
});
