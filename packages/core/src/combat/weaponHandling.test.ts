import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import { createWeaponHandling, measureWeapon, type WeaponHandlingTuning } from "./weaponHandling";

const deg = (value: number) => (value * Math.PI) / 180;

// Two deliberately different weapons from the same fields (test fixtures, not presets).
const rifle: WeaponHandlingTuning = {
  recoil: {
    pattern: [[deg(0.6), 0], [deg(0.7), deg(0.1)], [deg(0.8), deg(-0.15)], [deg(0.7), deg(0.2)], [deg(0.5), deg(-0.2)]],
    cameraShare: 0.3,
    recoverRate: deg(12),
    recoverDelay: 0.08,
    adsScale: 0.7,
  },
  spread: { base: deg(0.4), perShot: deg(0.12), max: deg(2.5), recoverRate: deg(6), recoverDelay: 0.1, ads: 0.35, moving: 1.8, airborne: 3 },
  adsTime: 0.22,
};

const shotgun: WeaponHandlingTuning = {
  recoil: { pitch: deg(6), randomCone: deg(1.5), cameraShare: 0.6, recoverRate: deg(20), recoverDelay: 0.15 },
  spread: { base: deg(4), perShot: deg(1), max: deg(6), recoverRate: deg(8), recoverDelay: 0.2, ads: 0.8, crouching: 0.9 },
  adsTime: 0.3,
};

describe("createWeaponHandling", () => {
  test("each shot climbs by the pattern, splitting kick between aim and camera", () => {
    const weapon = createWeaponHandling(rifle);
    const shot = weapon.fire();
    expect(shot.kickPitch).toBeCloseTo(deg(0.6), 9);
    expect(weapon.frame().aimPitch).toBeCloseTo(deg(0.6) * 0.7, 9);
    expect(weapon.frame().cameraPitch).toBeCloseTo(deg(0.6) * 0.3, 9);
    for (let i = 0; i < 9; i += 1) weapon.fire();
    expect(weapon.snapshot().shotIndex).toBe(10);
    expect(weapon.frame().aimYaw).not.toBe(0);
  });

  test("spread blooms per shot up to its max and settles back to base after the delay", () => {
    const weapon = createWeaponHandling(rifle);
    for (let i = 0; i < 40; i += 1) weapon.fire();
    expect(weapon.frame().spread).toBeCloseTo(deg(2.5), 9);
    weapon.tick(0.05);
    expect(weapon.frame().spread).toBeCloseTo(deg(2.5), 9);
    for (let i = 0; i < 200; i += 1) weapon.tick(1 / 60);
    expect(weapon.frame().spread).toBeCloseTo(deg(0.4), 9);
    expect(weapon.frame().aimPitch).toBe(0);
    expect(weapon.snapshot().shotIndex).toBe(0);
  });

  test("aiming down sights tightens spread and softens kick; stance multipliers widen it", () => {
    const weapon = createWeaponHandling(rifle);
    let frame = weapon.tick(0.11, { ads: true });
    expect(frame.adsProgress).toBeCloseTo(0.5, 2);
    for (let i = 0; i < 30; i += 1) frame = weapon.tick(1 / 60, { ads: true });
    expect(frame.adsProgress).toBe(1);
    expect(frame.spread).toBeCloseTo(deg(0.4) * 0.35, 9);
    expect(weapon.fire().kickPitch).toBeCloseTo(deg(0.6) * 0.7, 9);
    const hip = createWeaponHandling(rifle);
    expect(hip.tick(0, { moving: true, airborne: true }).spread).toBeCloseTo(deg(0.4) * 1.8 * 3, 9);
  });

  test("the random cone is deterministic for a seed and skipped without a random source", () => {
    const a = createWeaponHandling(shotgun, { random: seededRng("spray") });
    const b = createWeaponHandling(shotgun, { random: seededRng("spray") });
    for (let i = 0; i < 5; i += 1) expect(a.fire()).toEqual(b.fire());
    const plain = createWeaponHandling(shotgun);
    expect(plain.fire().kickPitch).toBeCloseTo(deg(6), 9);
  });

  test("snapshot/restore resumes exactly; retune keeps state; reset returns to rest", () => {
    const weapon = createWeaponHandling(rifle);
    for (let i = 0; i < 6; i += 1) {
      weapon.fire({ moving: true });
      weapon.tick(0.05, { ads: i > 2 });
    }
    const saved = JSON.parse(JSON.stringify(weapon.snapshot()));
    const replica = createWeaponHandling(rifle);
    replica.restore(saved);
    weapon.fire();
    replica.fire();
    expect(replica.tick(0.1, { ads: true })).toEqual(weapon.tick(0.1, { ads: true }));
    const before = weapon.snapshot();
    weapon.retune({ ...rifle, adsTime: 0.5 });
    expect(weapon.snapshot()).toEqual(before);
    weapon.reset();
    expect(weapon.snapshot().aimPitch).toBe(0);
    expect(weapon.snapshot().bloom).toBeCloseTo(deg(0.4), 9);
  });
});

describe("measureWeapon", () => {
  test("separates a controllable rifle from a kicking shotgun", () => {
    const rifleReport = measureWeapon(() => createWeaponHandling(rifle), { interval: 0.1, damage: 25, targetHealth: 100 });
    const shotgunReport = measureWeapon(() => createWeaponHandling(shotgun), { interval: 0.9, burst: 5, damage: 80, targetHealth: 100 });
    expect(rifleReport.firstShotSpread).toBeLessThan(shotgunReport.firstShotSpread / 5);
    expect(rifleReport.tenthShotSpread).toBeGreaterThan(rifleReport.firstShotSpread * 3);
    expect(rifleReport.burstClimb).toBeGreaterThan(0);
    expect(rifleReport.resetSeconds).toBeLessThan(1.5);
    expect(rifleReport.adsSeconds).toBeCloseTo(0.22, 1);
    expect(rifleReport.timeToKill).toBeCloseTo(0.3, 9);
    expect(shotgunReport.timeToKill).toBeCloseTo(0.9, 9);
    expect(shotgunReport.adsSeconds).toBeGreaterThan(rifleReport.adsSeconds);
  });

  test("time-to-kill at a range weighs each shot's cone against the target and the game's falloff", () => {
    const rifleFar = measureWeapon(() => createWeaponHandling(rifle), { interval: 0.1, damage: 25, targetHealth: 100, range: 30, stance: { ads: true } });
    const shotgunClose = measureWeapon(() => createWeaponHandling(shotgun), { interval: 0.9, burst: 5, damage: 12, pellets: 10, targetHealth: 100, range: 5 });
    const shotgunFar = measureWeapon(() => createWeaponHandling(shotgun), { interval: 0.9, burst: 5, damage: 12, pellets: 10, targetHealth: 100, range: 30 });
    expect(rifleFar.shotsToKill).toBe(4);
    expect(shotgunClose.shotsToKill).toBe(1);
    expect(shotgunClose.timeToKill).toBe(0);
    expect(shotgunFar.shotsToKill).toBeGreaterThan(10);
    expect(shotgunFar.timeToKill).toBeGreaterThan(rifleFar.timeToKill * 20);
    const falloff = measureWeapon(() => createWeaponHandling(rifle), {
      interval: 0.1,
      damage: 25,
      targetHealth: 100,
      range: 30,
      stance: { ads: true },
      damageAt: (range) => (range > 20 ? 0.5 : 1),
    });
    expect(falloff.shotsToKill).toBe(8);
    expect(falloff.timeToKill).toBeCloseTo(0.7, 9);
  });

  test("reports spread per shot and climb over a magazine, softer when aimed", () => {
    const hip = measureWeapon(() => createWeaponHandling(rifle), { interval: 0.1, burst: 30 });
    const aimed = measureWeapon(() => createWeaponHandling(rifle), { interval: 0.1, burst: 30, stance: { ads: true } });
    expect(hip.spreadByShot).toHaveLength(30);
    expect(hip.spreadByShot[0]).toBe(hip.firstShotSpread);
    expect(hip.spreadByShot[9]).toBe(hip.tenthShotSpread);
    expect(hip.spreadByShot[29]).toBeCloseTo(deg(2.5), 9);
    expect(aimed.spreadByShot[29]).toBeCloseTo(deg(2.5) * 0.35, 9);
    expect(hip.burstClimb).toBeGreaterThan(deg(1));
    expect(aimed.burstClimb).toBeLessThan(hip.burstClimb / 2);
  });
});
