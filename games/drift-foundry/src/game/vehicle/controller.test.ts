import { describe, expect, test } from "bun:test";

import { createVehicleController, type DriveAxis, type VehicleTelemetry } from "./controller";
import { surfaceAt } from "./surface";
import { CORRIDOR_DRIVE_HALF_WIDTH } from "../run/constants";
import { HOP_GRAVITY, STUB_HOP_SPEED, tuningFrom } from "../parts/build";
import { partById } from "../parts/catalog";

const DT = 1 / 60;
const SPAWN = { position: [0, 0, 0] as const, heading: 0 };
/** Straight-line runs start far behind the first barricade (z=110), on open road. */
const OPEN_ROAD = { position: [0, 0, -400] as const, heading: 0 };
const FLAT = (): number => 0;

const BARE = tuningFrom([]);
const LOADED = tuningFrom([partById("plow_blade")!, partById("coil_springs")!, partById("truck_engine")!]);

const NO_INPUT = { jumpPressed: false, plowBracing: false };
const drive = (partial: Partial<DriveAxis>): DriveAxis => ({ throttle: 0, brake: 0, steer: 0, ...partial });

/**
 * The straight-line feel the kart shipped with, as targets: a near-instant launch to its governed top
 * speed, a flat road-load coast, braking through to a soft reverse, and a short snappy hop
 * (`v²/2g` with the kart's own 22 m/s² hop gravity).
 */
describe("createVehicleController — straight-line feel", () => {
  test("launches to its top speed in about a second and holds it there", () => {
    const controller = createVehicleController(OPEN_ROAD);
    let reached = Number.POSITIVE_INFINITY;
    let pose: VehicleTelemetry | null = null;
    for (let i = 1; i <= 240; i += 1) {
      pose = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
      if (reached === Number.POSITIVE_INFINITY && pose.speedKmh >= BARE.topSpeed * 3.6 * 0.95) reached = i * DT;
    }
    expect(reached).toBeLessThan(1.3);
    expect(pose!.speedKmh / 3.6).toBeCloseTo(BARE.topSpeed, 0);
    expect(pose!.heading).toBeCloseTo(0, 6);
  });

  test("lifting off coasts to a stop on road load, and holding the brake backs it up slowly", () => {
    const controller = createVehicleController(OPEN_ROAD);
    for (let i = 0; i < 120; i += 1) controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
    let stoppedAt = Number.POSITIVE_INFINITY;
    for (let i = 1; i <= 300 && stoppedAt === Number.POSITIVE_INFINITY; i += 1) {
      if (controller.tick(DT, drive({}), BARE, NO_INPUT, FLAT).speedKmh < 0.5) stoppedAt = i * DT;
    }
    expect(stoppedAt).toBeGreaterThan(1);
    expect(stoppedAt).toBeLessThan(3);
    const before = controller.tick(DT, drive({}), BARE, NO_INPUT, FLAT).position[2];
    let pose: VehicleTelemetry | null = null;
    for (let i = 0; i < 240; i += 1) pose = controller.tick(DT, drive({ brake: 1 }), BARE, NO_INPUT, FLAT);
    expect(pose!.position[2]).toBeLessThan(before - 1);
    expect(pose!.speedKmh / 3.6).toBeLessThanOrEqual(BARE.topSpeed * 0.35 + 0.05);
  });

  test("a braced plow pulls harder than the same kart unbraced", () => {
    const run = (plowBracing: boolean) => {
      const controller = createVehicleController(OPEN_ROAD);
      let pose: VehicleTelemetry | null = null;
      for (let i = 0; i < 200; i += 1) pose = controller.tick(DT, drive({ throttle: 1 }), LOADED, { jumpPressed: false, plowBracing }, FLAT);
      return pose!;
    };
    expect(run(true).position[2]).toBeGreaterThan(run(false).position[2] + 1);
    expect(run(true).speedKmh).toBeGreaterThan(run(false).speedKmh);
  });

  test("the hop rises v²/2g on hop gravity and lands", () => {
    const controller = createVehicleController(OPEN_ROAD);
    let peak = 0;
    let air = 0;
    for (let i = 0; i < 120; i += 1) {
      const pose = controller.tick(DT, drive({ throttle: 1 }), LOADED, i === 0 ? { jumpPressed: true, plowBracing: false } : NO_INPUT, FLAT);
      peak = Math.max(peak, pose.position[1]);
      if (pose.airborne) air += 1;
    }
    const takeoff = STUB_HOP_SPEED + LOADED.jumpPower;
    expect(peak).toBeCloseTo((takeoff * takeoff) / (2 * HOP_GRAVITY), 1);
    expect(Math.abs(air * DT - (2 * takeoff) / HOP_GRAVITY)).toBeLessThan(3 * DT);
    expect(peak).toBeGreaterThan(0.5);
  });

  test("a held jump cannot ratchet the kart upward", () => {
    const controller = createVehicleController(OPEN_ROAD);
    let peak = 0;
    for (let i = 0; i < 120; i += 1) {
      const pose = controller.tick(DT, drive({ throttle: 1 }), LOADED, { jumpPressed: true, plowBracing: false }, FLAT);
      peak = Math.max(peak, pose.position[1]);
    }
    // v²/2g for the loaded kart's takeoff is ~3.4 m; a ratcheting hop would blow past it.
    expect(peak).toBeLessThan(4.5);
  });
});

describe("createVehicleController — handling model", () => {
  test("the same corner grips less in the gravel gantry than on the concrete flats", () => {
    const run = (startZ: number) => {
      const controller = createVehicleController({ position: [0, 0, startZ], heading: 0 });
      let peakSlip = 0;
      let last: VehicleTelemetry | null = null;
      for (let i = 0; i < 120; i += 1) last = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
      const cornerEntrySurface = last!.surface;
      for (let i = 0; i < 30; i += 1) {
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
    // Less grip means the same lock carves less of the corner before the kart washes wide.
    expect(Math.abs(gantry.pose.heading)).toBeLessThan(Math.abs(flats.pose.heading) * 0.99);
    expect(gantry.peakSlip).toBeGreaterThan(0);
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
    let pose: VehicleTelemetry | null = null;
    for (let i = 0; i < 600; i += 1) pose = controller.tick(DT, drive({ throttle: 1 }), BARE, NO_INPUT, FLAT);
    expect(pose?.position[0]).toBeLessThanOrEqual(CORRIDOR_DRIVE_HALF_WIDTH + 1e-6);
    expect(pose?.position[0]).toBeCloseTo(CORRIDOR_DRIVE_HALF_WIDTH, 3);
  });

  test("a bare chassis is walled in at the first barricade and reports it", () => {
    const controller = createVehicleController(SPAWN);
    let pose: VehicleTelemetry | null = null;
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
    let pose: VehicleTelemetry | null = null;
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
