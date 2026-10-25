import { describe, expect, test } from "bun:test";
import { groupStaticShapeInstances } from "@jgengine/shell/render/staticShapeInstances";

import { plotShapes } from "./plotShapes";

const plots = Array.from({ length: 12 }, (_, index) => ({ position: [index * 4, 0, 0] as const }));

describe("beacon-bastion build plots", () => {
  test("every open plot draws in three batches, not three meshes a plot", () => {
    const shapes = plotShapes(plots, plots.map(() => true), "#5fbf6a");
    expect(shapes).toHaveLength(36);
    expect(groupStaticShapeInstances(shapes)).toHaveLength(3);
  });

  test("an occupied plot draws nothing", () => {
    const open = plots.map((_, index) => index !== 3);
    const shapes = plotShapes(plots, open, "#4a5a44");
    expect(shapes).toHaveLength(33);
    expect(shapes.some((shape) => shape.position[0] === 12)).toBe(false);
  });
});
