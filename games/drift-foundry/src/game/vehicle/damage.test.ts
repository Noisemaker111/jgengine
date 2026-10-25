import { describe, expect, test } from "bun:test";
import { damagedAxis } from "@jgengine/core/physics/vehicleDamage";

import { createKartDamage, impactImpulse, KART_DAMAGE_ZONES, noseHitPoint } from "./damage";
import { tuningFrom } from "../parts/build";

const CLEAN = tuningFrom([]);

describe("drift-foundry crash damage", () => {
  test("a crawl into a barricade dents nothing past its first threshold", () => {
    const scuff = createKartDamage();
    expect(scuff.hit(noseHitPoint(0), impactImpulse(4))).toEqual([]);
    // Impulse still accumulates below the threshold, but no stage is crossed and handling is untouched.
    expect(scuff.zones().every((zone) => zone.stage === 0)).toBe(true);
    expect(scuff.effect().topSpeedScale).toBe(1);

    const hit = createKartDamage();
    const transitions = hit.hit(noseHitPoint(0), impactImpulse(25));
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.stage).toBe(1);
    expect(hit.zones().some((zone) => zone.stage > 0)).toBe(true);
  });

  test("the nose you steered into is the nose that bends, and the frame pulls that way", () => {
    // Steer right (+x) puts the right nose corner into the barricade.
    const right = createKartDamage();
    right.hit(noseHitPoint(1), impactImpulse(50));
    const left = createKartDamage();
    left.hit(noseHitPoint(-1), impactImpulse(50));
    expect(right.stageOf("nose_right")).toBeGreaterThan(0);
    expect(right.stageOf("nose_left")).toBe(0);
    expect(left.stageOf("nose_left")).toBeGreaterThan(0);
    expect(left.stageOf("nose_right")).toBe(0);
    expect(right.effect().steerPull).toBeGreaterThan(0);
    expect(left.effect().steerPull).toBeLessThan(0);
  });

  test("damage baked into the tuning costs top speed and leaves braking proportional to the engine", () => {
    const damage = createKartDamage();
    damage.hit(noseHitPoint(0), impactImpulse(40));
    const bent = tuningFrom([], damage.effect());
    expect(bent.topSpeed).toBeLessThan(CLEAN.topSpeed);
    expect(bent.handling.brakeAccel).toBeCloseTo(bent.engineAccel * 1.3, 5);
    // The clean base tuning is never mutated, so a repair is the same call with no damage.
    expect(CLEAN.topSpeed).toBeCloseTo(tuningFrom([]).topSpeed, 6);
  });

  test("a bent frame biases the steering axis without escaping the input range", () => {
    const damage = createKartDamage();
    damage.hit(noseHitPoint(-1), impactImpulse(50));
    const effect = damage.effect();
    const biased = damagedAxis({ throttle: 1, brake: 0, steer: 0, handbrake: 0 }, effect);
    expect(biased.steer).toBeLessThan(0);
    const pinned = damagedAxis({ throttle: 1, brake: 0, steer: 1, handbrake: 0 }, effect);
    expect(pinned.steer).toBeLessThanOrEqual(1);
  });

  test("zones are authored frontal corners with a bounded two-stage ladder", () => {
    expect(KART_DAMAGE_ZONES.length).toBeGreaterThanOrEqual(2);
    for (const zone of KART_DAMAGE_ZONES) {
      expect(zone.at[2]).toBeGreaterThan(0);
      expect(zone.thresholds.length).toBe(2);
      expect(zone.thresholds[0]!).toBeLessThan(zone.thresholds[1]!);
      expect(zone.effect?.topSpeedScale).toBeLessThan(1);
    }
  });

  test("impact impulse scales with approach speed and never goes negative", () => {
    expect(impactImpulse(0)).toBe(0);
    expect(impactImpulse(30)).toBeGreaterThan(impactImpulse(10));
    expect(impactImpulse(-12)).toBe(0);
  });
});
