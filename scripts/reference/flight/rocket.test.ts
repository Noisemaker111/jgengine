import { describe, expect, test } from "bun:test";

import { createRocket, gravityTurnTarget, steerRocket, WGS84_EARTH, type EarthModel, type RocketDesign, type RocketSample, type RocketStage } from "./rocket";
import { SATURN_V_AS506, SATURN_V_AS506_ASCENT, SATURN_V_AS506_EVENTS, SATURN_V_AS506_LAUNCH } from "./saturnV";
import { STANDARD_GRAVITY, type AtmosphereSample } from "./standardAtmosphere";

const DEG = Math.PI / 180;
const VACUUM = (): AtmosphereSample => ({ temperature: 0, pressure: 0, density: 0, speedOfSound: 300, viscosity: 0 });
const NO_AERO = { area: 1, axialForce: [[0, 0]] as const, normalForceSlope: 0, centerOfPressure: 0 };

function within(actual: number, expected: number, relative: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);
}

function stage(name: string, dryMass: number, propellant: number, thrust: number, specificImpulse: number, burn: number, station: number): RocketStage {
  return { name, dryMass, propellant, station, length: 10, radius: 1, engines: [{ thrust: [[0, thrust], [burn, thrust]], specificImpulse, exitArea: 0 }], aero: NO_AERO };
}

const COAST: RocketDesign = { name: "coast", stages: [stage("spent", 1000, 0, 0, 300, 0, 0)], payload: { mass: 100, station: 10, length: 1, radius: 1 } };

describe("rocket 6-DOF", () => {
  test("a two-stage burn in free space gains exactly the sum of each stage's Tsiolkovsky Δv", () => {
    const design: RocketDesign = {
      name: "two-stage",
      stages: [stage("first", 1000, 7000, 200000, 300, 100, 0), stage("second", 300, 2000, 50000, 420, 50, 10)],
      payload: { mass: 200, station: 20, length: 2, radius: 1 },
    };
    const freeSpace: EarthModel = { ...WGS84_EARTH, mu: 0, j2: 0, rotationRate: 0 };
    const rocket = createRocket(design, { latitude: 0, longitude: 0, azimuth: Math.PI / 2 }, { earth: freeSpace, atmosphere: VACUUM, substep: 0.25 });
    let sample = rocket.sample();
    while (sample.time < 160) sample = rocket.step(0.25, { pitch: 0, yaw: 0 });
    const flow = (thrust: number, isp: number) => thrust / (isp * STANDARD_GRAVITY);
    const m0 = 1000 + 7000 + 300 + 2000 + 200;
    const m1 = m0 - 100 * flow(200000, 300);
    const m2 = 300 + 2000 + 200;
    const m3 = m2 - 50 * flow(50000, 420);
    const ideal = 300 * STANDARD_GRAVITY * Math.log(m0 / m1) + 420 * STANDARD_GRAVITY * Math.log(m2 / m3);
    expect(sample.stage).toBe(1);
    within(sample.mass, m3, 1e-12);
    within(sample.inertialSpeed, ideal, 1e-9);
  });

  test("a circular orbit closes after one period and keeps its energy (point-mass Earth)", () => {
    const earth: EarthModel = { ...WGS84_EARTH, j2: 0, rotationRate: 0 };
    const rocket = createRocket(COAST, { latitude: 0, longitude: 0, azimuth: 0 }, { earth, atmosphere: VACUUM, substep: 1 });
    const radius = earth.equatorialRadius + 400000;
    const speed = Math.sqrt(earth.mu / radius);
    const period = 2 * Math.PI * Math.sqrt(radius ** 3 / earth.mu);
    rocket.restore({ ...rocket.snapshot(), time: 0, position: [radius, 0, 0], velocity: [0, speed * Math.cos(0.4), speed * Math.sin(0.4)] });
    const energy = (s: RocketSample) => 0.5 * s.inertialSpeed ** 2 - earth.mu / Math.hypot(...s.position);
    const start = energy(rocket.sample());
    const whole = Math.floor(period);
    rocket.step(whole, { pitch: 0, yaw: 0 });
    const end = rocket.step(period - whole, { pitch: 0, yaw: 0 });
    expect(Math.hypot(end.position[0] - radius, end.position[1], end.position[2])).toBeLessThan(1);
    within(energy(end), start, 1e-9);
  });

  test("J2 turns the node of a 51.6° orbit at the secular rate −3/2·n·J2·(R/p)²·cos i, within 1%", () => {
    const earth: EarthModel = { ...WGS84_EARTH, rotationRate: 0 };
    const rocket = createRocket(COAST, { latitude: 0, longitude: 0, azimuth: 0 }, { earth, atmosphere: VACUUM, substep: 2 });
    const radius = earth.equatorialRadius + 400000;
    const speed = Math.sqrt(earth.mu / radius);
    const inclination = 51.6 * DEG;
    rocket.restore({ ...rocket.snapshot(), time: 0, position: [radius, 0, 0], velocity: [0, speed * Math.cos(inclination), speed * Math.sin(inclination)] });
    const node = (s: RocketSample) => {
      const [x, y, z] = s.position;
      const [u, v, w] = s.velocity;
      return Math.atan2(y * w - z * v, -(z * u - x * w));
    };
    // A least-squares slope over a day averages out the node's twice-per-orbit wobble.
    let n = 0;
    let st = 0;
    let sn = 0;
    let stt = 0;
    let stn = 0;
    for (let t = 0; t <= 86400; t += 60) {
      const s = t === 0 ? rocket.sample() : rocket.step(60, { pitch: 0, yaw: 0 });
      const value = node(s);
      n += 1;
      st += s.time;
      sn += value;
      stt += s.time * s.time;
      stn += s.time * value;
    }
    const slope = (n * stn - st * sn) / (n * stt - st * st);
    const motion = Math.sqrt(earth.mu / radius ** 3);
    const secular = -1.5 * motion * earth.j2 * (earth.equatorialRadius / radius) ** 2 * Math.cos(inclination);
    within(slope, secular, 0.01);
  });
});

describe("Saturn V AS-506 S-IC flight", () => {
  const rocket = createRocket(SATURN_V_AS506, SATURN_V_AS506_LAUNCH);
  let sample = rocket.sample();
  let mach1: RocketSample | undefined;
  let maxQ = sample;
  let ceco: RocketSample | undefined;
  let maxAcceleration = 0;
  let alpha = 0;
  while (sample.time < 200) {
    const next = rocket.step(0.1, steerRocket(sample, gravityTurnTarget(sample, SATURN_V_AS506_ASCENT), { attitude: 8, rate: 4 }));
    if (next.thrust === 0) break;
    sample = next;
    if (mach1 === undefined && sample.mach >= 1) mach1 = sample;
    if (sample.dynamicPressure > maxQ.dynamicPressure) maxQ = sample;
    if (ceco === undefined && sample.time >= SATURN_V_AS506_EVENTS.centerEngineCutoff.time) ceco = sample;
    maxAcceleration = Math.max(maxAcceleration, sample.sensedAcceleration);
    if (sample.time > 25) alpha = Math.max(alpha, sample.angleOfAttack);
  }
  const events = SATURN_V_AS506_EVENTS;

  test("burns out at the report's outboard engine cutoff: within 0.5 s, 3% altitude and range, 1% velocity, 0.5° flight path", () => {
    expect(Math.abs(sample.time - events.outboardEngineCutoff.time)).toBeLessThan(0.5);
    within(sample.altitude, events.outboardEngineCutoff.altitude, 0.03);
    within(sample.inertialSpeed, events.outboardEngineCutoff.velocity, 0.01);
    within(sample.surfaceRange, events.outboardEngineCutoff.surfaceRange, 0.03);
    expect(Math.abs(sample.inertialFlightPathAngle - events.outboardEngineCutoff.flightPathAngle)).toBeLessThan(0.5 * DEG);
    within(maxAcceleration, events.maxAcceleration, 0.02);
    expect(alpha).toBeLessThan(1 * DEG);
  });

  test("centre engine cutoff within 3% altitude and range, 1% velocity, 0.5° flight path", () => {
    if (ceco === undefined) throw new Error("no centre engine cutoff");
    within(ceco.altitude, events.centerEngineCutoff.altitude, 0.03);
    within(ceco.inertialSpeed, events.centerEngineCutoff.velocity, 0.01);
    within(ceco.surfaceRange, events.centerEngineCutoff.surfaceRange, 0.03);
    expect(Math.abs(ceco.inertialFlightPathAngle - events.centerEngineCutoff.flightPathAngle)).toBeLessThan(0.5 * DEG);
  });

  test("Mach 1 within 1.5 s and 8% altitude; max-Q within 5% of 35.2 kPa, 7 s and 3 km", () => {
    if (mach1 === undefined) throw new Error("never supersonic");
    expect(Math.abs(mach1.time - events.mach1.time)).toBeLessThan(1.5);
    within(mach1.altitude, events.mach1.altitude, 0.08);
    within(maxQ.dynamicPressure, events.maxDynamicPressure.pressure, 0.05);
    // The gravity turn reaches the flat top of the dynamic pressure curve earlier and lower than the tilt program flown.
    expect(Math.abs(maxQ.time - events.maxDynamicPressure.time)).toBeLessThan(7);
    expect(Math.abs(maxQ.altitude - events.maxDynamicPressure.altitude)).toBeLessThan(3000);
  });

  test("snapshot and restore replay the flight bit for bit", () => {
    const replay = createRocket(SATURN_V_AS506, SATURN_V_AS506_LAUNCH);
    replay.step(30, { pitch: 0.2, yaw: 0 });
    const saved = replay.snapshot();
    const a = replay.step(5, { pitch: -0.3, yaw: 0.1 });
    replay.restore(saved);
    const b = replay.step(5, { pitch: -0.3, yaw: 0.1 });
    expect(b.position).toEqual(a.position);
    replay.reset();
    expect(replay.sample().altitude).toBeCloseTo(0, 3);
  });
});
