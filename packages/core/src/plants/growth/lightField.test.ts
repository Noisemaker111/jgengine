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

test("side light reaches a shaded shoot at a crown's edge, is cut by leaves in its own row, and by neighbours in a stand", () => {
  const options = { cellM: 0.5, halfWidthM: 6, heightM: 8, a: 1, b: 1, depth: 8 };
  const grow = (side: number, period = 0): ReturnType<typeof createLightField> => {
    const field = createLightField(options);
    // A broad layer of leaves overhead, and a dense row of leaves at shoot height to one side.
    for (let x = -2; x <= 2; x += 0.5) for (let z = -2; z <= 2; z += 0.5) field.deposit(x, 5, z, 2);
    for (let x = 0.5; x <= 3; x += 0.5) field.deposit(x, 2, 0, 4);
    field.setPeriod(period);
    field.propagate(0, { share: side, extinction: 0.5 });
    return field;
  };
  const above = grow(0);
  const sides = grow(0.6);
  // Under the overhead layer at its edge, the sides are open: side light lifts the shoot.
  expect(sides.lightAt(-2, 2, -2, 1, 0.5)).toBeGreaterThan(above.lightAt(-2, 2, -2, 1, 0.5) + 0.2);
  // Inside the dense row, the row itself blocks the light from along it.
  expect(sides.lightAt(1.5, 2, 0, 1, 0.5)).toBeLessThan(sides.lightAt(-2, 2, -2, 1, 0.5));
  // In a stand, the neighbours' rows close the sides.
  expect(grow(0.6, 6).lightAt(1.5, 2, 0, 1, 0.5)).toBeLessThan(sides.lightAt(1.5, 2, 0, 1, 0.5));
});
