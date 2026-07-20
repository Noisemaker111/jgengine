import { describe, expect, test } from "bun:test";
import { createComboMeter, type ComboTier } from "@jgengine/core/combat/comboMeter";

const TIERS: readonly ComboTier[] = [
  { threshold: 3, id: "good", multiplier: 1.5 },
  { threshold: 6, id: "great", multiplier: 2 },
  { threshold: 10, id: "savage", multiplier: 3 },
];

/** A hand-driven clock so time is deterministic. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1000;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe("combo meter counting", () => {
  test("hit increments the count and tracks peak", () => {
    const clock = fakeClock();
    const meter = createComboMeter({ windowMs: 1000, now: clock.now });
    expect(meter.count()).toBe(0);
    expect(meter.hit()).toBe(1);
    expect(meter.hit()).toBe(2);
    expect(meter.count()).toBe(2);
    expect(meter.peak()).toBe(2);
  });

  test("pre-seeded count sets peak and a live window", () => {
    const clock = fakeClock();
    const meter = createComboMeter({ windowMs: 800, count: 12, now: clock.now });
    expect(meter.count()).toBe(12);
    expect(meter.peak()).toBe(12);
    expect(meter.remainingMs()).toBe(800);
    expect(meter.fraction()).toBeCloseTo(1, 5);
  });
});

describe("free-string tiers and multiplier", () => {
  test("tier() returns null below the first threshold, then the crossed id", () => {
    const meter = createComboMeter({ windowMs: 5000, tiers: TIERS, now: fakeClock().now });
    expect(meter.tier()).toBeNull();
    for (let i = 0; i < 3; i += 1) meter.hit();
    expect(meter.tier()).toBe("good");
    for (let i = 0; i < 3; i += 1) meter.hit();
    expect(meter.tier()).toBe("great");
    for (let i = 0; i < 4; i += 1) meter.hit();
    expect(meter.tier()).toBe("savage");
  });

  test("multiplier derives from the active tier, default 1 below tiers", () => {
    const meter = createComboMeter({ windowMs: 5000, tiers: TIERS, now: fakeClock().now });
    expect(meter.multiplier()).toBe(1);
    for (let i = 0; i < 6; i += 1) meter.hit();
    expect(meter.multiplier()).toBe(2);
  });

  test("multiplierPerTier fallback when a tier has no explicit multiplier", () => {
    const meter = createComboMeter({
      windowMs: 5000,
      tiers: [
        { threshold: 2, id: "a" },
        { threshold: 4, id: "b" },
      ],
      multiplierPerTier: 0.5,
      now: fakeClock().now,
    });
    expect(meter.multiplier()).toBe(1); // below tiers → 1
    meter.hit();
    meter.hit(); // count 2 → tier index 0
    expect(meter.multiplier()).toBeCloseTo(1.5, 5);
    meter.hit();
    meter.hit(); // count 4 → tier index 1
    expect(meter.multiplier()).toBeCloseTo(2, 5);
  });

  test("multiplierCurve fallback receives count and tier index", () => {
    const meter = createComboMeter({
      windowMs: 5000,
      tiers: [{ threshold: 2, id: "a" }],
      multiplierCurve: (count, idx) => count + idx,
      now: fakeClock().now,
    });
    meter.hit(); // count 1, idx -1
    expect(meter.multiplier()).toBe(0);
    meter.hit(); // count 2, idx 0
    expect(meter.multiplier()).toBe(2);
  });

  test("kind is carried through to the view, never interpreted", () => {
    const meter = createComboMeter({ windowMs: 5000, tiers: TIERS, now: fakeClock().now });
    meter.hit("perfect");
    expect(meter.view().kind).toBe("perfect");
    meter.hit("sloppy");
    expect(meter.view().kind).toBe("sloppy");
  });
});

describe("decay window", () => {
  test("hit resets the window", () => {
    const clock = fakeClock();
    const meter = createComboMeter({ windowMs: 1000, now: clock.now });
    meter.hit();
    clock.advance(600);
    expect(meter.remainingMs()).toBe(400);
    meter.hit(); // resets window
    expect(meter.remainingMs()).toBe(1000);
  });

  test("combo drops to 0 when the window elapses (wall clock)", () => {
    const clock = fakeClock();
    const meter = createComboMeter({ windowMs: 1000, tiers: TIERS, now: clock.now });
    for (let i = 0; i < 5; i += 1) meter.hit();
    expect(meter.count()).toBe(5);
    clock.advance(1001);
    expect(meter.count()).toBe(0);
    expect(meter.tier()).toBeNull();
    expect(meter.remainingMs()).toBe(0);
  });

  test("update(dt) drives the window when driven by a game loop", () => {
    const meter = createComboMeter({ windowMs: 1000 });
    meter.hit();
    meter.hit();
    meter.update(0.5);
    expect(meter.remainingMs()).toBe(500);
    expect(meter.count()).toBe(2);
    meter.update(0.6);
    expect(meter.count()).toBe(0);
  });

  test("dropStep bleeds the combo down one step per window instead of clearing", () => {
    const meter = createComboMeter({ windowMs: 1000, dropStep: 2 });
    for (let i = 0; i < 5; i += 1) meter.hit(); // count 5
    meter.update(1.0); // one window → 3
    expect(meter.count()).toBe(3);
    meter.update(1.0); // → 1 (5-2-2=1, still > 0)
    expect(meter.count()).toBe(1);
    meter.update(1.0); // 1-2 <= 0 → clears to 0
    expect(meter.count()).toBe(0);
  });

  test("multiple elapsed windows are processed in one update", () => {
    const meter = createComboMeter({ windowMs: 1000, dropStep: 1 });
    for (let i = 0; i < 4; i += 1) meter.hit();
    meter.update(3.0); // three windows → 4-1-1-1 = 1
    expect(meter.count()).toBe(1);
  });

  test("fraction reflects remaining window 0..1", () => {
    const clock = fakeClock();
    const meter = createComboMeter({ windowMs: 2000, now: clock.now });
    meter.hit();
    expect(meter.fraction()).toBeCloseTo(1, 5);
    clock.advance(1000);
    expect(meter.fraction()).toBeCloseTo(0.5, 5);
    clock.advance(1000);
    expect(meter.fraction()).toBe(0);
  });
});

describe("observability", () => {
  test("subscribe fires on hit, drop, and reset", () => {
    const clock = fakeClock();
    const meter = createComboMeter({ windowMs: 1000, now: clock.now });
    let fired = 0;
    const unsub = meter.subscribe(() => (fired += 1));
    meter.hit();
    expect(fired).toBe(1);
    clock.advance(1001);
    meter.count(); // lazy expiry → notify
    expect(fired).toBe(2);
    meter.reset();
    expect(fired).toBe(3);
    unsub();
    meter.hit();
    expect(fired).toBe(3);
  });

  test("view returns a pooled object reused across calls", () => {
    const meter = createComboMeter({ windowMs: 1000, tiers: TIERS });
    const a = meter.view();
    const b = meter.view();
    expect(a).toBe(b);
  });
});

describe("configure", () => {
  test("patching tiers re-derives the current tier", () => {
    const meter = createComboMeter({ windowMs: 5000, now: fakeClock().now });
    for (let i = 0; i < 4; i += 1) meter.hit();
    expect(meter.tier()).toBeNull();
    meter.configure({ tiers: [{ threshold: 3, id: "combo", multiplier: 2 }] });
    expect(meter.tier()).toBe("combo");
    expect(meter.multiplier()).toBe(2);
  });
});

describe("snapshot / restore round-trip", () => {
  test("preserves count, peak, and remaining window", () => {
    const clock = fakeClock();
    const meter = createComboMeter({ windowMs: 2000, tiers: TIERS, now: clock.now });
    for (let i = 0; i < 7; i += 1) meter.hit();
    clock.advance(800);
    const snap = meter.snapshot();
    expect(snap.count).toBe(7);
    expect(snap.peak).toBe(7);
    expect(snap.remainingMs).toBe(1200);
    expect(snap.tier).toBe("great");

    const clock2 = fakeClock();
    const restored = createComboMeter({ windowMs: 2000, tiers: TIERS, now: clock2.now });
    restored.restore(snap);
    expect(restored.count()).toBe(7);
    expect(restored.peak()).toBe(7);
    expect(restored.tier()).toBe("great");
    expect(restored.remainingMs()).toBe(1200);
    // window still drives after restore
    clock2.advance(1200);
    expect(restored.count()).toBe(0);
  });
});
