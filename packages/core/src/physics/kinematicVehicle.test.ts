import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";
import {
  createKinematicVehicle,
  type KinematicChassisTuning,
  type KinematicVehicleTuning,
} from "./kinematicVehicle";

const DT = 1 / 60;

const TUNING: KinematicVehicleTuning = {
  engineAccel: 20,
  brakeAccel: 30,
  topSpeed: 30,
  reverseSpeed: 8,
  turnRate: 2,
  turnSpeedRef: 8,
  gripStrength: 8,
  handbrakeGrip: 0.25,
};

function axis(partial: Partial<AxisInput>): AxisInput {
  return { ...NEUTRAL_AXIS, ...partial };
}

describe("createKinematicVehicle — throttle/brake", () => {
  test("throttle accelerates along the heading and caps near topSpeed", () => {
    const vehicle = createKinematicVehicle(TUNING);
    let last = vehicle.tick(DT, axis({ throttle: 1 }));
    for (let i = 0; i < 300; i += 1) last = vehicle.tick(DT, axis({ throttle: 1 }));
    expect(last.forwardSpeed).toBeGreaterThan(0);
    expect(last.forwardSpeed).toBeLessThanOrEqual(TUNING.topSpeed + 1);
    expect(last.forwardSpeed).toBeGreaterThan(TUNING.topSpeed - 1);
  });

  test("brake decelerates a moving car, then reverses up to reverseSpeed", () => {
    const vehicle = createKinematicVehicle(TUNING);
    for (let i = 0; i < 90; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    let last = vehicle.tick(DT, axis({ brake: 1 }));
    for (let i = 0; i < 300; i += 1) last = vehicle.tick(DT, axis({ brake: 1 }));
    expect(last.forwardSpeed).toBeLessThan(0);
    expect(last.forwardSpeed).toBeGreaterThanOrEqual(-TUNING.reverseSpeed - 1);
    expect(last.forwardSpeed).toBeLessThan(-TUNING.reverseSpeed + 1);
  });
});

describe("createKinematicVehicle — steering scaled by speed", () => {
  test("near-zero speed yields effectively no turn", () => {
    const vehicle = createKinematicVehicle(TUNING);
    const before = vehicle.pose().heading;
    const step = vehicle.tick(DT, axis({ steer: 1 }));
    expect(step.heading).toBeCloseTo(before, 5);
  });

  test("turn rate scales up with forward speed, matching steerYaw's math", () => {
    const vehicle = createKinematicVehicle(TUNING);
    for (let i = 0; i < 30; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    const { heading } = vehicle.pose();
    const [vx, vz] = vehicle.velocity();
    const speedProjection = vx * Math.sin(heading) + vz * Math.cos(heading);
    const steerScale = Math.min(1, Math.abs(speedProjection) / TUNING.turnSpeedRef);
    expect(steerScale).toBeGreaterThan(0);

    const step = vehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    const expectedHeading = heading - steerScale * TUNING.turnRate * DT;
    expect(step.heading).toBeCloseTo(expectedHeading, 5);
  });
});

describe("createKinematicVehicle — grip and slip", () => {
  test("hard steering induces lateral slip that bleeds off under grip while driving straight", () => {
    const vehicle = createKinematicVehicle(TUNING);
    for (let i = 0; i < 30; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));

    const turnStep = vehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    expect(turnStep.slip).toBeGreaterThan(0);
    expect(Math.abs(turnStep.lateralSpeed)).toBeGreaterThan(0);

    const firstLateral = Math.abs(turnStep.lateralSpeed);
    let lastLateral = firstLateral;
    for (let i = 0; i < 20; i += 1) lastLateral = Math.abs(vehicle.tick(DT, axis({ throttle: 1 })).lateralSpeed);
    expect(lastLateral).toBeLessThan(firstLateral);
  });

  test("surfaceFriction below 1 lowers grip, retaining more lateral speed than full friction", () => {
    const gripVehicle = createKinematicVehicle(TUNING);
    const slickVehicle = createKinematicVehicle(TUNING, { surfaceFriction: () => 0.3 });
    for (let i = 0; i < 30; i += 1) {
      gripVehicle.tick(DT, axis({ throttle: 1 }));
      slickVehicle.tick(DT, axis({ throttle: 1 }));
    }
    gripVehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    slickVehicle.tick(DT, axis({ throttle: 1, steer: 1 }));

    let gripLateral = 0;
    let slickLateral = 0;
    for (let i = 0; i < 5; i += 1) {
      gripLateral = Math.abs(gripVehicle.tick(DT, axis({ throttle: 1 })).lateralSpeed);
      slickLateral = Math.abs(slickVehicle.tick(DT, axis({ throttle: 1 })).lateralSpeed);
    }
    expect(slickLateral).toBeGreaterThan(gripLateral);
  });
});

describe("createKinematicVehicle — dragAt and rollingResistance", () => {
  test("dragAt damps speed relative to a vehicle with no drag", () => {
    const plain = createKinematicVehicle(TUNING);
    const dragged = createKinematicVehicle(TUNING, { dragAt: () => 3 });
    let plainSpeed = 0;
    let draggedSpeed = 0;
    for (let i = 0; i < 30; i += 1) {
      plainSpeed = plain.tick(DT, axis({ throttle: 1 })).forwardSpeed;
      draggedSpeed = dragged.tick(DT, axis({ throttle: 1 })).forwardSpeed;
    }
    expect(draggedSpeed).toBeLessThan(plainSpeed);
  });

  test("rollingResistance decays coasting forward speed; without it, coasting holds speed", () => {
    const rolling = createKinematicVehicle({ ...TUNING, rollingResistance: 2 });
    for (let i = 0; i < 30; i += 1) rolling.tick(DT, axis({ throttle: 1 }));
    const beforeCoast = rolling.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    let afterCoast = beforeCoast;
    for (let i = 0; i < 30; i += 1) afterCoast = rolling.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    expect(afterCoast).toBeLessThan(beforeCoast);

    const plain = createKinematicVehicle(TUNING);
    for (let i = 0; i < 30; i += 1) plain.tick(DT, axis({ throttle: 1 }));
    const plainBefore = plain.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    const plainAfter = plain.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    expect(plainAfter).toBeCloseTo(plainBefore, 5);
  });
});

describe("createKinematicVehicle — scaleVelocity/velocity/pose/resetTo", () => {
  test("scaleVelocity scales the stored velocity", () => {
    const vehicle = createKinematicVehicle(TUNING);
    vehicle.tick(DT, axis({ throttle: 1 }));
    const [vx, vz] = vehicle.velocity();
    vehicle.scaleVelocity(0.5);
    const [vx2, vz2] = vehicle.velocity();
    expect(vx2).toBeCloseTo(vx * 0.5, 5);
    expect(vz2).toBeCloseTo(vz * 0.5, 5);
  });

  test("pose/resetTo roundtrip position and heading, and resetTo zeroes velocity", () => {
    const vehicle = createKinematicVehicle(TUNING, { position: [1, 2, 3], heading: 0.4 });
    expect(vehicle.pose()).toEqual({ position: [1, 2, 3], heading: 0.4 });

    vehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    vehicle.resetTo([9, 9, 9], 1.2);
    expect(vehicle.pose()).toEqual({ position: [9, 9, 9], heading: 1.2 });
    expect(vehicle.velocity()).toEqual([0, 0]);
  });
});

describe("createKinematicVehicle — per-tick modifiers", () => {
  test("no modifiers matches passing all scales of 1", () => {
    const a = createKinematicVehicle(TUNING);
    const b = createKinematicVehicle(TUNING);
    for (let i = 0; i < 60; i += 1) {
      const ra = a.tick(DT, axis({ throttle: 1, steer: 0.5 }));
      const rb = b.tick(DT, axis({ throttle: 1, steer: 0.5 }), { topSpeedScale: 1, accelScale: 1, turnRateScale: 1 });
      expect(rb.forwardSpeed).toBeCloseTo(ra.forwardSpeed, 10);
      expect(rb.heading).toBeCloseTo(ra.heading, 10);
    }
  });

  test("accelScale and topSpeedScale boost acceleration and raise the cap", () => {
    const base = createKinematicVehicle(TUNING);
    const boosted = createKinematicVehicle(TUNING);
    let rb = boosted.tick(DT, axis({ throttle: 1 }), { accelScale: 2, topSpeedScale: 1.5 });
    let rn = base.tick(DT, axis({ throttle: 1 }));
    expect(rb.forwardSpeed).toBeGreaterThan(rn.forwardSpeed);
    for (let i = 0; i < 400; i += 1) {
      rb = boosted.tick(DT, axis({ throttle: 1 }), { accelScale: 2, topSpeedScale: 1.5 });
      rn = base.tick(DT, axis({ throttle: 1 }));
    }
    expect(rb.forwardSpeed).toBeGreaterThan(TUNING.topSpeed + 1);
    expect(rn.forwardSpeed).toBeLessThanOrEqual(TUNING.topSpeed + 1);
  });

  test("turnRateScale below 1 reduces the yaw change (brace penalty)", () => {
    const full = createKinematicVehicle(TUNING);
    const braced = createKinematicVehicle(TUNING);
    for (let i = 0; i < 30; i += 1) {
      full.tick(DT, axis({ throttle: 1 }));
      braced.tick(DT, axis({ throttle: 1 }));
    }
    const rf = full.tick(DT, axis({ throttle: 1, steer: 1 }));
    const rb = braced.tick(DT, axis({ throttle: 1, steer: 1 }), { turnRateScale: 0.5 });
    expect(Math.abs(rb.heading)).toBeLessThan(Math.abs(rf.heading));
  });
});

describe("createKinematicVehicle — clampMove", () => {
  test("a clamp that blocks the z-axis stops z motion and zeroes z velocity", () => {
    const vehicle = createKinematicVehicle(TUNING, {
      heading: 0,
      clampMove: (from, to) => [to[0], Math.min(to[1], 5)],
    });
    let step = vehicle.tick(DT, axis({ throttle: 1 }));
    for (let i = 0; i < 600; i += 1) step = vehicle.tick(DT, axis({ throttle: 1 }));
    expect(step.position[2]).toBeLessThanOrEqual(5 + 1e-9);
    const [, vz] = vehicle.velocity();
    expect(vz).toBeCloseTo(0, 6);
  });

  test("an identity clamp leaves motion identical to no clamp", () => {
    const plain = createKinematicVehicle(TUNING);
    const clamped = createKinematicVehicle(TUNING, { clampMove: (_from, to) => to });
    for (let i = 0; i < 120; i += 1) {
      const rp = plain.tick(DT, axis({ throttle: 1, steer: 0.6 }));
      const rc = clamped.tick(DT, axis({ throttle: 1, steer: 0.6 }));
      expect(rc.position[0]).toBeCloseTo(rp.position[0], 9);
      expect(rc.position[2]).toBeCloseTo(rp.position[2], 9);
    }
  });
});

describe("createKinematicVehicle advanced dynamics", () => {
  const advanced: KinematicVehicleTuning = {
    ...TUNING,
    powertrain: {
      idleRpm: 900,
      redlineRpm: 7600,
      shiftUpRpm: 6800,
      shiftDownRpm: 2200,
      shiftSeconds: 0.12,
      finalDrive: 3.7,
      wheelRadius: 0.34,
      gears: [3.1, 2.2, 1.55, 1.18, 0.94],
      torqueCurve: { points: [[0, 0.55], [0.45, 1], [0.8, 0.92], [1, 0.62]] },
    },
    steering: { wheelbase: 2.6, maxAngle: 0.55, highSpeedAngle: 0.16, highSpeedAt: 30, response: 9 },
    dynamics: { aerodynamicDrag: 0.0006, downforce: 0.35, tractionControl: 0.7, abs: 0.8, stabilityControl: 0.45 },
  };

  test("gearbox shifts under acceleration and exposes useful telemetry", () => {
    const vehicle = createKinematicVehicle(advanced);
    let step = vehicle.tick(DT, axis({ throttle: 1 }));
    for (let i = 0; i < 420; i += 1) step = vehicle.tick(DT, axis({ throttle: 1 }));
    expect(step.gear).toBeGreaterThan(1);
    expect(step.rpm).toBeGreaterThanOrEqual(advanced.powertrain!.idleRpm);
    expect(step.forwardSpeed).toBeGreaterThan(10);
  });

  test("speed-sensitive steering reduces rack angle at high speed", () => {
    const vehicle = createKinematicVehicle(advanced);
    for (let i = 0; i < 240; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    const fast = vehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    expect(Math.abs(fast.steerAngle)).toBeLessThan(advanced.steering!.maxAngle);
    expect(Math.abs(fast.yawRate)).toBeGreaterThan(0);
  });

  test("ABS reports intervention during a high-speed stop", () => {
    const vehicle = createKinematicVehicle(advanced);
    for (let i = 0; i < 240; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    const braking = vehicle.tick(DT, axis({ brake: 1 }));
    expect(braking.absActive).toBe(true);
    expect(braking.longitudinalAcceleration).toBeLessThan(0);
  });
});

describe("createKinematicVehicle — chassis mass/force layer (#1051)", () => {
  const G = 9.81;
  const chassis = (over: Partial<KinematicChassisTuning> = {}): KinematicChassisTuning => ({
    massKg: 1500,
    engineForce: 9000,
    brakeForce: 9000,
    tireGrip: 1.2,
    comHeight: 0.5,
    trackWidth: 1.8,
    ...over,
  });
  const gearbox = {
    idleRpm: 900,
    redlineRpm: 7000,
    shiftUpRpm: 6300,
    shiftDownRpm: 2200,
    shiftSeconds: 0.12,
    finalDrive: 3.7,
    wheelRadius: 0.34,
    gears: [3.2, 2.1, 1.5, 1.15, 0.9],
    torqueCurve: { points: [[0, 0.6], [0.45, 1], [0.8, 0.92], [1, 0.62]] },
  } as const;
  type Vehicle = ReturnType<typeof createKinematicVehicle>;
  const ticksToReach = (v: Vehicle, target: number): number => {
    for (let i = 1; i <= 4000; i += 1) if (v.tick(DT, axis({ throttle: 1 })).forwardSpeed >= target) return i;
    return Number.POSITIVE_INFINITY;
  };

  test("doubling mass with identical forces slows 0→15 and lengthens 20→0 braking distance", () => {
    const light = createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis() });
    const heavy = createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis({ massKg: 3000 }) });
    expect(ticksToReach(heavy, 15)).toBeGreaterThan(ticksToReach(light, 15));

    const brakingDistance = (v: Vehicle): number => {
      let step = v.tick(DT, axis({ throttle: 1 }));
      while (step.forwardSpeed < 20) step = v.tick(DT, axis({ throttle: 1 }));
      const startZ = step.position[2];
      while (step.forwardSpeed > 0) step = v.tick(DT, axis({ brake: 1 }));
      return step.position[2] - startZ;
    };
    const lightDist = brakingDistance(createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis() }));
    const heavyDist = brakingDistance(createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis({ massKg: 3000 }) }));
    expect(heavyDist).toBeGreaterThan(lightDist);
  });

  test("friction circle caps a low-grip launch near μg with wheelspin; huge grip is unlimited", () => {
    const launch = (tireGrip: number): ReturnType<Vehicle["tick"]> =>
      createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis({ engineForce: 30000, tireGrip }) }).tick(
        DT,
        axis({ throttle: 1 }),
      );
    const low = launch(0.5);
    expect(low.wheelspin).toBe(true);
    expect(low.longitudinalAcceleration).toBeGreaterThan(0.5 * G - 0.6);
    expect(low.longitudinalAcceleration).toBeLessThan(0.5 * G + 0.6);

    const huge = launch(5);
    expect(huge.wheelspin).toBe(false);
    // Demand 30000 N / 1500 kg = 20 m/s² sits well under the 5·g cap, so it lands unclipped.
    expect(huge.longitudinalAcceleration).toBeGreaterThan(20 - 0.6);
  });

  test("cornering consumes the tire budget, so mid-corner drive accel is below straight-line", () => {
    const tune = { ...TUNING, topSpeed: 60, chassis: chassis({ engineForce: 12000, tireGrip: 1 }) };
    const straight = createKinematicVehicle(tune);
    const cornering = createKinematicVehicle(tune);
    for (let i = 0; i < 120; i += 1) {
      straight.tick(DT, axis({ throttle: 1 }));
      cornering.tick(DT, axis({ throttle: 1 }));
    }
    const straightAccel = straight.tick(DT, axis({ throttle: 1 })).longitudinalAcceleration;
    let corner = cornering.tick(DT, axis({ throttle: 1, steer: 1 }));
    for (let i = 0; i < 10; i += 1) corner = cornering.tick(DT, axis({ throttle: 1, steer: 1 }));
    expect(straightAccel).toBeGreaterThan(6);
    expect(corner.longitudinalAcceleration).toBeLessThan(straightAccel);
  });

  test("coasting engine-brakes firmly from weight and gear, but gentler than the service brakes", () => {
    const build = (): ReturnType<typeof createKinematicVehicle> =>
      createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis({ engineForce: 12000 }), powertrain: gearbox });
    const coastCar = build();
    let step = coastCar.tick(DT, axis({ throttle: 1 }));
    while (step.forwardSpeed < 15) step = coastCar.tick(DT, axis({ throttle: 1 }));
    const startSpeed = step.forwardSpeed;

    // Lift-off decel is firm (well past the bare rolling-resistance floor) but not as hard as braking.
    const coast = coastCar.tick(DT, NEUTRAL_AXIS);
    expect(coast.longitudinalAcceleration).toBeLessThan(-1.5);
    expect(coast.longitudinalAcceleration).toBeGreaterThan(-5);

    // Reaches half speed while coasting in bounded time.
    let latest = coast;
    let coastTicks = 1;
    for (let i = 0; i < 800 && latest.forwardSpeed > startSpeed / 2; i += 1) {
      latest = coastCar.tick(DT, NEUTRAL_AXIS);
      coastTicks += 1;
    }
    expect(latest.forwardSpeed).toBeLessThan(startSpeed / 2);

    // The same drop under braking is strictly quicker — lifting off must not equal stamping the brake.
    const brakeCar = build();
    let bstep = brakeCar.tick(DT, axis({ throttle: 1 }));
    while (bstep.forwardSpeed < startSpeed) bstep = brakeCar.tick(DT, axis({ throttle: 1 }));
    let brakeTicks = 0;
    for (let i = 0; i < 800 && bstep.forwardSpeed > startSpeed / 2; i += 1) {
      bstep = brakeCar.tick(DT, axis({ brake: 1 }));
      brakeTicks += 1;
    }
    expect(brakeTicks).toBeLessThan(coastTicks);
  });

  test("chassis coasting without a powertrain still decays on weight-based rolling resistance", () => {
    const car = createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis() });
    for (let i = 0; i < 120; i += 1) car.tick(DT, axis({ throttle: 1 }));
    const before = car.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    let after = before;
    for (let i = 0; i < 120; i += 1) after = car.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    expect(after).toBeLessThan(before);
  });

  test("legacy (no chassis) coasting is unchanged — it holds speed without engine braking", () => {
    const car = createKinematicVehicle(TUNING);
    for (let i = 0; i < 60; i += 1) car.tick(DT, axis({ throttle: 1 }));
    const before = car.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    const after = car.tick(DT, NEUTRAL_AXIS).forwardSpeed;
    expect(after).toBeCloseTo(before, 5);
  });

  test("top-heavy narrow chassis washes out more and rolls harder than a low/wide one", () => {
    const dynamics = { bodyRollFactor: 0.02, maxBodyRoll: 1.5 };
    const drive = axis({ throttle: 1, steer: 1 });
    const topHeavy = createKinematicVehicle({
      ...TUNING,
      topSpeed: 60,
      dynamics,
      chassis: chassis({ tireGrip: 1, comHeight: 1.5, trackWidth: 1.3 }),
    });
    const lowWide = createKinematicVehicle({
      ...TUNING,
      topSpeed: 60,
      dynamics,
      chassis: chassis({ tireGrip: 1, comHeight: 0.4, trackWidth: 2 }),
    });
    for (let i = 0; i < 120; i += 1) {
      topHeavy.tick(DT, axis({ throttle: 1 }));
      lowWide.tick(DT, axis({ throttle: 1 }));
    }
    let th = topHeavy.tick(DT, drive);
    let lw = lowWide.tick(DT, drive);
    for (let i = 0; i < 12; i += 1) {
      th = topHeavy.tick(DT, drive);
      lw = lowWide.tick(DT, drive);
    }
    expect(Math.abs(th.lateralSpeed)).toBeGreaterThan(Math.abs(lw.lateralSpeed));
    expect(Math.abs(th.bodyRoll)).toBeGreaterThan(Math.abs(lw.bodyRoll));
  });

  test("rest snap: a tiny residual velocity with no input collapses to exactly zero", () => {
    const car = createKinematicVehicle({ ...TUNING, chassis: chassis() });
    for (let i = 0; i < 12; i += 1) car.tick(DT, axis({ throttle: 1 }));
    car.scaleVelocity(0.02);
    const [vx, vz] = car.velocity();
    const residual = Math.hypot(vx, vz);
    expect(residual).toBeGreaterThan(0);
    expect(residual).toBeLessThan(0.2);
    car.tick(DT, NEUTRAL_AXIS);
    expect(car.velocity()).toEqual([0, 0]);
  });

  test("without a chassis block wheelspin is always false", () => {
    const car = createKinematicVehicle(TUNING);
    const step = car.tick(DT, axis({ throttle: 1 }));
    expect(step.wheelspin).toBe(false);
  });

  test("reverse drive is softer than full engineForce (no rocket reverse)", () => {
    const car = createKinematicVehicle({ ...TUNING, topSpeed: 60, reverseSpeed: 20, chassis: chassis({ engineForce: 18000 }) });
    let step = car.tick(DT, axis({ brake: 1 }));
    for (let i = 0; i < 120; i += 1) step = car.tick(DT, axis({ brake: 1 }));
    // 2 s of reverse with full force would be ~24 m/s; with the default reverse scale it stays well under reverseSpeed.
    expect(step.forwardSpeed).toBeLessThan(-2);
    expect(step.forwardSpeed).toBeGreaterThan(-12);
  });

  test("handbrake + steer rotates more than steer alone at speed (rear-lock oversteer)", () => {
    const steering = { wheelbase: 2.6, maxAngle: 0.55, highSpeedAngle: 0.18, highSpeedAt: 40, response: 12, yawDamping: 10 };
    const plain = createKinematicVehicle({ ...TUNING, topSpeed: 60, chassis: chassis(), steering });
    const drifting = createKinematicVehicle({
      ...TUNING,
      topSpeed: 60,
      chassis: chassis(),
      handbrakeGrip: 0.25,
      steering,
    });
    for (let i = 0; i < 180; i += 1) {
      plain.tick(DT, axis({ throttle: 1 }));
      drifting.tick(DT, axis({ throttle: 1 }));
    }
    const plainStart = plain.pose().heading;
    const driftStart = drifting.pose().heading;
    let driftSlip = 0;
    for (let i = 0; i < 36; i += 1) {
      plain.tick(DT, axis({ throttle: 0.5, steer: 1 }));
      const d = drifting.tick(DT, axis({ throttle: 0.5, steer: 1, handbrake: 1 }));
      driftSlip = Math.max(driftSlip, Math.abs(d.slip));
    }
    const plainDelta = Math.abs(plain.pose().heading - plainStart);
    const driftDelta = Math.abs(drifting.pose().heading - driftStart);
    expect(driftDelta).toBeGreaterThan(plainDelta * 1.12);
    expect(driftSlip).toBeGreaterThan(0.08);
  });
});
