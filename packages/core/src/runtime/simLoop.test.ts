import { describe, expect, test } from "bun:test";

import { createSimLoop } from "./simLoop";

describe("createSimLoop", () => {
  test("variable mode steps once per advance with the frame dt", () => {
    const loop = createSimLoop();
    const seen: number[] = [];
    const result = loop.advance(0.033, (dt) => seen.push(dt));
    expect(seen).toEqual([0.033]);
    expect(result).toEqual({ steps: 1, alpha: 1, tick: 1, dropped: 0 });
    expect(loop.isFixed()).toBe(false);
    expect(loop.stepSeconds()).toBeNull();
  });

  test("fixed mode accumulates and steps in equal slices", () => {
    const loop = createSimLoop({ hz: 50 });
    const seen: number[] = [];
    expect(loop.advance(0.01, (dt) => seen.push(dt)).steps).toBe(0);
    expect(loop.alpha()).toBeCloseTo(0.5);
    const result = loop.advance(0.035, (dt) => seen.push(dt));
    expect(result.steps).toBe(2);
    expect(result.tick).toBe(2);
    expect(seen.every((dt) => Math.abs(dt - 0.02) < 1e-12)).toBe(true);
    expect(result.alpha).toBeCloseTo(0.25);
  });

  test("catch-up cap drops time instead of spiralling", () => {
    const loop = createSimLoop({ hz: 100, maxCatchUpSteps: 3 });
    let steps = 0;
    const result = loop.advance(1, () => (steps += 1));
    expect(steps).toBe(3);
    expect(result.dropped).toBe(97);
    expect(result.alpha).toBeCloseTo(0);
  });

  test("ticks are passed to the step callback and count monotonically", () => {
    const loop = createSimLoop({ hz: 10 });
    const ticks: number[] = [];
    loop.advance(0.35, (_dt, tick) => ticks.push(tick));
    expect(ticks).toEqual([1, 2, 3]);
    expect(loop.tick()).toBe(3);
  });

  test("snapshot and restore round-trip the accumulator and tick", () => {
    const loop = createSimLoop({ hz: 20 });
    loop.advance(0.07, () => {});
    const state = loop.snapshot();
    const other = createSimLoop({ hz: 20 });
    other.restore(state);
    expect(other.tick()).toBe(loop.tick());
    expect(other.alpha()).toBeCloseTo(loop.alpha());
    const a = loop.advance(0.03, () => {});
    const b = other.advance(0.03, () => {});
    expect(b).toEqual(a);
  });

  test("retune switches rate without losing the tick count", () => {
    const loop = createSimLoop({ hz: 30 });
    loop.advance(0.1, () => {});
    const tick = loop.tick();
    loop.retune({ hz: "variable" });
    expect(loop.isFixed()).toBe(false);
    loop.advance(0.5, () => {});
    expect(loop.tick()).toBe(tick + 1);
  });
});
