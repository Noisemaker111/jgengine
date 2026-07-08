import { describe, expect, test } from "bun:test";
import { constrainToNavGrid } from "@jgengine/core/nav/navConstrain";
import { createNavGrid } from "@jgengine/core/nav/navGrid";

function grid() {
  return createNavGrid({ bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, cellSize: 1 });
}

describe("constrainToNavGrid", () => {
  test("walkable target cell passes through unchanged", () => {
    const constrain = constrainToNavGrid(grid());
    const proposed = { position: [1.5, 0, 0.5] as const, rotationY: 0, grounded: true };
    const entity = { position: [0.5, 0, 0.5] as const };
    expect(constrain(proposed, entity)).toEqual(proposed);
  });

  test("blocked target slides along keeping entity x, proposed z", () => {
    const navGrid = grid();
    navGrid.setWalkable(2, 2, false);
    navGrid.setWalkable(2, 0, false);
    const constrain = constrainToNavGrid(navGrid);
    const proposed = { position: [2.5, 0, 2.5] as const, rotationY: 0, grounded: true };
    const entity = { position: [0.5, 0, 0.5] as const };
    expect(constrain(proposed, entity)).toEqual({ position: [0.5, 0, 2.5], rotationY: 0, grounded: true });
  });

  test("blocked target slides along keeping proposed x, entity z", () => {
    const navGrid = grid();
    navGrid.setWalkable(2, 2, false);
    navGrid.setWalkable(0, 2, false);
    const constrain = constrainToNavGrid(navGrid);
    const proposed = { position: [2.5, 0, 2.5] as const, rotationY: 0, grounded: true };
    const entity = { position: [0.5, 0, 0.5] as const };
    expect(constrain(proposed, entity)).toEqual({ position: [2.5, 0, 0.5], rotationY: 0, grounded: true });
  });

  test("blocked target and both slide candidates blocked returns null", () => {
    const navGrid = grid();
    navGrid.setWalkable(2, 2, false);
    navGrid.setWalkable(0, 2, false);
    navGrid.setWalkable(2, 0, false);
    const constrain = constrainToNavGrid(navGrid);
    const proposed = { position: [2.5, 0, 2.5] as const, rotationY: 0, grounded: true };
    const entity = { position: [0.5, 0, 0.5] as const };
    expect(constrain(proposed, entity)).toBeNull();
  });

  test("y option remaps the vertical position when passing through", () => {
    const constrain = constrainToNavGrid(grid(), { y: ([x, z]) => x + z });
    const proposed = { position: [1.5, 0, 0.5] as const, rotationY: 0, grounded: true };
    const entity = { position: [0.5, 0, 0.5] as const };
    expect(constrain(proposed, entity)).toEqual({ position: [1.5, 2, 0.5], rotationY: 0, grounded: true });
  });
});
