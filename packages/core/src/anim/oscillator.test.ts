import { describe, expect, test } from "bun:test";
import { pingPong, sawWave, triangleWave } from "./oscillator";

describe("sawWave", () => {
  test("ramps 0..1 then resets", () => {
    expect(sawWave(0, 4)).toBe(0);
    expect(sawWave(2, 4)).toBe(0.5);
    expect(sawWave(4, 4)).toBe(0);
    expect(sawWave(-1, 4)).toBe(0.75);
  });
});

describe("triangleWave", () => {
  test("peaks at half period", () => {
    expect(triangleWave(0, 4)).toBe(0);
    expect(triangleWave(2, 4)).toBe(1);
    expect(triangleWave(4, 4)).toBe(0);
    expect(triangleWave(1, 4)).toBeCloseTo(0.5);
    expect(triangleWave(3, 4)).toBeCloseTo(0.5);
  });
});

describe("pingPong", () => {
  test("bounces across length", () => {
    expect(pingPong(0, 5)).toBe(0);
    expect(pingPong(5, 5)).toBe(5);
    expect(pingPong(7, 5)).toBe(3);
    expect(pingPong(10, 5)).toBe(0);
  });
});
