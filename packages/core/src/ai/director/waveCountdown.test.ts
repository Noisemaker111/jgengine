import { describe, expect, test } from "bun:test";

import { createWaveCountdown } from "./waveCountdown";

describe("wave countdown", () => {
  test("an armed clock runs down and reports the tick it runs out, once", () => {
    const clock = createWaveCountdown({ intermission: 10 });
    expect(clock.tick(5)).toBe(false);
    clock.arm(2);
    expect(clock.tick(4)).toBe(false);
    expect(clock.view()).toMatchObject({ armed: true, nextWave: 2, remaining: 6, total: 10 });
    expect(clock.view().elapsed).toBeCloseTo(0.4);
    expect(clock.tick(6)).toBe(true);
    expect(clock.tick(1)).toBe(false);
    expect(clock.view().armed).toBe(false);
  });

  test("calling early pays per second skipped, capped, and disarms", () => {
    const clock = createWaveCountdown({ intermission: 30, earlyBonus: { perSecond: 1.5, max: 30 } });
    clock.arm(3);
    expect(clock.bonusNow()).toBe(30);
    clock.tick(20);
    expect(clock.bonusNow()).toBe(15);
    expect(clock.callEarly()).toEqual({ wave: 3, secondsSkipped: 10, bonus: 15 });
    expect(clock.callEarly()).toBeNull();
    expect(clock.bonusNow()).toBe(0);
  });

  test("intermission can depend on the wave, and no bonus is declared means a free call pays nothing", () => {
    const clock = createWaveCountdown({ intermission: (wave) => 20 + wave });
    clock.arm(5);
    expect(clock.view().total).toBe(25);
    expect(clock.callEarly()?.bonus).toBe(0);
  });

  test("snapshot and restore carry a running clock; retune keeps its remaining seconds", () => {
    const clock = createWaveCountdown({ intermission: 12, earlyBonus: { perSecond: 1 } });
    clock.arm(4);
    clock.tick(2);
    const copy = createWaveCountdown({ intermission: 12, earlyBonus: { perSecond: 1 } });
    copy.restore(clock.snapshot());
    expect(copy.view()).toMatchObject({ armed: true, nextWave: 4, remaining: 10 });
    copy.retune({ intermission: 5, earlyBonus: { perSecond: 2 } });
    expect(copy.bonusNow()).toBe(20);
    copy.disarm();
    expect(copy.tick(100)).toBe(false);
  });

  test("bad numbers never run the clock backwards", () => {
    const clock = createWaveCountdown({ intermission: Number.NaN });
    clock.arm(1);
    expect(clock.view().total).toBe(0);
    expect(clock.tick(-5)).toBe(true);
  });
});
