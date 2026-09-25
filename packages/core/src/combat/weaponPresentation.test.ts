import { describe, expect, test } from "bun:test";

import { createWeaponHandling, type WeaponHandlingFrame } from "./weaponHandling";
import {
  createWeaponPresentation,
  DEFAULT_VIEWMODEL_ADS,
  DEFAULT_VIEWMODEL_HIP,
  viewmodelFovScale,
  type WeaponPresentationInput,
} from "./weaponPresentation";

const rest: WeaponHandlingFrame = { aimPitch: 0, aimYaw: 0, cameraPitch: 0, cameraYaw: 0, spread: 0, adsProgress: 0 };
const still = (handling: WeaponHandlingFrame = rest): WeaponPresentationInput => ({
  lookYawRate: 0,
  lookPitchRate: 0,
  speed: 0,
  bobPhase: 0,
  handling,
});

describe("createWeaponPresentation", () => {
  test("sits at the hip by default and blends to the ADS pose and viewmodel FOV with adsProgress", () => {
    const view = createWeaponPresentation({ viewmodelFov: { hip: 70, ads: 50 }, adsZoom: 0.8 });
    const hip = view.update(1 / 60, still());
    expect(hip.offset).toEqual([...DEFAULT_VIEWMODEL_HIP]);
    expect(hip.viewmodelFov).toBe(70);
    expect(hip.fovScale).toBe(1);
    const half = view.update(1 / 60, still({ ...rest, adsProgress: 0.5 }));
    expect(half.offset[0]).toBeCloseTo((DEFAULT_VIEWMODEL_HIP[0] + DEFAULT_VIEWMODEL_ADS[0]) / 2, 9);
    expect(half.viewmodelFov).toBeCloseTo(60, 9);
    const aimed = view.update(1 / 60, still({ ...rest, adsProgress: 1 }));
    expect(aimed.offset).toEqual([...DEFAULT_VIEWMODEL_ADS]);
    expect(aimed.fovScale).toBeCloseTo(0.8, 9);
    expect(createWeaponPresentation().update(0, still()).viewmodelFov).toBeNull();
  });

  test("sway lags opposite the look, eases in, clamps, and shrinks while aimed", () => {
    const view = createWeaponPresentation({ sway: { perRadPerSec: 0.02, max: 0.05, response: 10 } });
    const turning = { ...still(), lookYawRate: 1 };
    const first = view.update(1 / 60, turning).yaw;
    expect(first).toBeLessThan(0);
    expect(first).toBeGreaterThan(-0.02);
    for (let i = 0; i < 120; i += 1) view.update(1 / 60, turning);
    expect(view.pose().yaw).toBeCloseTo(-0.02, 6);
    for (let i = 0; i < 120; i += 1) view.update(1 / 60, { ...still(), lookYawRate: 10 });
    expect(view.pose().yaw).toBeCloseTo(-0.05, 6);
    for (let i = 0; i < 120; i += 1) view.update(1 / 60, { ...still({ ...rest, adsProgress: 1 }), lookYawRate: 10 });
    expect(view.pose().yaw).toBeCloseTo(-0.05 * 0.3, 6);
    for (let i = 0; i < 240; i += 1) view.update(1 / 60, still());
    expect(Math.abs(view.pose().yaw)).toBeLessThan(1e-6);
  });

  test("bob follows the movement probe's phase and speed", () => {
    const view = createWeaponPresentation({ bob: { amplitude: [0.02, 0.01], fullSpeed: 4 } });
    const standing = view.update(0, { ...still(), bobPhase: 0.25 }).offset[0];
    expect(standing).toBeCloseTo(DEFAULT_VIEWMODEL_HIP[0], 9);
    const walking = view.update(0, { ...still(), speed: 2, bobPhase: 0.25 });
    expect(walking.offset[0]).toBeCloseTo(DEFAULT_VIEWMODEL_HIP[0] + 0.01, 9);
    expect(walking.offset[1]).toBeCloseTo(DEFAULT_VIEWMODEL_HIP[1] - 0.005, 9);
    const running = view.update(0, { ...still(), speed: 9, bobPhase: 0.25 });
    expect(running.offset[0]).toBeCloseTo(DEFAULT_VIEWMODEL_HIP[0] + 0.02, 9);
  });

  test("the same handling frame drives viewmodel kick, camera look and third-person aim", () => {
    const handling = createWeaponHandling({
      recoil: { pitch: 0.02, cameraShare: 0.25, recoverRate: 0.5 },
      spread: { base: 0.01 },
    });
    handling.fire();
    const frame = handling.tick(0);
    const view = createWeaponPresentation({ kick: { back: 1, rise: 2 } });
    const pose = view.update(0, still(frame));
    expect(pose.aimPitch).toBeCloseTo(0.015, 9);
    expect(pose.lookPitch).toBeCloseTo(0.02, 9);
    expect(pose.offset[2]).toBeCloseTo(DEFAULT_VIEWMODEL_HIP[2] + 0.02, 9);
    expect(pose.pitch).toBeCloseTo(0.04, 9);
  });

  test("snapshot/restore resumes sway exactly; reset and retune", () => {
    const view = createWeaponPresentation();
    for (let i = 0; i < 5; i += 1) view.update(1 / 60, { ...still(), lookYawRate: 2, lookPitchRate: -1 });
    const saved = JSON.parse(JSON.stringify(view.snapshot()));
    const replica = createWeaponPresentation();
    replica.restore(saved);
    const input = { ...still(), lookYawRate: 1 };
    expect({ ...replica.update(1 / 60, input) }).toEqual({ ...view.update(1 / 60, input) });
    view.retune({ hip: [0.2, -0.2, -0.5] });
    expect(view.update(0, still()).offset[0]).toBeCloseTo(0.2, 9);
    view.reset();
    expect(view.snapshot()).toEqual({ swayPitch: 0, swayYaw: 0 });
  });
});

describe("viewmodelFovScale", () => {
  test("is 1 at equal FOVs and shrinks a viewmodel drawn at a wider FOV", () => {
    expect(viewmodelFovScale(70, 70)).toBeCloseTo(1, 9);
    expect(viewmodelFovScale(70, 90)).toBeLessThan(1);
    expect(viewmodelFovScale(90, 60)).toBeCloseTo(Math.tan(Math.PI / 4) / Math.tan(Math.PI / 6), 9);
  });
});
