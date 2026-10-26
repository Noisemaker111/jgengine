import { describe, expect, it } from "bun:test";

import { createCameraShake } from "./cameraShake";

describe("createCameraShake", () => {
  it("clamps added trauma into [0,1]", () => {
    const shake = createCameraShake();
    shake.add(0.3);
    expect(shake.trauma()).toBeCloseTo(0.3, 6);
    shake.add(5);
    expect(shake.trauma()).toBe(1);
    shake.add(-10);
    expect(shake.trauma()).toBe(0);
  });

  it("carries the free-string kind without interpreting it", () => {
    const shake = createCameraShake();
    expect(shake.kind()).toBeUndefined();
    shake.add(0.4, "explosion");
    expect(shake.kind()).toBe("explosion");
    shake.add(0.1, "landing");
    expect(shake.kind()).toBe("landing");
    // add without a kind keeps the previous label.
    shake.add(0.1);
    expect(shake.kind()).toBe("landing");
  });

  it("decays trauma by decayPerSecond and stops at zero", () => {
    const shake = createCameraShake({ decayPerSecond: 2 });
    shake.add(1);
    shake.update(0.25);
    expect(shake.trauma()).toBeCloseTo(0.5, 6);
    shake.update(1);
    expect(shake.trauma()).toBe(0);
  });

  it("returns a zero offset when there is no trauma", () => {
    const shake = createCameraShake();
    const o = shake.offset();
    expect(o).toEqual({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
  });

  it("produces a non-zero, bounded offset under trauma", () => {
    const shake = createCameraShake({ maxTranslation: [1, 1, 1], maxRotation: [1, 1, 1] });
    shake.add(1);
    shake.update(0.016);
    const o = shake.offset();
    const magnitude = Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.z) + Math.abs(o.pitch) + Math.abs(o.yaw) + Math.abs(o.roll);
    expect(magnitude).toBeGreaterThan(0);
    for (const v of [o.x, o.y, o.z, o.pitch, o.yaw, o.roll]) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it("pools the offset object (same reference each call)", () => {
    const shake = createCameraShake();
    shake.add(0.5);
    shake.update(0.016);
    expect(shake.offset()).toBe(shake.offset());
  });

  it("scales the offset by trauma^exponent", () => {
    // decay 0 so trauma stays exactly 1 vs 0.5 while the time cursor still advances.
    const full = createCameraShake({ decayPerSecond: 0, traumaExponent: 2, maxTranslation: [1, 1, 1], maxRotation: [1, 1, 1] });
    const half = createCameraShake({ decayPerSecond: 0, traumaExponent: 2, maxTranslation: [1, 1, 1], maxRotation: [1, 1, 1] });
    full.add(1);
    half.add(0.5);
    full.update(0.016);
    half.update(0.016);
    // Same seed + same dt sequence → same noise; only the trauma^2 factor differs (1 vs 0.25).
    const a = full.offset();
    const b = half.offset();
    expect(b.x).toBeCloseTo(a.x * 0.25, 6);
    expect(b.roll).toBeCloseTo(a.roll * 0.25, 6);
  });

  it("is deterministic for the same seed and dt sequence", () => {
    const make = () => createCameraShake({ seed: "boom", maxRotation: [1, 1, 1] });
    const a = make();
    const b = make();
    for (const s of [a, b]) {
      s.add(0.8, "hit");
      s.update(0.016);
      s.update(0.016);
    }
    expect(a.offset()).toEqual(b.offset());
  });

  it("diverges for different seeds", () => {
    const a = createCameraShake({ seed: "alpha", maxRotation: [1, 1, 1] });
    const b = createCameraShake({ seed: "beta", maxRotation: [1, 1, 1] });
    a.add(1);
    b.add(1);
    a.update(0.05);
    b.update(0.05);
    expect(a.offset().roll).not.toBeCloseTo(b.offset().roll, 6);
  });

  it("clear() resets trauma but keeps determinism of the stream", () => {
    const shake = createCameraShake();
    shake.add(1);
    shake.update(0.016);
    shake.clear();
    expect(shake.trauma()).toBe(0);
    expect(shake.offset()).toEqual({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
  });

  it("notifies subscribers on add/update/clear and unsubscribes", () => {
    const shake = createCameraShake();
    let count = 0;
    const unsub = shake.subscribe(() => {
      count += 1;
    });
    shake.add(0.5);
    shake.update(0.016);
    shake.clear();
    expect(count).toBe(3);
    unsub();
    shake.add(0.5);
    expect(count).toBe(3);
  });

  it("round-trips through snapshot/restore", () => {
    const shake = createCameraShake({ seed: "save" });
    shake.add(0.7, "explosion");
    shake.update(0.032);
    shake.update(0.032);
    const snap = shake.snapshot();
    const before = { ...shake.offset() };

    const other = createCameraShake({ seed: "different" });
    other.restore(snap);
    expect(other.trauma()).toBeCloseTo(shake.trauma(), 6);
    expect(other.kind()).toBe("explosion");
    expect(other.offset()).toEqual(before);
  });

  it("supports an injected clock when update() is called without dt", () => {
    let clock = 1_000;
    const shake = createCameraShake({ now: () => clock, decayPerSecond: 1 });
    shake.add(1);
    shake.update(); // first call establishes the baseline, no elapsed time
    expect(shake.trauma()).toBe(1);
    clock += 500;
    shake.update(); // 0.5s elapsed → decay 0.5
    expect(shake.trauma()).toBeCloseTo(0.5, 6);
  });
});
