import { describe, expect, test } from "bun:test";

import { createInputBuffer } from "./inputBuffer";

describe("createInputBuffer", () => {
  test("consume spends a press inside the window once", () => {
    const buffer = createInputBuffer({ windowMs: 100 });
    buffer.press("jump", 1000);
    expect(buffer.consume("jump", 1080)).toBe(true);
    expect(buffer.consume("jump", 1090)).toBe(false);
  });

  test("a press older than the window is dropped", () => {
    const buffer = createInputBuffer({ windowMs: 100 });
    buffer.press("jump", 1000);
    expect(buffer.consume("jump", 1101)).toBe(false);
    expect(buffer.consume("jump", 1101, 200)).toBe(true);
  });

  test("retune changes the default window", () => {
    const buffer = createInputBuffer({ windowMs: 50 });
    buffer.press("jump", 0);
    buffer.retune({ windowMs: 150 });
    expect(buffer.consume("jump", 120)).toBe(true);
  });

  test("coyote holds for the window after leaving the ground", () => {
    const buffer = createInputBuffer({ windowMs: 0 });
    expect(buffer.coyote(500, 580, 100)).toBe(true);
    expect(buffer.coyote(500, 601, 100)).toBe(false);
    expect(buffer.coyote(null, 500, 100)).toBe(false);
  });

  test("hold grows until release", () => {
    const buffer = createInputBuffer({ windowMs: 0 });
    expect(buffer.hold("fire", 10)).toBe(0);
    buffer.press("fire", 100);
    expect(buffer.hold("fire", 350)).toBe(250);
    buffer.release("fire", 400);
    expect(buffer.hold("fire", 500)).toBe(0);
  });

  test("doubleTap needs two presses inside the gap", () => {
    const buffer = createInputBuffer({ windowMs: 0 });
    buffer.press("dash", 0);
    expect(buffer.doubleTap("dash", 0, 250)).toBe(false);
    buffer.press("dash", 200);
    expect(buffer.doubleTap("dash", 200, 250)).toBe(true);
    buffer.press("dash", 600);
    expect(buffer.doubleTap("dash", 600, 250)).toBe(false);
  });

  test("snapshot and restore round-trip as plain data", () => {
    const buffer = createInputBuffer({ windowMs: 120 });
    buffer.press("jump", 10);
    const saved = JSON.parse(JSON.stringify(buffer.snapshot()));
    expect(buffer.consume("jump", 20)).toBe(true);
    buffer.restore(saved);
    expect(buffer.consume("jump", 20)).toBe(true);
    const other = createInputBuffer({ windowMs: 0 });
    other.restore(saved);
    expect(other.consume("jump", 100)).toBe(true);
  });
});
