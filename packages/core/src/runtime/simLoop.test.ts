import { describe, expect, test } from "bun:test";

import { createSimLoop } from "./simLoop";

describe("createSimLoop", () => {
  test("the default is a fixed 60 Hz step; variable is an explicit choice", () => {
    const loop = createSimLoop();
    expect(loop.isFixed()).toBe(true);
    expect(loop.stepSeconds()).toBeCloseTo(1 / 60, 12);
    loop.retune({ hz: 30 });
    expect(loop.stepSeconds()).toBeCloseTo(1 / 30, 12);
  });

  test("variable mode steps once per advance with the frame dt", () => {
    const loop = createSimLoop({ hz: "variable" });
    const seen: number[] = [];
    const result = loop.advance(0.033, (dt) => seen.push(dt));
    expect(seen).toEqual([0.033]);
    expect(result).toEqual({ steps: 1, alpha: 1, tick: 1, dropped: 0, early: 0 });
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

  test("a step run ahead is counted, not rerun, by the advance that owes it", () => {
    const loop = createSimLoop({ hz: 60 });
    const ran: number[] = [];
    loop.advance(0.014, () => ran.push(loop.tick()));
    expect(loop.untilStep()).toBeCloseTo(1 / 60 - 0.014, 9);
    expect(loop.stepAhead((_dt, tick) => ran.push(tick))).toBe(true);
    expect(loop.stepAhead(() => ran.push(-1))).toBe(false);
    expect(loop.tick()).toBe(1);
    expect(loop.untilStep()).toBeCloseTo(2 / 60 - 0.014, 9);
    const result = loop.advance(0.003, () => ran.push(-2));
    expect(ran).toEqual([1]);
    expect(result).toMatchObject({ steps: 1, early: 1, tick: 1 });
    expect(result.alpha).toBeCloseTo((0.017 - 1 / 60) * 60, 9);
  });

  test("a frame that ends short of the early step shows it and owes the time back", () => {
    const loop = createSimLoop({ hz: 60 });
    loop.advance(0.015, () => {});
    loop.stepAhead(() => {});
    const short = loop.advance(0.001, () => {});
    expect(short).toMatchObject({ steps: 1, early: 1, alpha: 0 });
    expect(loop.snapshot().accumulator).toBeCloseTo(0.016 - 1 / 60, 9);
    let steps = 0;
    loop.advance(1 / 60, () => (steps += 1));
    expect(steps).toBe(0);
    loop.advance(0.001, () => (steps += 1));
    expect(steps).toBe(1);
  });

  test("stepping ahead at 360 fps runs the same steps with none inside a frame", () => {
    const frame = 1 / 360;
    const plain = createSimLoop({ hz: 60 });
    const early = createSimLoop({ hz: 60 });
    const plainTicks: number[] = [];
    const earlyTicks: number[] = [];
    let stepsInsideFrames = 0;
    for (let index = 0; index < 360; index += 1) {
      plain.advance(frame, (_dt, tick) => plainTicks.push(tick));
      early.advance(frame, (_dt, tick) => {
        earlyTicks.push(tick);
        stepsInsideFrames += 1;
      });
      if ((early.untilStep() ?? 1) <= frame) early.stepAhead((_dt, tick) => earlyTicks.push(tick));
    }
    expect(stepsInsideFrames).toBe(0);
    expect(early.tick()).toBe(plain.tick());
    expect(earlyTicks.slice(0, plainTicks.length)).toEqual(plainTicks);
    expect(early.alpha()).toBeCloseTo(plain.alpha(), 6);
  });

  test("snapshot and retune settle a step run ahead", () => {
    const loop = createSimLoop({ hz: 60 });
    loop.advance(0.016, () => {});
    loop.stepAhead(() => {});
    const state = loop.snapshot();
    expect(state.tick).toBe(1);
    expect(state.accumulator).toBeCloseTo(0.016 - 1 / 60, 9);
    loop.retune({ hz: "variable" });
    expect(loop.untilStep()).toBeNull();
    expect(loop.stepAhead(() => {})).toBe(false);
  });
});
