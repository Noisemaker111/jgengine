import { describe, expect, test } from "bun:test";
import { steerYaw } from "@jgengine/core/movement/steering";
import { DEFAULT_GRIP_CURVE, sampleGripCurve } from "@jgengine/core/physics/vehicleBody";

import { createVehicleController, type DriveAxis, type VehiclePose } from "./controller";
import { blockedZ } from "../route/gates";
import { CORRIDOR_DRIVE_HALF_WIDTH } from "../run/constants";
import type { KartTuning } from "../parts/build";

/**
 * Feel-parity oracle: the hand-rolled integrator this controller replaced, verbatim, so the
 * migration onto `@jgengine/core/physics/kinematicVehicle` is held to the driving feel that
 * shipped rather than to "the tests still pass". Two divergences are known, intentional and
 * asserted separately below; everything else must match to floating-point tolerance.
 */
const METERS_PER_SECOND_TO_KMH = 3.6;
const GRAVITY = 22;
const STUB_HOP_IMPULSE = 3.2;
const BRACE_ACCEL_BONUS = 0.18;
const BRACE_TURN_PENALTY = 0.25;
const GRIP_STRENGTH = 7;
const TURN_SPEED_REF = 6;
const ROLLING_DRAG = 3.5;

function createLegacyController(spawn: { position: readonly [number, number, number]; heading: number }): {
  tick(
    dt: number,
    axis: DriveAxis,
    tuning: KartTuning,
    input: { jumpPressed: boolean; plowBracing: boolean },
    groundHeightAt: (x: number, z: number) => number,
  ): VehiclePose;
} {
  let x = spawn.position[0];
  let z = spawn.position[2];
  let heading = spawn.heading;
  let vx = 0;
  let vz = 0;
  let airOffset = 0;
  let verticalVelocity = 0;
  const forward = (): [number, number] => [Math.sin(heading), Math.cos(heading)];

  return {
    tick(dt, axis, tuning, input, groundHeightAt) {
      const brace = input.plowBracing && tuning.hasPlow;
      const accel = brace ? tuning.engineAccel * (1 + BRACE_ACCEL_BONUS) : tuning.engineAccel;
      const topSpeed = brace ? tuning.topSpeed * (1 + BRACE_ACCEL_BONUS) : tuning.topSpeed;
      const turnRate = brace ? tuning.turnRate * (1 - BRACE_TURN_PENALTY) : tuning.turnRate;

      const [fx0, fz0] = forward();
      const speed0 = vx * fx0 + vz * fz0;
      const steerScale = Math.min(1, Math.abs(speed0) / TURN_SPEED_REF);
      const dir = speed0 >= 0 ? 1 : -1;
      heading = steerYaw(heading, axis.steer * steerScale * dir, turnRate, dt);

      const [fx, fz] = forward();
      let drive = 0;
      if (axis.throttle > 0 && speed0 < topSpeed) drive += axis.throttle * accel;
      if (axis.brake > 0) {
        if (speed0 > 0.2) drive -= axis.brake * accel * 1.3;
        else if (speed0 > -topSpeed * 0.35) drive -= axis.brake * accel * 0.6;
      } else if (axis.throttle <= 0 && Math.abs(speed0) > 0.05) {
        drive -= Math.sign(speed0) * Math.min(Math.abs(speed0) / dt, ROLLING_DRAG);
      }
      vx += fx * drive * dt;
      vz += fz * drive * dt;

      const forwardSpeed = vx * fx + vz * fz;
      const lateralSpeed = -vx * fz + vz * fx;
      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const grip = sampleGripCurve(DEFAULT_GRIP_CURVE, slip);
      const keep = Math.max(0, 1 - grip * GRIP_STRENGTH * dt);
      const newLateral = lateralSpeed * keep;
      vx = fx * forwardSpeed - fz * newLateral;
      vz = fz * forwardSpeed + fx * newLateral;

      const candidateX = Math.max(-CORRIDOR_DRIVE_HALF_WIDTH, Math.min(CORRIDOR_DRIVE_HALF_WIDTH, x + vx * dt));
      if (candidateX !== x + vx * dt) vx = 0;
      const candidateZ = z + vz * dt;
      const allowedZ = blockedZ(candidateX, z, candidateZ, tuning);
      const blockedByGate = allowedZ < candidateZ - 1e-6;
      if (blockedByGate) vz = 0;
      x = candidateX;
      z = Math.min(candidateZ, allowedZ);

      if (input.jumpPressed && airOffset <= 0.01) verticalVelocity = STUB_HOP_IMPULSE + tuning.jumpPower;
      if (airOffset > 0 || verticalVelocity > 0) {
        verticalVelocity -= GRAVITY * dt;
        airOffset += verticalVelocity * dt;
        if (airOffset <= 0) {
          airOffset = 0;
          verticalVelocity = 0;
        }
      }

      const groundY = groundHeightAt(x, z);
      return {
        position: [x, groundY + airOffset, z],
        heading,
        speedKmh: Math.abs(forwardSpeed) * METERS_PER_SECOND_TO_KMH,
        airborne: airOffset > 0,
        blockedByGate,
      };
    },
  };
}

const DT = 1 / 60;
const SPAWN = { position: [0, 0, 0] as const, heading: 0 };
/**
 * Parity runs start far behind the first barricade (z=110) so the scripts below exercise pure
 * driving. Gate and wall contact are the one place the two implementations intentionally differ —
 * see the "reports true speed at a barricade" test — so they get their own coverage rather than
 * contaminating the feel comparison.
 */
const OPEN_ROAD = { position: [0, 0, -400] as const, heading: 0 };
const FLAT = (): number => 0;

const BARE: KartTuning = { topSpeed: 22, engineAccel: 14, turnRate: 2.1, jumpPower: 0, hasPlow: false, armorCharges: 0 };
const LOADED: KartTuning = { ...BARE, topSpeed: 30, engineAccel: 19, jumpPower: 2.4, hasPlow: true };

const NO_INPUT = { jumpPressed: false, plowBracing: false };
const drive = (partial: Partial<DriveAxis>): DriveAxis => ({ throttle: 0, brake: 0, steer: 0, ...partial });

/**
 * A varied script that stays off the corridor wall: launch, a weave that exercises grip and slip in
 * both directions, coast, a hop, then braking through to reverse. Wall contact is deliberately
 * excluded — it is the one place the two implementations differ, and it has its own test below.
 */
function script(i: number): { axis: DriveAxis; input: { jumpPressed: boolean; plowBracing: boolean } } {
  if (i < 90) return { axis: drive({ throttle: 1 }), input: NO_INPUT };
  if (i < 210) return { axis: drive({ throttle: 1, steer: i % 40 < 20 ? 1 : -1 }), input: NO_INPUT };
  if (i < 240) return { axis: drive({}), input: NO_INPUT };
  if (i === 240) return { axis: drive({ throttle: 1 }), input: { jumpPressed: true, plowBracing: false } };
  if (i < 300) return { axis: drive({ throttle: 1 }), input: NO_INPUT };
  return { axis: drive({ brake: 1 }), input: NO_INPUT };
}

describe("createVehicleController — parity with the hand-rolled integrator", () => {
  test("tracks the legacy sim across launch, cornering, coast, hop and braking", () => {
    const next = createVehicleController(OPEN_ROAD);
    const legacy = createLegacyController(OPEN_ROAD);
    for (let i = 0; i < 380; i += 1) {
      const { axis, input } = script(i);
      const a = next.tick(DT, axis, BARE, input, FLAT);
      const b = legacy.tick(DT, axis, BARE, input, FLAT);
      expect(a.position[0]).toBeCloseTo(b.position[0], 6);
      expect(a.position[1]).toBeCloseTo(b.position[1], 6);
      expect(a.position[2]).toBeCloseTo(b.position[2], 6);
      expect(a.heading).toBeCloseTo(b.heading, 6);
      expect(a.airborne).toBe(b.airborne);
      expect(a.speedKmh).toBeCloseTo(b.speedKmh, 6);
      // The script must never reach the wall, or the comparison silently stops meaning anything.
      expect(Math.abs(a.position[0])).toBeLessThan(CORRIDOR_DRIVE_HALF_WIDTH - 0.5);
    }
  });

  test("wall contact: same stopping place, and no stored velocity ground into the barrier", () => {
    // The one intentional divergence. The legacy sim zeroed the whole X velocity the moment the
    // clamp triggered; the shared sim rederives velocity from the displacement actually permitted,
    // so a kart scraping the wall keeps sliding along it instead of dumping the axis. Placement and
    // feel stay equivalent — this test pins that, and pins that neither creeps through the barrier.
    for (const heading of [Math.PI / 4, Math.PI / 2]) {
      const next = createVehicleController({ position: [0, 0, -400], heading });
      const legacy = createLegacyController({ position: [0, 0, -400], heading });
      let a: VehiclePose | null = null;
      let b: VehiclePose | null = null;
      for (let i = 0; i < 400; i += 1) {
        a = next.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
        b = legacy.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
      }
      // Neither passes the wall, and both come to rest against the same edge.
      expect(a?.position[0]).toBeLessThanOrEqual(CORRIDOR_DRIVE_HALF_WIDTH + 1e-9);
      expect(a?.position[0]).toBeCloseTo(CORRIDOR_DRIVE_HALF_WIDTH, 6);
      expect(a?.position[0]).toBeCloseTo(b?.position[0] ?? 0, 6);
      // Travel along the wall stays equivalent — under a metre apart after 400 ticks of scraping.
      expect(Math.abs((a?.position[2] ?? 0) - (b?.position[2] ?? 0))).toBeLessThan(1);
      expect(Math.abs((a?.speedKmh ?? 0) - (b?.speedKmh ?? 0))).toBeLessThan(1);
    }
  });

  test("a braced plow matches the legacy brace bonus while driving forward", () => {
    const next = createVehicleController(OPEN_ROAD);
    const legacy = createLegacyController(OPEN_ROAD);
    const braced = { jumpPressed: false, plowBracing: true };
    for (let i = 0; i < 300; i += 1) {
      const axis = i < 200 ? drive({ throttle: 1, steer: i % 40 < 20 ? 1 : -1 }) : drive({ brake: 1, throttle: 0 });
      const a = next.tick(DT, axis, LOADED, braced, FLAT);
      const b = legacy.tick(DT, axis, LOADED, braced, FLAT);
      expect(a.position[0]).toBeCloseTo(b.position[0], 6);
      expect(a.position[2]).toBeCloseTo(b.position[2], 6);
      expect(a.heading).toBeCloseTo(b.heading, 6);
      expect(a.speedKmh).toBeCloseTo(b.speedKmh, 6);
    }
  });

  test("hop height and airtime match the legacy jump exactly", () => {
    const next = createVehicleController(OPEN_ROAD);
    const legacy = createLegacyController(OPEN_ROAD);
    const jump = { jumpPressed: true, plowBracing: false };
    let nextPeak = 0;
    let legacyPeak = 0;
    let nextAir = 0;
    let legacyAir = 0;
    for (let i = 0; i < 120; i += 1) {
      const input = i === 0 ? jump : NO_INPUT;
      const a = next.tick(DT, drive({ throttle: 1 }), LOADED, input, FLAT);
      const b = legacy.tick(DT, drive({ throttle: 1 }), LOADED, input, FLAT);
      nextPeak = Math.max(nextPeak, a.position[1]);
      legacyPeak = Math.max(legacyPeak, b.position[1]);
      if (a.airborne) nextAir += 1;
      if (b.airborne) legacyAir += 1;
    }
    expect(nextPeak).toBeCloseTo(legacyPeak, 6);
    expect(nextAir).toBe(legacyAir);
    expect(legacyPeak).toBeGreaterThan(0.5);
  });

  test("a held jump cannot ratchet the kart upward", () => {
    const controller = createVehicleController(OPEN_ROAD);
    let peak = 0;
    for (let i = 0; i < 120; i += 1) {
      const pose = controller.tick(DT, drive({ throttle: 1 }), LOADED, { jumpPressed: true, plowBracing: false }, FLAT);
      peak = Math.max(peak, pose.position[1]);
    }
    // v²/2g for the loaded kart's 5.6 m/s impulse is ~0.71 m; a ratcheting hop would blow past it.
    expect(peak).toBeLessThan(1.2);
  });
});

describe("createVehicleController — corridor and gates", () => {
  test("the corridor wall stops lateral travel at the drivable half-width", () => {
    const controller = createVehicleController({ position: [0, 0, 0], heading: Math.PI / 2 });
    let pose: VehiclePose | null = null;
    for (let i = 0; i < 600; i += 1) pose = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
    expect(pose?.position[0]).toBeLessThanOrEqual(CORRIDOR_DRIVE_HALF_WIDTH + 1e-6);
    expect(pose?.position[0]).toBeCloseTo(CORRIDOR_DRIVE_HALF_WIDTH, 3);
  });

  test("a bare chassis is walled in at the first barricade and reports it", () => {
    const controller = createVehicleController(SPAWN);
    let pose: VehiclePose | null = null;
    let sawBlocked = false;
    for (let i = 0; i < 1200; i += 1) {
      pose = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
      if (pose.blockedByGate) sawBlocked = true;
    }
    expect(sawBlocked).toBe(true);
    // The first plow barricade sits at z=110; a bare kart must not get past it.
    expect(pose?.position[2]).toBeLessThanOrEqual(110 + 1e-6);
  });

  test("a kart that gains parts mid-run keeps its momentum and clears the barricade", () => {
    const controller = createVehicleController(SPAWN);
    let pose: VehiclePose | null = null;
    for (let i = 0; i < 600; i += 1) pose = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
    const speedAtGate = pose?.speedKmh ?? 0;
    expect(pose?.blockedByGate).toBe(true);

    // Retuning to the loaded build must not cost the kart its speed — the whole point of `retune`.
    pose = controller.tick(DT, drive({ throttle: 1 }), LOADED, NO_INPUT, FLAT);
    expect(pose.speedKmh).toBeGreaterThan(speedAtGate * 0.9);
    for (let i = 0; i < 240; i += 1) pose = controller.tick(DT, drive({ throttle: 1 }), LOADED, NO_INPUT, FLAT);
    expect(pose.position[2]).toBeGreaterThan(110);
  });

  test("resetTo returns the kart to a standstill at the given pose", () => {
    const controller = createVehicleController(SPAWN);
    for (let i = 0; i < 120; i += 1) controller.tick(DT, drive({ throttle: 1, steer: 1 }), BARE, NO_INPUT, FLAT);
    controller.resetTo([4, 0, 40], 1.2);
    const pose = controller.tick(DT, drive({}), BARE, NO_INPUT, FLAT);
    expect(pose.position[0]).toBeCloseTo(4, 6);
    expect(pose.position[2]).toBeCloseTo(40, 6);
    expect(pose.heading).toBeCloseTo(1.2, 6);
    expect(pose.speedKmh).toBeCloseTo(0, 6);
    expect(pose.airborne).toBe(false);
  });
});
