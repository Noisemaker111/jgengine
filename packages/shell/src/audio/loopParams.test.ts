import { describe, expect, test } from "bun:test";

import { clampLoopGain, clampLoopRate, MAX_LOOP_RATE, MIN_LOOP_RATE } from "./loopParams";

describe("clampLoopRate", () => {
  test("passes authored pitch and in-window rates through", () => {
    expect(clampLoopRate(1)).toBe(1);
    expect(clampLoopRate(2.5)).toBe(2.5);
    expect(clampLoopRate(MIN_LOOP_RATE)).toBe(MIN_LOOP_RATE);
    expect(clampLoopRate(MAX_LOOP_RATE)).toBe(MAX_LOOP_RATE);
  });

  test("clamps out-of-window rates to 0.25–4", () => {
    expect(clampLoopRate(0.05)).toBe(0.25);
    expect(clampLoopRate(0)).toBe(0.25);
    expect(clampLoopRate(9)).toBe(4);
  });

  test("non-finite input falls back to authored pitch", () => {
    expect(clampLoopRate(Number.NaN)).toBe(1);
    expect(clampLoopRate(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampLoopRate(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe("clampLoopGain", () => {
  test("passes in-range gains through", () => {
    expect(clampLoopGain(0)).toBe(0);
    expect(clampLoopGain(0.5)).toBe(0.5);
    expect(clampLoopGain(1)).toBe(1);
  });

  test("clamps out-of-range gains to 0–1", () => {
    expect(clampLoopGain(-2)).toBe(0);
    expect(clampLoopGain(3)).toBe(1);
  });

  test("non-finite input falls back to silence", () => {
    expect(clampLoopGain(Number.NaN)).toBe(0);
    expect(clampLoopGain(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
