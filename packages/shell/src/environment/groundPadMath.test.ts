import { expect, test } from "bun:test";

import { PAD_THICKNESS, resolvePadMeshY, resolvePadShape, resolvePadSurfaceY } from "./groundPadMath";

test("resolvePadShape distinguishes rectangular and circular pads", () => {
  expect(resolvePadShape([6, 4])).toEqual({ circular: false, width: 6, depth: 4 });
  expect(resolvePadShape({ radius: 5 })).toEqual({ circular: true, radius: 5 });
});

test("resolvePadSurfaceY offsets the ground height by the pad's height", () => {
  expect(resolvePadSurfaceY(2, { height: 0.05 })).toBeCloseTo(2.05);
  expect(resolvePadSurfaceY(-1.5, { height: 0.2 })).toBeCloseTo(-1.3);
});

test("resolvePadMeshY centers the pad slab beneath its surface", () => {
  expect(resolvePadMeshY(2, { height: 0.05 })).toBeCloseTo(2.05 - PAD_THICKNESS / 2);
  expect(resolvePadMeshY(0, { height: 0 })).toBeCloseTo(-PAD_THICKNESS / 2);
});
