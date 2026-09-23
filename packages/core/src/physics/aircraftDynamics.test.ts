import { describe, expect, test } from "bun:test";

import {
  aircraftAttitudeQuaternion,
  type AircraftAssistCommand,
  type AircraftAssistContext,
  createRigidAircraft,
  type RigidAircraft,
  type RigidAircraftInput,
  type RigidAircraftOptions,
  type RigidAircraftStep,
  type RigidAircraftTuning,
} from "./aircraftDynamics";

const DT = 1 / 60;
const DEG = 180 / Math.PI;

// A light jet trimmed for ~180 m/s: wing incidence carries the weight at that speed with the tail unloaded.
const jet: RigidAircraftTuning = {
  massKg: 9000,
  inertia: { pitch: 60000, yaw: 70000, roll: 15000 },
  surfaces: [
    { at: [2.5, 0, 0], area: 14, liftSlope: 4.5, stallAngle: 0.3, incidence: 0.035, control: { roll: 0.15 } },
    { at: [-2.5, 0, 0], area: 14, liftSlope: 4.5, stallAngle: 0.3, incidence: 0.035, control: { roll: 0.15 } },
    { at: [0, 0, -6], area: 6, liftSlope: 4, control: { pitch: 0.6 } },
    { at: [0, 1, -6], normal: [1, 0, 0], area: 4, liftSlope: 4, control: { yaw: 0.5 } },
  ],
  engine: { maxThrust: 80000, spoolRate: 1.5 },
  dragArea: 1,
  gear: { height: 1.5 },
};

function input(partial: Partial<RigidAircraftInput>): RigidAircraftInput {
  return { throttle: 0.4, pitch: 0, roll: 0, yaw: 0, ...partial };
}

function airborne(tuning: RigidAircraftTuning = jet, speed = 180, extra: RigidAircraftOptions = {}): RigidAircraft {
  return createRigidAircraft(tuning, { position: [0, 2000, 0], velocity: [0, 0, speed], ...extra });
}

function fly(aircraft: RigidAircraft, seconds: number, control: RigidAircraftInput, each?: (step: RigidAircraftStep) => void): RigidAircraftStep {
  let step = aircraft.tick(DT, control);
  each?.(step);
  for (let i = 1; i < Math.round(seconds / DT); i += 1) {
    step = aircraft.tick(DT, control);
    each?.(step);
  }
  return step;
}

describe("createRigidAircraft", () => {
  test("a trimmed jet holds level flight hands-off at about 1 g", () => {
    const step = fly(airborne(), 10, input({}));
    expect(Math.abs(step.pitch * DEG)).toBeLessThan(2);
    expect(Math.abs(step.bank * DEG)).toBeLessThan(0.5);
    expect(step.gLoad).toBeGreaterThan(0.9);
    expect(step.gLoad).toBeLessThan(1.1);
    expect(step.stalled).toBe(false);
  });

  test("held back-stick loops the jet: pitch turns past 360° and it comes out where it went in", () => {
    let pitched = 0;
    let peakG = 0;
    let wentInverted = false;
    const step = fly(airborne(jet, 200), 20, input({ throttle: 1, pitch: 1 }), (s) => {
      pitched += s.pitchRate * DT;
      peakG = Math.max(peakG, s.gLoad);
      if (Math.abs(s.bank) > Math.PI / 2) wentInverted = true;
    });
    expect(pitched * DEG).toBeGreaterThan(360);
    expect(wentInverted).toBe(true);
    expect(peakG).toBeGreaterThan(5);
    expect(step.position[1]).toBeGreaterThan(1800);
    expect(step.stalled).toBe(false);
  });

  test("full aileron rolls it through 360° with a roll rate set by the surfaces, not a commanded rate", () => {
    let rolled = 0;
    let peak = 0;
    fly(airborne(), 3, input({ roll: 1 }), (s) => {
      rolled += s.rollRate * DT;
      peak = Math.max(peak, s.rollRate * DEG);
    });
    expect(rolled * DEG).toBeGreaterThan(360);
    expect(peak).toBeGreaterThan(150);
    expect(peak).toBeLessThan(300);
  });

  test("positive inputs mean nose up, right roll and nose right", () => {
    expect(fly(airborne(), 0.5, input({ pitch: 1 })).pitchRate).toBeGreaterThan(0);
    const rolled = fly(airborne(), 0.5, input({ roll: 1 }));
    expect(rolled.rollRate).toBeGreaterThan(0);
    expect(rolled.bank).toBeGreaterThan(0);
    expect(fly(airborne(), 0.5, input({ yaw: 1 })).yawRate).toBeGreaterThan(0);
  });

  test("a slow jet with a strong elevator stalls; a weaker tail can't pull as much angle of attack", () => {
    const strongTail: RigidAircraftTuning = { ...jet, surfaces: jet.surfaces.map((s, i) => (i === 2 ? { ...s, control: { pitch: 1.5 } } : s)) };
    let stalled = false;
    let peakAlpha = 0;
    fly(airborne(strongTail, 70), 8, input({ throttle: 0, pitch: 1 }), (s) => {
      stalled ||= s.stalled;
      peakAlpha = Math.max(peakAlpha, s.angleOfAttack);
    });
    expect(stalled).toBe(true);
    expect(peakAlpha).toBeGreaterThan(0.3);

    let stockAlpha = 0;
    fly(airborne(jet, 70), 8, input({ throttle: 0, pitch: 1 }), (s) => {
      stockAlpha = Math.max(stockAlpha, s.angleOfAttack);
    });
    expect(stockAlpha).toBeLessThan(peakAlpha * 0.8);
  });

  test("the fin weathervanes the nose into a sideslip", () => {
    const aircraft = airborne(jet, 180, { velocity: [20, 0, 180] });
    const first = aircraft.tick(DT, input({}));
    const later = fly(aircraft, 3, input({}));
    expect(Math.abs(first.sideslip)).toBeGreaterThan(0.08);
    expect(Math.abs(later.sideslip)).toBeLessThan(Math.abs(first.sideslip) * 0.3);
  });

  test("the result does not depend on the frame rate", () => {
    const at = (dt: number) => {
      const aircraft = airborne();
      for (let i = 0; i < Math.round(4 / dt); i += 1) aircraft.tick(dt, input({ pitch: 0.6, roll: 0.3, throttle: 1 }));
      return aircraft.pose().position;
    };
    const coarse = at(1 / 30);
    const fine = at(1 / 120);
    for (let i = 0; i < 3; i += 1) expect(Math.abs(coarse[i]! - fine[i]!)).toBeLessThan(0.05);
  });

  test("snapshot and restore replay bit-for-bit", () => {
    const aircraft = airborne();
    fly(aircraft, 2, input({ pitch: 0.4, roll: -0.5 }));
    const saved = aircraft.snapshot();
    const a = fly(aircraft, 2, input({ pitch: 1, yaw: 0.3, throttle: 1 }));
    aircraft.restore(saved);
    const b = fly(aircraft, 2, input({ pitch: 1, yaw: 0.3, throttle: 1 }));
    expect(b.position).toEqual(a.position);
    expect(b.orientation).toEqual(a.orientation);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test("retune swaps the airframe without losing pose or momentum", () => {
    const aircraft = airborne();
    fly(aircraft, 1, input({}));
    const before = aircraft.snapshot();
    aircraft.retune({ ...jet, massKg: jet.massKg * 1.6 });
    expect(aircraft.snapshot()).toEqual(before);
    expect(aircraft.tuning().massKg).toBe(jet.massKg * 1.6);
    const heavy = fly(aircraft, 5, input({}));
    const light = fly(airborne(), 6, input({}));
    expect(heavy.position[1]).toBeLessThan(light.position[1] - 20);
  });

  test("it rests on its gear, rolls out, rotates and lifts off", () => {
    const aircraft = createRigidAircraft(jet, { position: [0, 1.5, 0] });
    const parked = fly(aircraft, 2, input({ throttle: 0 }));
    expect(parked.grounded).toBe(true);
    expect(parked.position[1]).toBeCloseTo(1.5, 5);
    let liftedAt = Number.POSITIVE_INFINITY;
    let t = 0;
    fly(aircraft, 40, input({ throttle: 1, pitch: 0.4 }), (s) => {
      t += DT;
      if (!s.grounded && s.position[1] > 20 && liftedAt === Number.POSITIVE_INFINITY) liftedAt = t;
    });
    expect(liftedAt).toBeLessThan(40);
  });

  test("airspeed and telemetry are relative to the wind", () => {
    const aircraft = airborne(jet, 180, { wind: () => [0, 0, -20] });
    expect(aircraft.tick(DT, input({})).airspeed).toBeCloseTo(200, 0);
  });

  test("modifiers scale thrust per tick", () => {
    const boosted = fly(airborne(), 3, input({ throttle: 1 }), undefined);
    const aircraft = airborne();
    let step = aircraft.tick(DT, input({ throttle: 1 }), { thrustScale: 0 });
    for (let i = 1; i < 180; i += 1) step = aircraft.tick(DT, input({ throttle: 1 }), { thrustScale: 0 });
    expect(step.thrust).toBe(0);
    expect(boosted.airspeed).toBeGreaterThan(step.airspeed + 5);
  });

  test("the attitude quaternion round-trips through heading, pitch and bank", () => {
    const aircraft = createRigidAircraft(jet, { position: [0, 500, 0], orientation: aircraftAttitudeQuaternion(1.1, 0.4, -0.7) });
    const step = aircraft.tick(0, input({}));
    expect(step.heading).toBeCloseTo(1.1, 9);
    expect(step.pitch).toBeCloseTo(0.4, 9);
    expect(step.bank).toBeCloseTo(-0.7, 9);
  });
});

// A light single-rotor helicopter: the main rotor turns counter-clockwise seen from above, so its torque yaws the nose left.
const helicopter: RigidAircraftTuning = {
  massKg: 1450,
  inertia: { pitch: 4000, yaw: 4500, roll: 1500 },
  surfaces: [{ at: [0, 0.5, -6.5], normal: [1, 0, 0], area: 1, liftSlope: 3 }],
  rotor: { maxThrust: 25000, radius: 5.1, at: [0, 1.5, 0], torque: 10000, damping: 3000, tail: { maxThrust: 2500, at: [0, 0, -7.5] } },
  dragArea: 1.5,
  gear: { height: 1 },
};
const HOVER_COLLECTIVE = 0.57;
const TRIM_PEDAL = (10000 * HOVER_COLLECTIVE) / (2500 * 7.5);

function spunUp(tuning: RigidAircraftTuning, position: readonly [number, number, number], velocity: readonly [number, number, number] = [0, 0, 0]): RigidAircraft {
  const aircraft = createRigidAircraft(tuning, { position, velocity });
  aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1 });
  return aircraft;
}

function hover(partial: Partial<RigidAircraftInput> = {}): RigidAircraftInput {
  return { throttle: 1, collective: HOVER_COLLECTIVE, pitch: 0, roll: 0, yaw: TRIM_PEDAL, ...partial };
}

describe("createRigidAircraft rotor", () => {
  test("hover collective carries the weight out of ground effect", () => {
    const step = fly(spunUp(helicopter, [0, 50, 0]), 2, hover());
    expect(step.rotor!.thrust).toBeCloseTo(helicopter.massKg * 9.81, -2);
    expect(Math.abs(step.velocity[1])).toBeLessThan(0.2);
    expect(step.rotor!.groundEffect).toBeCloseTo(1, 2);
  });

  test("rotor torque swings the nose left unless the tail rotor cancels it", () => {
    const free = fly(spunUp(helicopter, [0, 50, 0]), 2, hover({ yaw: 0 }));
    expect(free.yawRate).toBeLessThan(0);
    expect(Math.abs(free.heading) * DEG).toBeGreaterThan(30);
    const trimmed = fly(spunUp(helicopter, [0, 50, 0]), 2, hover());
    expect(Math.abs(trimmed.heading) * DEG).toBeLessThan(8);
    const reversed = fly(spunUp({ ...helicopter, rotor: { ...helicopter.rotor!, torque: -10000 } }, [0, 50, 0]), 2, hover({ yaw: 0 }));
    expect(reversed.yawRate).toBeGreaterThan(0);
  });

  test("ground effect adds thrust near the ground and fades by a rotor diameter", () => {
    const low = spunUp(helicopter, [0, 1.2, 0]).tick(DT, hover());
    const high = spunUp(helicopter, [0, 12, 0]).tick(DT, hover());
    expect(low.rotor!.groundEffect).toBeGreaterThan(1.05);
    expect(high.rotor!.groundEffect).toBeLessThan(1.02);
    expect(low.rotor!.thrust).toBeGreaterThan(high.rotor!.thrust);
    expect(fly(spunUp(helicopter, [0, 1.2, 0]), 1, hover()).velocity[1]).toBeGreaterThan(0.3);
  });

  test("translational lift: clean air through the disc adds thrust at the same collective", () => {
    const still = spunUp(helicopter, [0, 50, 0]).tick(DT, hover());
    const moving = spunUp(helicopter, [0, 50, 0], [0, 0, 20]).tick(DT, hover());
    expect(moving.rotor!.translationalLift).toBeGreaterThan(1.15);
    expect(moving.rotor!.thrust).toBeGreaterThan(still.rotor!.thrust * 1.1);
  });

  test("climbing through the disc cuts thrust, so vertical motion damps out", () => {
    const climbing = spunUp(helicopter, [0, 50, 0], [0, 5, 0]).tick(DT, hover());
    const still = spunUp(helicopter, [0, 50, 0]).tick(DT, hover());
    expect(climbing.rotor!.thrust).toBeLessThan(still.rotor!.thrust * 0.8);
  });

  test("the rotor spools up at its rate and gives no thrust at rest", () => {
    const aircraft = createRigidAircraft(helicopter, { position: [0, 1, 0] });
    const parked = aircraft.tick(DT, hover({ throttle: 0 }));
    expect(parked.rotor!.speed).toBe(0);
    expect(parked.rotor!.thrust).toBe(0);
    const spooling = fly(aircraft, 2, hover());
    expect(spooling.rotor!.speed).toBeCloseTo(1 - Math.exp(-1), 1);
    expect(spooling.grounded).toBe(true);
  });

  test("forward cyclic tilts the disc: nose down and the helicopter moves off forward", () => {
    const aircraft = spunUp(helicopter, [0, 50, 0]);
    fly(aircraft, 1, hover({ pitch: -0.5 }));
    const step = fly(aircraft, 2, hover());
    expect(step.pitch).toBeLessThan(-0.05);
    expect(step.velocity[2]).toBeGreaterThan(1);
  });

  test("rotor speed is part of the snapshot and replays bit-for-bit", () => {
    const aircraft = createRigidAircraft(helicopter, { position: [0, 1, 0] });
    fly(aircraft, 1.5, hover());
    const saved = aircraft.snapshot();
    expect(saved.rotorSpeed).toBeGreaterThan(0.4);
    const a = fly(aircraft, 2, hover({ collective: 0.8, roll: 0.3 }));
    aircraft.restore(saved);
    const b = fly(aircraft, 2, hover({ collective: 0.8, roll: 0.3 }));
    expect(b.position).toEqual(a.position);
    expect(b.rotor).toEqual(a.rotor);
  });

  test("a body without a rotor block reports no rotor telemetry", () => {
    expect(airborne().tick(DT, input({})).rotor).toBeUndefined();
  });
});

test("a parked aircraft in still air is not stalled", () => {
  const parked = fly(createRigidAircraft(helicopter, { position: [0, 1, 0] }), 1, hover({ throttle: 0, collective: 0 }));
  expect(parked.stalled).toBe(false);
  expect(parked.stallFraction).toBe(0);
});

// A sounding rocket: 50 kg dry, 50 kg of propellant burned at 10 kg/s behind a flat 4 kN thrust curve.
const rocket: RigidAircraftTuning = {
  massKg: 50,
  inertia: { pitch: 67, yaw: 67, roll: 0.5 },
  surfaces: [
    { at: [0.2, 0, -1.8], area: 0.05, liftSlope: 3 },
    { at: [-0.2, 0, -1.8], area: 0.05, liftSlope: 3 },
    { at: [0, 0.2, -1.8], normal: [1, 0, 0], area: 0.05, liftSlope: 3 },
    { at: [0, -0.2, -1.8], normal: [1, 0, 0], area: 0.05, liftSlope: 3 },
  ],
  motor: { thrustCurve: [[0, 4000], [5, 4000]], propellantKg: 50, massFlow: 10, at: [0, 0, -2], gimbal: 0.1 },
  dragArea: 0.02,
};
const vacuum = () => 0;
const upright = aircraftAttitudeQuaternion(0, Math.PI / 2, 0);

function burn(partial: Partial<RigidAircraftInput> = {}): RigidAircraftInput {
  return { throttle: 1, pitch: 0, roll: 0, yaw: 0, ...partial };
}

describe("createRigidAircraft motor", () => {
  test("acceleration rises as the propellant burns off", () => {
    const aircraft = createRigidAircraft(rocket, { position: [0, 1000, 0], orientation: upright, airDensity: vacuum });
    const accel = (seconds: number) => {
      const before = fly(aircraft, seconds, burn()).velocity[1];
      const after = aircraft.tick(DT, burn()).velocity[1];
      return (after - before) / DT;
    };
    const early = accel(0.2);
    const late = accel(4.4);
    expect(early).toBeCloseTo(4000 / 98 - 9.81, 0);
    expect(late).toBeGreaterThan(early * 1.7);
    expect(late).toBeCloseTo(4000 / 54 - 9.81, 0);
  });

  test("propellant leaves at the mass flow and the motor burns out when it is gone", () => {
    const aircraft = createRigidAircraft(rocket, { position: [0, 1000, 0], orientation: upright, airDensity: vacuum });
    const mid = fly(aircraft, 2, burn());
    expect(mid.motor!.propellantKg).toBeCloseTo(30, 0);
    expect(mid.massKg).toBeCloseTo(80, 0);
    expect(mid.motor!.thrust).toBeCloseTo(4000, 5);
    const out = fly(aircraft, 4, burn());
    expect(out.motor!.propellantKg).toBe(0);
    expect(out.motor!.burnedOut).toBe(true);
    expect(out.motor!.thrust).toBe(0);
    expect(out.massKg).toBe(50);
  });

  test("thrust follows the curve over burn time and throttle holds the burn clock", () => {
    const boost = { ...rocket, motor: { ...rocket.motor!, thrustCurve: [[0, 6000], [1, 6000], [1.5, 2000], [8, 2000]] as const } };
    const aircraft = createRigidAircraft(boost, { position: [0, 1000, 0], orientation: upright, airDensity: vacuum });
    expect(fly(aircraft, 0.5, burn()).motor!.thrust).toBeCloseTo(6000, 5);
    expect(fly(aircraft, 1.5, burn()).motor!.thrust).toBeCloseTo(2000, 5);
    const coasting = fly(aircraft, 1, burn({ throttle: 0 }));
    expect(coasting.motor!.thrust).toBe(0);
    expect(coasting.motor!.burnTime).toBeCloseTo(2, 5);
  });

  test("gimbal turns the rocket, and it turns faster once lighter", () => {
    const pitchAccel = (fuel: number) => {
      const aircraft = createRigidAircraft(rocket, { position: [0, 1000, 0], orientation: upright, airDensity: vacuum });
      aircraft.restore({ ...aircraft.snapshot(), propellantKg: fuel });
      fly(aircraft, 0.3, burn({ pitch: 1 }));
      const before = aircraft.tick(DT, burn({ pitch: 1 })).pitchRate;
      return (aircraft.tick(DT, burn({ pitch: 1 })).pitchRate - before) / DT;
    };
    const full = pitchAccel(50);
    const light = pitchAccel(8);
    expect(full).toBeGreaterThan(0);
    expect(light).toBeGreaterThan(full * 1.5);
  });

  test("staging: retune to the next stage drops the mass and lights its motor", () => {
    const upper: RigidAircraftTuning = { ...rocket, massKg: 15, inertia: { pitch: 10, yaw: 10, roll: 0.1 }, motor: { thrustCurve: [[0, 1200], [6, 1200]], propellantKg: 12, massFlow: 2, at: [0, 0, -0.8] } };
    const aircraft = createRigidAircraft(rocket, { position: [0, 1000, 0], orientation: upright, airDensity: vacuum });
    const burnout = fly(aircraft, 5.5, burn());
    expect(burnout.motor!.burnedOut).toBe(true);
    aircraft.retune(upper);
    const staged = aircraft.tick(DT, burn());
    expect(staged.massKg).toBeCloseTo(15 + 12 - 2 * DT, 5);
    expect(staged.motor!.thrust).toBeCloseTo(1200, 5);
    expect(staged.velocity[1]).toBeGreaterThan(burnout.velocity[1]);
    aircraft.retune(upper);
    expect(aircraft.snapshot().burnTime).toBeGreaterThan(0);
  });

  test("burn state is part of the snapshot and replays bit-for-bit", () => {
    const aircraft = createRigidAircraft(rocket, { position: [0, 1000, 0], orientation: upright });
    fly(aircraft, 1, burn());
    const saved = aircraft.snapshot();
    const a = fly(aircraft, 2, burn({ pitch: 0.4, yaw: -0.2 }));
    aircraft.restore(saved);
    const b = fly(aircraft, 2, burn({ pitch: 0.4, yaw: -0.2 }));
    expect(b.position).toEqual(a.position);
    expect(b.motor).toEqual(a.motor);
  });
});

describe("createRigidAircraft assists", () => {
  const strongTail: RigidAircraftTuning = { ...jet, surfaces: jet.surfaces.map((s, i) => (i === 2 ? { ...s, control: { pitch: 1.5 } } : s)) };

  function hoverFor(tuning: RigidAircraftTuning, seconds: number) {
    return fly(spunUp(tuning, [0, 50, 0]), seconds, hover({ yaw: 0 }));
  }

  test("yaw SAS holds a helicopter's heading against rotor torque with no pedal", () => {
    const free = hoverFor(helicopter, 10);
    const held = hoverFor({ ...helicopter, assists: { sas: { yaw: 1 } } }, 10);
    expect(Math.abs(free.heading) * DEG).toBeGreaterThan(60);
    expect(Math.abs(held.heading) * DEG).toBeLessThan(5);
    expect(held.command.yaw).toBeGreaterThan(0.2);
  });

  test("hover hold stops the drift that the tail rotor pushes it into", () => {
    const loose = hoverFor({ ...helicopter, assists: { sas: { yaw: 1 } } }, 10);
    const held = hoverFor({ ...helicopter, assists: { sas: { pitch: 1, roll: 1, yaw: 1 }, hoverHold: 1 } }, 10);
    expect(Math.hypot(loose.velocity[0], loose.velocity[2])).toBeGreaterThan(2);
    expect(Math.hypot(held.velocity[0], held.velocity[2])).toBeLessThan(0.5);
    expect(Math.hypot(held.position[0], held.position[2])).toBeLessThan(8);
  });

  test("auto-level rolls the wings level hands-off", () => {
    const banked = (assists?: RigidAircraftTuning["assists"]) =>
      fly(createRigidAircraft({ ...jet, assists }, { position: [0, 2000, 0], velocity: [0, 0, 180], orientation: aircraftAttitudeQuaternion(0, 0.1, 1) }), 5, input({}));
    expect(Math.abs(banked().bank) * DEG).toBeGreaterThan(30);
    const levelled = banked({ autoLevel: 1 });
    expect(Math.abs(levelled.bank) * DEG).toBeLessThan(2);
    expect(Math.abs(levelled.pitch) * DEG).toBeLessThan(2);
  });

  test("the AoA limiter keeps full back-stick under its limit", () => {
    const pull = (tuning: RigidAircraftTuning) => {
      let peak = 0;
      let limited = false;
      fly(createRigidAircraft(tuning, { position: [0, 2000, 0], velocity: [0, 0, 200] }), 10, input({ throttle: 1, pitch: 1 }), (s) => {
        peak = Math.max(peak, s.angleOfAttack);
        limited ||= s.limited;
      });
      return { peak, limited };
    };
    expect(pull(strongTail).peak).toBeGreaterThan(0.3);
    const capped = pull({ ...strongTail, assists: { maxAngleOfAttack: 0.2 } });
    expect(capped.peak).toBeLessThan(0.2);
    expect(capped.peak).toBeGreaterThan(0.15);
    expect(capped.limited).toBe(true);
  });

  test("the g limiter caps the pull", () => {
    let peak = 0;
    fly(createRigidAircraft({ ...strongTail, assists: { maxG: 4 } }, { position: [0, 2000, 0], velocity: [0, 0, 200] }), 10, input({ throttle: 1, pitch: 1 }), (s) => {
      peak = Math.max(peak, s.gLoad);
    });
    expect(peak).toBeLessThan(4.2);
    expect(peak).toBeGreaterThan(3.5);
  });

  test("full stick is the pilot's: SAS doesn't slow a full-aileron roll", () => {
    const rate = (assists?: RigidAircraftTuning["assists"]) => fly(createRigidAircraft({ ...jet, assists }, { position: [0, 2000, 0], velocity: [0, 0, 180] }), 1.5, input({ roll: 1 })).rollRate;
    expect(rate({ sas: { roll: 1, pitch: 1, yaw: 1 } })).toBeCloseTo(rate(), 1);
  });

  test("a policy callback sees the flight state and has the last word", () => {
    let seen = 0;
    const policy = (context: AircraftAssistContext, command: AircraftAssistCommand): AircraftAssistCommand => {
      seen = context.airspeed;
      return { ...command, pitch: 1 };
    };
    const step = fly(createRigidAircraft({ ...jet, assists: { policy } }, { position: [0, 2000, 0], velocity: [0, 0, 180] }), 1, input({}));
    expect(seen).toBeGreaterThan(150);
    expect(step.command.pitch).toBe(1);
    expect(step.pitchRate).toBeGreaterThan(0.1);
  });

  test("assist state is part of the snapshot and replays bit-for-bit", () => {
    const aircraft = spunUp({ ...helicopter, assists: { sas: { pitch: 1, roll: 1, yaw: 1 }, hoverHold: 1 } }, [0, 50, 0]);
    fly(aircraft, 3, hover({ yaw: 0 }));
    const saved = aircraft.snapshot();
    expect(saved.trimYaw).not.toBe(0);
    const a = fly(aircraft, 3, hover({ yaw: 0 }));
    aircraft.restore(saved);
    const b = fly(aircraft, 3, hover({ yaw: 0 }));
    expect(b.position).toEqual(a.position);
    expect(b.command).toEqual(a.command);
  });
});
