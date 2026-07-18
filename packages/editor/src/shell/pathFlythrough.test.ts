import { describe, expect, test } from "bun:test";

import type { EditorPath } from "@jgengine/core/editor/index";

import { listScrubbablePaths, pathFollowConfigFromEditorPath, samplePathAt } from "./pathFlythrough";

function path(id: string, points: readonly [number, number, number][], label?: string): EditorPath {
  return {
    id,
    kind: "route",
    ...(label === undefined ? {} : { label }),
    points: points.map(([x, y, z]) => ({ x, y, z })),
  };
}

describe("pathFlythrough", () => {
  test("rejects single-point and empty paths", () => {
    expect(pathFollowConfigFromEditorPath(path("a", [[0, 0, 0]]))).toBeNull();
    expect(pathFollowConfigFromEditorPath(path("b", []))).toBeNull();
    expect(samplePathAt(path("a", [[0, 0, 0]]), 0.5)).toBeNull();
  });

  test("samples endpoints and midpoint on a straight segment", () => {
    const line = path("road", [
      [0, 0, 0],
      [10, 0, 0],
    ]);
    const start = samplePathAt(line, 0);
    const mid = samplePathAt(line, 0.5);
    const end = samplePathAt(line, 1);
    expect(start).toEqual({ x: 0, y: 0, z: 0, distance: 0, length: 10 });
    expect(mid).toEqual({ x: 5, y: 0, z: 0, distance: 5, length: 10 });
    expect(end).toEqual({ x: 10, y: 0, z: 0, distance: 10, length: 10 });
  });

  test("clamps normalized progress outside [0, 1]", () => {
    const line = path("road", [
      [0, 2, 0],
      [0, 2, 4],
    ]);
    expect(samplePathAt(line, -1)?.z).toBe(0);
    expect(samplePathAt(line, 2)?.z).toBe(4);
  });

  test("listScrubbablePaths drops short paths and keeps labels", () => {
    const paths = [
      path("keep", [
        [0, 0, 0],
        [1, 0, 0],
      ], "Patrol A"),
      path("drop", [[0, 0, 0]]),
    ];
    expect(listScrubbablePaths(paths)).toEqual([
      { id: "keep", kind: "route", label: "Patrol A", pointCount: 2, length: 1 },
    ]);
  });

  test("falls back to id when label is blank", () => {
    const paths = [
      path("route_1", [
        [0, 0, 0],
        [3, 0, 4],
      ], "  "),
    ];
    expect(listScrubbablePaths(paths)[0]?.label).toBe("route_1");
    expect(listScrubbablePaths(paths)[0]?.length).toBe(5);
  });
});
