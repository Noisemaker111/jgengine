import { describe, expect, it } from "bun:test";

import { createFloatingTextField } from "./floatingText";

const fixedNow = () => 1000;

describe("createFloatingTextField", () => {
  it("emits entries and caps the pool, recycling the oldest when full", () => {
    const field = createFloatingTextField({ max: 3, now: fixedNow });
    field.emit({ position: [0, 0, 0], text: "1" });
    field.update(0.3); // age the first
    field.emit({ position: [0, 0, 0], text: "2" });
    field.emit({ position: [0, 0, 0], text: "3" });
    expect(field.count()).toBe(3);
    // Pool is full; the oldest (text "1", the most-aged) is recycled, not grown past max.
    field.emit({ position: [0, 0, 0], text: "4" });
    expect(field.count()).toBe(3);
    const texts = field.active().map((v) => v.text).sort();
    expect(texts).toEqual(["2", "3", "4"]);
  });

  it("rises over time on world Y and drifts on X", () => {
    const field = createFloatingTextField({ now: fixedNow, defaultRise: 2, driftJitter: 0 });
    field.emit({ position: [5, 1, -2], text: "+10", drift: 3 });
    let view = field.active()[0]!;
    expect(view.position).toEqual([5, 1, -2]);
    field.update(0.5);
    view = field.active()[0]!;
    expect(view.position[0]).toBeCloseTo(5 + 3 * 0.5, 5); // drift
    expect(view.position[1]).toBeCloseTo(1 + 2 * 0.5, 5); // rise
    expect(view.position[2]).toBeCloseTo(-2, 5); // z unchanged
  });

  it("fades alpha to zero over the end of life and pops in scale at birth", () => {
    const field = createFloatingTextField({ now: fixedNow, defaultLifetime: 1, fadeFraction: 0.4, popIn: 0.2 });
    field.emit({ position: [0, 0, 0], text: "x", size: 2 });
    // At birth the pop-in makes scale smaller than the base size.
    expect(field.active()[0]!.size).toBeLessThan(2);
    expect(field.active()[0]!.alpha).toBe(1);
    // Past the pop-in window, scale reaches the base size and alpha is still full.
    field.update(0.5);
    expect(field.active()[0]!.size).toBeCloseTo(2, 5);
    expect(field.active()[0]!.alpha).toBe(1);
    // Deep into the fade window, alpha has dropped below 1.
    field.update(0.4); // progress 0.9, inside the last 40%
    expect(field.active()[0]!.alpha).toBeLessThan(1);
    expect(field.active()[0]!.alpha).toBeGreaterThan(0);
  });

  it("reaps entries at the end of their lifetime", () => {
    const field = createFloatingTextField({ now: fixedNow, defaultLifetime: 1 });
    field.emit({ position: [0, 0, 0], text: "gone" });
    expect(field.count()).toBe(1);
    field.update(0.6);
    expect(field.count()).toBe(1);
    field.update(0.6); // total 1.2 >= lifetime
    expect(field.count()).toBe(0);
    expect(field.active()).toEqual([]);
  });

  it("round-trips through snapshot/restore", () => {
    const field = createFloatingTextField({ now: fixedNow, seed: "abc" });
    field.emit({ position: [1, 2, 3], text: "crit!", kind: "crit", color: "#ff0" });
    field.emit({ position: [4, 5, 6], text: "+5", kind: "heal" });
    field.update(0.4);
    const snap = field.snapshot();

    const restored = createFloatingTextField({ now: fixedNow, seed: "different" });
    restored.restore(JSON.parse(JSON.stringify(snap)));
    expect(restored.count()).toBe(field.count());
    expect(restored.active().map((v) => ({ ...v, bornAt: 0 }))).toEqual(
      field.active().map((v) => ({ ...v, bornAt: 0 })),
    );
  });

  it("notifies subscribers on emit/update/clear and unsubscribes", () => {
    const field = createFloatingTextField({ now: fixedNow });
    let calls = 0;
    const off = field.subscribe(() => calls++);
    field.emit({ position: [0, 0, 0], text: "a" });
    field.update(0.1);
    field.clear();
    expect(calls).toBe(3);
    off();
    field.emit({ position: [0, 0, 0], text: "b" });
    expect(calls).toBe(3);
  });

  it("is deterministic: same seed + same calls reproduce identical drift", () => {
    const run = () => {
      const field = createFloatingTextField({ seed: 42, driftJitter: 1, now: fixedNow });
      field.emit({ position: [0, 0, 0], text: "a" });
      field.emit({ position: [0, 0, 0], text: "b" });
      field.update(1);
      return createFloatingTextField({ seed: 42, driftJitter: 1, now: fixedNow });
    };
    const a = createFloatingTextField({ seed: 42, driftJitter: 1, now: fixedNow });
    const b = createFloatingTextField({ seed: 42, driftJitter: 1, now: fixedNow });
    a.emit({ position: [0, 0, 0], text: "one" });
    b.emit({ position: [0, 0, 0], text: "one" });
    a.update(0.5);
    b.update(0.5);
    expect(a.active()[0]!.position).toEqual(b.active()[0]!.position);
    // A different seed produces a different drift.
    const c = createFloatingTextField({ seed: 7, driftJitter: 1, now: fixedNow });
    c.emit({ position: [0, 0, 0], text: "one" });
    c.update(0.5);
    expect(c.active()[0]!.position[0]).not.toBe(a.active()[0]!.position[0]);
    void run;
  });

  it("stamps bornAt from the injected clock", () => {
    let t = 500;
    const field = createFloatingTextField({ now: () => t });
    field.emit({ position: [0, 0, 0], text: "a" });
    t = 900;
    field.emit({ position: [0, 0, 0], text: "b" });
    const born = field.active().map((v) => v.bornAt).sort((x, y) => x - y);
    expect(born).toEqual([500, 900]);
  });
});
