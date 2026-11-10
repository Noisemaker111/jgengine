import { expect, test } from "bun:test";
import { boxTransform, composeBoxTransform, transformedBoxRect, type RuneBoxRect } from "./boxTransform";

test("a centred tablet and its translated sheet measure where Rune paints them", () => {
  const viewport: RuneBoxRect = [744.5, 304, 341, 548];
  const parent = boxTransform(viewport, [0, 0, 0, 1, -0.5, 0], undefined);
  const sheet = boxTransform(viewport, [0, 0, 0, 1, 0, 0.88], undefined);
  const rect = transformedBoxRect(viewport, composeBoxTransform(parent, sheet));
  expect(rect[0]).toBe(574);
  expect(rect[1]).toBeCloseTo(786.24);
  expect(rect[2]).toBe(341);
  expect(rect[3]).toBe(548);
});

test("nested HUD zoom and rotation carry the origin, offsets and child bounds", () => {
  const zoom = boxTransform([10, 20, 100, 100], [0, 0, 0, 2, 0, 0], [0, 0]);
  const child: RuneBoxRect = [20, 30, 10, 20];
  const turn = boxTransform(child, [5, 0, Math.PI / 2, 1, 0, 0], [0, 0]);
  const rect = transformedBoxRect(child, composeBoxTransform(zoom, turn));
  expect(rect[0]).toBeCloseTo(0);
  expect(rect[1]).toBeCloseTo(40);
  expect(rect[2]).toBeCloseTo(40);
  expect(rect[3]).toBeCloseTo(20);
});
