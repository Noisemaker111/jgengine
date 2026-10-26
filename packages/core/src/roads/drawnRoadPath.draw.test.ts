import { expect, test } from "bun:test";

import { drawnRoadPath } from "./RoadRibbons.draw";

test("filleted bends never leave a zero-length step for kerbs and sidewalks to spike on", () => {
  // Short segments make neighbouring fillets meet at the same midpoint.
  const path = Array.from({ length: 12 }, (_, i) => [i * 4, (i % 2) * 2] as const);
  const line = drawnRoadPath({ path, width: 14 });
  for (let i = 1; i < line.length; i += 1) {
    expect(Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1])).toBeGreaterThan(1e-3);
  }
});

test("a closed loop starts and ends on the same straight seam with every authored corner rounded", () => {
  const square = [[0, 0], [20, 0], [20, 20], [0, 20]] as const;
  const line = drawnRoadPath({ path: square, width: 6, closed: true });
  expect(line[0]).toEqual(line[line.length - 1]!);
  expect(line[0]).toEqual([10, 0]);
  expect(line.some((point) => point[0] === 0 && point[1] === 0)).toBe(false);
});
