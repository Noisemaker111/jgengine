import { describe, expect, test } from "bun:test";

import { createFeedbackMixer } from "../vfx/feedbackMixer";
import { createWeaponFeedbackSignals, type WeaponFeedbackSignal } from "./weaponFeedback";
import { createWeaponHandling, type WeaponHandlingTuning } from "./weaponHandling";

const deg = (value: number) => (value * Math.PI) / 180;

const rifle: WeaponHandlingTuning = {
  recoil: { pitch: deg(0.6), cameraShare: 0.3, recoverRate: deg(12), recoverDelay: 0.08 },
  spread: { base: deg(0.4), perShot: deg(0.12), ads: 0.35 },
  adsTime: 0.2,
};

const shotgun: WeaponHandlingTuning = {
  recoil: { pitch: deg(6), cameraShare: 0.6, recoverRate: deg(20), recoverDelay: 0.15 },
  spread: { base: deg(4) },
};

type Target = "trauma" | "rumble" | "gunGain";

function mixer() {
  return createFeedbackMixer<WeaponFeedbackSignal, Target>({
    routes: [
      { signal: "kick", target: "trauma", curve: [[0, 0], [deg(6), 0.6]] },
      { signal: "impact", target: "rumble", curve: [[0, 0], [100, 1]], release: 4 },
      { signal: "ads", target: "gunGain", curve: [[0, 1], [1, 0.7]] },
    ],
    events: [{ id: "hit", signal: "impact", threshold: 1 }],
  });
}

describe("createWeaponFeedbackSignals", () => {
  test("shots and impacts are one-tick pulses; frame signals follow the handling", () => {
    const weapon = createWeaponHandling(rifle);
    const signals = createWeaponFeedbackSignals();
    signals.shot(weapon.fire());
    signals.shot(weapon.fire());
    signals.impact(20);
    signals.impact(35);
    const first = signals.read(weapon.tick(1 / 60, { ads: true }));
    expect(first.shot).toBe(2);
    expect(first.kick).toBeCloseTo(deg(1.2), 9);
    expect(first.impact).toBe(35);
    expect(first.recoil).toBeCloseTo(deg(1.2) * 0.7, 9);
    expect(first.cameraKick).toBeCloseTo(deg(1.2) * 0.3, 9);
    expect(first.ads).toBeCloseTo(1 / 12, 9);
    expect(first.spread).toBeGreaterThan(0);
    const next = signals.read(weapon.tick(1 / 60, { ads: true }));
    expect(next.shot).toBe(0);
    expect(next.kick).toBe(0);
    expect(next.impact).toBe(0);
    expect(next.recoil).toBeGreaterThan(0);
  });

  test("routed through a feedback mixer, a shotgun shakes and a hit rumbles harder than a rifle", () => {
    const run = (tuning: WeaponHandlingTuning, damage: number) => {
      const weapon = createWeaponHandling(tuning);
      const signals = createWeaponFeedbackSignals();
      const mix = mixer();
      signals.shot(weapon.fire());
      signals.impact(damage);
      const hit = { ...mix.update(1 / 60, signals.read(weapon.tick(1 / 60))) };
      const fired = mix.fired("hit");
      const after = { ...mix.update(1 / 60, signals.read(weapon.tick(1 / 60))) };
      return { hit, fired, after };
    };
    const r = run(rifle, 25);
    const s = run(shotgun, 90);
    expect(s.hit.trauma).toBeGreaterThan(r.hit.trauma * 5);
    expect(r.after.trauma).toBe(0);
    expect(s.hit.rumble).toBeGreaterThan(r.hit.rumble * 3);
    expect(s.after.rumble).toBeGreaterThan(0);
    expect(s.after.rumble).toBeLessThan(s.hit.rumble);
    expect(r.fired && s.fired).toBe(true);
  });

  test("snapshot/restore carries pending pulses; reset clears them", () => {
    const signals = createWeaponFeedbackSignals();
    signals.shot({ spread: 0, kickPitch: 0.03, kickYaw: 0.04 });
    signals.impact(10);
    const saved = JSON.parse(JSON.stringify(signals.snapshot()));
    const replica = createWeaponFeedbackSignals();
    replica.restore(saved);
    expect({ ...replica.read() }).toEqual({ ...signals.read() });
    expect(replica.snapshot()).toEqual({ shots: 0, kick: 0, impact: 0 });
    signals.impact(5);
    signals.reset();
    expect(signals.read().impact).toBe(0);
  });
});
