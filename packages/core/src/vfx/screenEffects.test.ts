import { describe, expect, test } from "bun:test";

import { createScreenEffects } from "./screenEffects";

/** A controller driven by a mutable clock so tests advance time deterministically. */
function clocked() {
  let t = 0;
  const fx = createScreenEffects({ now: () => t });
  return {
    fx,
    set(next: number) {
      t = next;
    },
  };
}

describe("createScreenEffects", () => {
  test("flash starts a full-screen transient at peak that eases to zero over its duration", () => {
    const { fx, set } = clocked();
    fx.flash("damage", { color: "#ff0000", intensity: 1, durationMs: 400, easing: "linear" });

    let view = fx.composite();
    expect(view).toHaveLength(1);
    expect(view[0]!.kind).toBe("damage");
    expect(view[0]!.shape).toBe("full");
    expect(view[0]!.intensity).toBeCloseTo(1, 5);

    set(200);
    fx.advance();
    view = fx.composite();
    expect(view[0]!.intensity).toBeCloseTo(0.5, 5); // linear halfway

    set(400);
    fx.advance();
    expect(fx.active()).toBe(0); // reaped at end of life
    expect(fx.composite()).toHaveLength(0);
  });

  test("vignette uses the edge shape; kind is passed through untouched (never interpreted)", () => {
    const { fx } = clocked();
    fx.vignette("whatever-the-game-calls-it", { color: "rgb(10,20,30)" });
    const view = fx.composite();
    expect(view[0]!.shape).toBe("vignette");
    expect(view[0]!.kind).toBe("whatever-the-game-calls-it");
  });

  test("a sustained pulse holds until cleared and oscillates between minIntensity and intensity", () => {
    const { fx, set } = clocked();
    const id = fx.pulse("low-health", { color: "#f00", intensity: 0.8, minIntensity: 0.2, pulseHz: 1 });

    // t=0: sin(0)=0 → osc 0.5 → 0.2 + 0.6*0.5 = 0.5
    expect(fx.composite()[0]!.intensity).toBeCloseTo(0.5, 5);

    // Quarter period (0.25s at 1Hz): sin(pi/2)=1 → osc 1 → peak 0.8
    set(250);
    fx.advance();
    expect(fx.composite()[0]!.intensity).toBeCloseTo(0.8, 5);

    // Three-quarter period: sin(3pi/2)=-1 → osc 0 → trough 0.2
    set(750);
    fx.advance();
    expect(fx.composite()[0]!.intensity).toBeCloseTo(0.2, 5);

    // Sustained never expires on its own.
    set(100000);
    fx.advance();
    expect(fx.active()).toBe(1);

    fx.clear(id);
    expect(fx.active()).toBe(0);
  });

  test("multiple effects composite together and clearAll empties everything", () => {
    const { fx } = clocked();
    fx.flash("heal", { color: "#0f0" });
    fx.vignette("damage", { color: "#f00" });
    fx.pulse("poison", { color: "#0af", intensity: 0.5 });
    expect(fx.active()).toBe(3);
    expect(fx.composite()).toHaveLength(3);
    fx.clearAll();
    expect(fx.active()).toBe(0);
  });

  test("composite() reuses its array and entry objects — no per-call allocation", () => {
    const { fx } = clocked();
    fx.pulse("aura", { color: "#fff", intensity: 0.6, pulseHz: 0 });
    const a = fx.composite();
    const firstEntry = a[0];
    const b = fx.composite();
    expect(b).toBe(a); // same pooled array reference
    expect(b[0]).toBe(firstEntry); // same pooled entry object
  });

  test("subscribe fires on trigger, advance, and clear", () => {
    const { fx } = clocked();
    let calls = 0;
    const off = fx.subscribe(() => {
      calls += 1;
    });
    fx.flash("hit", { color: "#f00" });
    fx.advance();
    fx.clearAll();
    expect(calls).toBe(3);
    off();
    fx.flash("hit", { color: "#f00" });
    expect(calls).toBe(3); // unsubscribed
  });

  test("snapshot/restore round-trips active effects and re-anchors elapsed time", () => {
    const { fx, set } = clocked();
    fx.pulse("low-health", { color: "#f00", intensity: 0.7, minIntensity: 0.1, pulseHz: 2 });
    fx.flash("damage", { color: "#f00", durationMs: 1000, easing: "linear" });

    set(300);
    fx.advance();
    const snap = fx.snapshot();
    const before = fx.composite().map((v) => ({ kind: v.kind, intensity: v.intensity }));

    // Restore into a fresh controller whose clock is at a different wall time.
    const other = clocked();
    other.set(9000);
    other.fx.restore(snap);
    const after = other.fx.composite().map((v) => ({ kind: v.kind, intensity: v.intensity }));

    expect(after.length).toBe(before.length);
    // Elapsed-time drift is re-anchored, so the eased/oscillated intensities match.
    for (let i = 0; i < before.length; i++) {
      expect(after[i]!.kind).toBe(before[i]!.kind);
      expect(after[i]!.intensity).toBeCloseTo(before[i]!.intensity, 5);
    }
  });

  test("intensity and minIntensity are clamped to 0..1", () => {
    const { fx } = clocked();
    fx.flash("over", { color: "#fff", intensity: 5 });
    expect(fx.composite()[0]!.intensity).toBeCloseTo(1, 5);
  });
});
