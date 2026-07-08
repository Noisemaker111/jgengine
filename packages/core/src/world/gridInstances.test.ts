import { describe, expect, test } from "bun:test";

import { resolveGridInstances } from "./gridInstances";

describe("resolveGridInstances", () => {
  test("empty cells yields no instances", () => {
    expect(resolveGridInstances({})).toEqual([]);
    expect(resolveGridInstances({ cells: [] })).toEqual([]);
  });

  test("defaults cell size 1, height 1, and a fallback color", () => {
    const [instance] = resolveGridInstances({ cells: [{ x: 2, z: 3 }] });
    expect(instance).toEqual({
      position: [2, 0.5, 3],
      scale: [1, 1, 1],
      color: "#8a8f98",
    });
  });

  test("per-cell height and color win over config defaults", () => {
    const [instance] = resolveGridInstances({
      cells: [{ x: 0, z: 0, height: 4, color: "#ff0000" }],
      baseHeight: 1,
      defaultColor: "#00ff00",
    });
    expect(instance).toEqual({
      position: [0, 2, 0],
      scale: [1, 4, 1],
      color: "#ff0000",
    });
  });

  test("baseHeight and defaultColor apply when a cell omits its own", () => {
    const [instance] = resolveGridInstances({
      cells: [{ x: 1, z: -1 }],
      baseHeight: 3,
      defaultColor: "#123456",
      cellSize: 2,
    });
    expect(instance).toEqual({
      position: [2, 1.5, -2],
      scale: [2, 3, 2],
      color: "#123456",
    });
  });

  test("cellSize scales both position spacing and box footprint", () => {
    const instances = resolveGridInstances({
      cells: [{ x: 0, z: 0 }, { x: 1, z: 2 }],
      cellSize: 4,
    });
    expect(instances[0]?.position).toEqual([0, 0.5, 0]);
    expect(instances[1]?.position).toEqual([4, 0.5, 8]);
    expect(instances[1]?.scale).toEqual([4, 1, 4]);
  });
});
