import { expect, test } from "bun:test";
import { createLightField } from "./lightField";

test("a leaf shades the cell below it, and a snapshot restores the field", () => {
  const options = { cellM: 0.5, halfWidthM: 4, heightM: 6, a: 1, b: 1, depth: 6 };
  const field = createLightField(options);
  field.deposit(0, 4, 0, 1);
  field.propagate(0);
  const below = field.lightAt(0, 2, 0, 1, 0.5);
  expect(below).toBeLessThan(1);
  expect(field.lightAt(0, 5.5, 0, 1, 0.5)).toBe(1);
  const saved = field.snapshot();
  field.clear();
  expect(field.lightAt(0, 2, 0, 1, 0.5)).toBe(1);
  const copy = createLightField(options);
  copy.restore(saved);
  expect(copy.lightAt(0, 2, 0, 1, 0.5)).toBe(below);
});
