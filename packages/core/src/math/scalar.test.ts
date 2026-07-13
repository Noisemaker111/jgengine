import { describe, expect, test } from "bun:test";
import { clamp, inverseLerp, mod, moveTowards, remap, wrap } from "./scalar";

describe("clamp", () => {
  test("constrains to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe("inverseLerp", () => {
  test("recovers the fraction", () => {
    expect(inverseLerp(10, 20, 15)).toBe(0.5);
    expect(inverseLerp(0, 4, 3)).toBe(0.75);
  });
  test("empty span returns 0", () => {
    expect(inverseLerp(5, 5, 5)).toBe(0);
  });
});

describe("remap", () => {
  test("maps between ranges", () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(0, -1, 1, 0, 200)).toBe(100);
  });
  test("clamps output when asked", () => {
    expect(remap(20, 0, 10, 0, 100, true)).toBe(100);
    expect(remap(-5, 0, 10, 0, 100, true)).toBe(0);
  });
});

describe("mod", () => {
  test("always non-negative", () => {
    expect(mod(7, 5)).toBe(2);
    expect(mod(-1, 5)).toBe(4);
    expect(mod(-7, 5)).toBe(3);
  });
});

describe("moveTowards", () => {
  test("steps without overshoot", () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
    expect(moveTowards(0, 2, 5)).toBe(2);
    expect(moveTowards(10, 0, 4)).toBe(6);
  });
});

describe("wrap", () => {
  test("cycles into range", () => {
    expect(wrap(12, 0, 10)).toBe(2);
    expect(wrap(-1, 0, 10)).toBe(9);
    expect(wrap(5, 0, 10)).toBe(5);
  });
});
