import { describe, expect, test } from "bun:test";
import { steerYaw } from "@jgengine/core/movement/steering";
import { DEFAULT_GRIP_CURVE, sampleGripCurve } from "@jgengine/core/physics/vehicleBody";

import { createVehicleController, type DriveAxis, type VehiclePose } from "./controller";
import { surfaceAt } from "./surface";
import { blockedZ } from "../route/gates";
import { CORRIDOR_DRIVE_HALF_WIDTH } from "../run/constants";
import { tuningFrom } from "../parts/build";
import { partById } from "../parts/catalog";

/**
 * Feel-parity oracle: the hand-rolled integrator this controller replaced, verbatim. It stays pinned to
 * the straight-line feel that shipped - launch pull, coast drag, reverse, the hop arc. Cornering is
 * deliberately excluded: 0.27 gives the kart a tire compound, weight transfer, per-yard surface grip and
 * a handbrake, so the same corner no longer matches a flat-grip integrator by design. Those behaviours
 * have their own tests below rather than hiding inside a parity comparison.
 */
const METERS_PER_SECOND_TO_KMH = 3.6;
const GRAVITY = 22;
const STUB_HOP_IMPULSE = 3.2;
const BRACE_ACCEL_BONUS = 0.18;
const BRACE_TURN_PENALTY = 0.25;
const GRIP_STRENGTH = 7;
const TURN_SPEED_REF = 6;
const ROLLING_DRAG = 3.5;

type Tuning = ReturnType<typeof tuningFrom>;

function createLegacyController(spawn: { position: readonly [number, number, number]; heading: number }): {
  tick(
    dt: number,
    axis: DriveAxis,
    tuning: Tuning,
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
        slip,
        surface: 1,
        loadGrip: 1,
        airborne: airOffset > 0,
        blockedByGate,
      };
    },
  };
}

const DT = 1 / 60;
const SPAWN = { position: [0, 0, 0] as const, heading: 0 };
/** Straight-line parity runs far behind the first barricade (z=110), on open road. */
const OPEN_ROAD = { position: [0, 0, -400] as const, heading: 0 };
const FLAT = (): number => 0;

const BARE = tuningFrom([]);
const LOADED = tuningFrom([partById("plow_blade")!, partById("coil_springs")!, partById("truck_engine")!]);

const NO_INPUT = { jumpPressed: false, plowBracing: false };
const drive = (partial: Partial<DriveAxis>): DriveAxis => ({ throttle: 0, brake: 0, steer: 0, ...partial });

describe("createVehicleController — straight-line parity with the hand-rolled integrator", () => {
  test("launch, coast, hop and braking-to-reverse still match the integrator that shipped", () => {
    const next = createVehicleController(OPEN_ROAD);
    const legacy = createLegacyController(OPEN_ROAD);
    let sawCoast = false;
    for (let i = 0; i < 380; i += 1) {
      const axis = i < 120 ? drive({ throttle: 1 }) : i < 180 ? drive({}) : i === 180 ? drive({ throttle: 1 }) : drive({ brake: 1 });
      if (i > 160 && i < 180) sawCoast = true;
      const input = i === 180 ? { jumpPressed: true, plowBracing: false } : NO_INPUT;
      const a = next.tick(DT, axis, BARE, input, FLAT);
      const b = legacy.tick(DT, axis, BARE, input, FLAT);
      expect(a.position[0]).toBeCloseTo(b.position[0], 6);
      expect(a.position[1]).toBeCloseTo(b.position[1], 6);
      expect(a.position[2]).toBeCloseTo(b.position[2], 6);
      expect(a.heading).toBeCloseTo(b.heading, 6);
      expect(a.airborne).toBe(b.airborne);
      expect(a.speedKmh).toBeCloseTo(b.speedKmh, 6);
    }
    expect(sawCoast).toBe(true);
  });

  test("a braced plow matches the legacy brace bonus while driving forward", () => {
    const next = createVehicleController(OPEN_ROAD);
    const legacy = createLegacyController(OPEN_ROAD);
    const braced = { jumpPressed: false, plowBracing: true };
    // Forward drive and braking only: the shared sim deliberately leaves reverse unscaled by the brace
    // modifier, so reversing while braced is out of scope for a parity comparison.
    for (let i = 0; i < 300; i += 1) {
      const axis = i < 200 ? drive({ throttle: 1 }) : i < 220 ? drive({ brake: 1 }) : drive({});
      const a = next.tick(DT, axis, LOADED, braced, FLAT);
      const b = legacy.tick(DT, axis, LOADED, braced, FLAT);
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
    // v²/2g for the loaded kart's 12.2 m/s impulse is ~3.4 m; a ratcheting hop would blow past it.
    expect(peak).toBeLessThan(4.5);
  });
});

describe("createVehicleController — handling model", () => {
  test("cornering loads the tires: weight transfer costs grip, a straight does not", () => {
    const controller = createVehicleController(OPEN_ROAD);
    let straightLoadGrip = 0;
    for (let i = 0; i < 120; i += 1) {
      const pose = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
      straightLoadGrip = pose.loadGrip;
    }
    expect(straightLoadGrip).toBeCloseTo(1, 3);
    let cornerLoadGrip = 1;
    for (let i = 0; i < 90; i += 1) {
      const pose = controller.tick(DT, drive({ throttle: 1, steer: 1 }), BARE, NO_INPUT, FLAT);
      cornerLoadGrip = Math.min(cornerLoadGrip, pose.loadGrip);
    }
    expect(cornerLoadGrip).toBeLessThan(0.99);
    expect(cornerLoadGrip).toBeGreaterThan(0.9);
  });

  test("the same corner grips less in the gravel gantry than on the concrete flats", () => {
    const run = (startZ: number) => {
      const controller = createVehicleController({ position: [0, 0, startZ], heading: 0 });
      let peakSlip = 0;
      let last: VehiclePose | null = null;
      for (let i = 0; i < 120; i += 1) last = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
      const cornerEntrySurface = last!.surface;
      for (let i = 0; i < 90; i += 1) {
        last = controller.tick(DT, drive({ throttle: 1, steer: 1 }), BARE, NO_INPUT, FLAT);
        peakSlip = Math.max(peakSlip, last.slip);
      }
      return { peakSlip, cornerEntrySurface, surface: last!.surface, pose: last! };
    };
    // Flats (concrete) at z=170, gantry (gravel) at z=360 - same x, same script, different yard.
    const flats = run(170);
    const gantry = run(360);
    expect(flats.cornerEntrySurface).toBeCloseTo(surfaceAt(0, 170).grip, 6);
    expect(gantry.cornerEntrySurface).toBeCloseTo(surfaceAt(0, 360).grip, 6);
    expect(gantry.cornerEntrySurface).toBeLessThan(flats.cornerEntrySurface);
    // Less grip means the tire breaks away harder on the same steering lock. (The kinematic model
    // commands heading from steer, so grip shows up as slip and sideslip, not a tighter radius.)
    expect(gantry.peakSlip).toBeGreaterThan(flats.peakSlip * 1.05);
  });

  test("the handbrake breaks the rear loose: more yaw and more slip than steering alone", () => {
    const run = (handbrake: number) => {
      const controller = createVehicleController(OPEN_ROAD);
      for (let i = 0; i < 120; i += 1) controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
      const headingBefore = controller.tick(DT, drive({ throttle: 1, steer: 1 }), BARE, NO_INPUT, FLAT).heading;
      let peakSlip = 0;
      let last = headingBefore;
      for (let i = 0; i < 45; i += 1) {
        const pose = controller.tick(DT, drive({ throttle: 1, steer: 1, handbrake }), BARE, NO_INPUT, FLAT);
        peakSlip = Math.max(peakSlip, pose.slip);
        last = pose.heading;
      }
      return { peakSlip, yaw: Math.abs(last - headingBefore) };
    };
    const grip = run(0);
    const pulled = run(1);
    expect(pulled.peakSlip).toBeGreaterThan(grip.peakSlip);
    expect(pulled.yaw).toBeGreaterThan(grip.yaw);
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
    for (let i = 0; i < 1200; i += 1) pose = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
    const speedAtGate = pose?.speedKmh ?? 0;
    expect(pose?.blockedByGate).toBe(true);

    // Retuning to the loaded build must not cost the kart its speed — the whole point of `retune`.
    pose = controller.tick(DT, drive({ throttle: 1 }), LOADED, NO_INPUT, FLAT);
    expect(pose.speedKmh).toBeGreaterThan(speedAtGate * 0.8);
    // Once it has actually stopped against the wall, the plow build can clear it again.
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
