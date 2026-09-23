import { describe, expect, test } from "bun:test";

import {
  clampLoopCutoff,
  clampLoopGain,
  clampLoopRate,
  createListenerVelocityTrack,
  MAX_LOOP_RATE,
  MIN_LOOP_RATE,
  stepListenerVelocity,
} from "./loopParams";

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

describe("clampLoopCutoff", () => {
  test("clamps into 10 Hz to the Nyquist frequency", () => {
    expect(clampLoopCutoff(2, 22050)).toBe(10);
    expect(clampLoopCutoff(30000, 22050)).toBe(22050);
    expect(clampLoopCutoff(30000, 22050, 16000)).toBe(16000);
    expect(clampLoopCutoff(800, 22050)).toBe(800);
  });

  test("a non-finite cutoff falls back to the filter's open end", () => {
    expect(clampLoopCutoff(Number.NaN, 22050, 24000)).toBe(22050);
    expect(clampLoopCutoff(Number.POSITIVE_INFINITY, 10)).toBe(10);
  });
});

describe("stepListenerVelocity", () => {
  test("converges on the camera's velocity", () => {
    const track = createListenerVelocityTrack();
    let v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i <= 60; i += 1) v = stepListenerVelocity(track, { x: 0, y: 0, z: i * 0.5 }, 1 / 60);
    expect(v.z).toBeCloseTo(30, 3);
  });

  test("treats a camera cut as a reset, not a supersonic listener", () => {
    const track = createListenerVelocityTrack();
    stepListenerVelocity(track, { x: 0, y: 0, z: 0 }, 1 / 60);
    stepListenerVelocity(track, { x: 0, y: 0, z: 0.5 }, 1 / 60);
    expect(stepListenerVelocity(track, { x: 500, y: 0, z: 0 }, 1 / 60)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
