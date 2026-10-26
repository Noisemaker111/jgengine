import { expect, test } from "bun:test";

import { markFarPlacements } from "./ScatterImpostorField.draw";

test("placements past their threshold go far, and the band keeps them there near the edge", () => {
  const instances = [{ x: 10, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 72, y: 0, z: 0 }];
  const flags = new Uint8Array(3);
  expect(markFarPlacements(instances, [70, 70, 70], flags, { x: 0, y: 0, z: 0 })).toBe(1);
  expect([...flags]).toEqual([0, 1, 0]);
  flags[2] = 1;
  expect(markFarPlacements(instances, [70, 70, 70], flags, { x: 0, y: 0, z: 0 })).toBe(2);
  expect(markFarPlacements(instances, [70, 70, 70], flags, { x: 100, y: 0, z: 0 })).toBe(1);
  expect([...flags]).toEqual([1, 0, 0]);
});
