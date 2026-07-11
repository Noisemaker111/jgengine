import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";
import { createKinematicVehicle, type KinematicVehicleTuning } from "./kinematicVehicle";

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
