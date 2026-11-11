import { expect, test } from "bun:test";
import { createRunePassThrough } from "./runePassThrough";

const button = (x: number, y: number) => x >= 100 && x <= 200 && y >= 100 && y <= 200;

test("the canvas takes the pointer only over its hit regions or while modal", () => {
  const pass = createRunePassThrough(button);
  pass.move(50, 50, 0);
  expect(pass.takes(false)).toBe(false);
  expect(pass.takes(true)).toBe(true);
  pass.move(150, 150, 0);
  expect(pass.takes(false)).toBe(true);
});

test("a press on the world keeps its release on the world, even over a UI region", () => {
  const pass = createRunePassThrough(button);
  pass.move(50, 50, 0);
  pass.down(50, 50, false);
  expect(pass.takes(false)).toBe(false);
  pass.move(150, 150, 1);
  expect(pass.takes(false)).toBe(false);
  pass.up(150, 150);
  expect(pass.takes(false)).toBe(true);
});

test("a press on the UI keeps the canvas through a drag off it, and a buttonless move clears a missed release", () => {
  const pass = createRunePassThrough(button);
  pass.down(150, 150, true);
  pass.move(400, 400, 1);
  expect(pass.takes(false)).toBe(true);
  pass.move(400, 400, 0);
  expect(pass.takes(false)).toBe(false);
});
