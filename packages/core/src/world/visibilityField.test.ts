import { describe, expect, it } from "bun:test";
import { createVisibilityField } from "./visibilityField";

const BOUNDS = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };

describe("visibility field", () => {
  it("starts every cell hidden for an unknown group", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    expect(field.cellCount()).toBe(20 * 20);
    expect(field.stateAt("team", 0, 0)).toBe("hidden");
    expect(field.isKnown("team", 0, 0)).toBe(false);
  });

  it("marks observed cells and reports a delta", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    const delta = field.observeCircle("team", 0, 0, 4);
    expect(delta.observed.length).toBeGreaterThan(0);
    expect(delta.remembered).toEqual([]);
    expect(field.isObserved("team", 0, 0)).toBe(true);
    expect(field.stateAt("team", 0, 0)).toBe("observed");
  });

  it("transitions observed terrain to remembered when the viewer leaves (permanent memory)", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    field.observeCircle("team", -10, -10, 3);
    expect(field.isObserved("team", -10, -10)).toBe(true);

    // Scout walks away: observe a disjoint area.
    const delta = field.observeCircle("team", 10, 10, 3);
    expect(delta.remembered.length).toBeGreaterThan(0);
    expect(field.isObserved("team", -10, -10)).toBe(false);
    expect(field.isRemembered("team", -10, -10)).toBe(true);
    // Terrain stays known even though it is no longer observed.
    expect(field.isKnown("team", -10, -10)).toBe(true);
  });

  it("scout reveals terrain while an enemy unit re-hides after leaving observation", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    const enemy = { id: "e1", x: -10, z: -10 };
    const posOf = (e: { x: number; z: number }) => ({ x: e.x, z: e.z });

    // Scout observes the enemy's tile: the enemy is disclosed to the host filter.
    field.observeCircle("blue", -10, -10, 3);
    expect(field.visibleTo("blue", [enemy], posOf)).toEqual([enemy]);

    // Scout moves away — enemy tile becomes remembered terrain, but the live unit re-hides.
    field.observeCircle("blue", 8, 8, 3);
    expect(field.isKnown("blue", -10, -10)).toBe(true); // terrain remembered
    expect(field.visibleTo("blue", [enemy], posOf)).toEqual([]); // entity hidden again
  });

  it("keeps groups isolated — one group's knowledge never leaks into another", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    const secret = { id: "hq", x: 12, z: 12 };
    const posOf = (e: { x: number; z: number }) => ({ x: e.x, z: e.z });

    field.observeCircle("red", 12, 12, 3);
    expect(field.isKnown("red", 12, 12)).toBe(true);
    // Blue never observed that area.
    expect(field.isKnown("blue", 12, 12)).toBe(false);
    expect(field.stateAt("blue", 12, 12)).toBe("hidden");
    expect(field.visibleTo("blue", [secret], posOf)).toEqual([]);
    expect(field.visibleTo("red", [secret], posOf)).toEqual([secret]);
  });

  it("forgets remembered cells after the decay window", () => {
    const field = createVisibilityField({
      bounds: BOUNDS,
      cellSize: 2,
      memory: { kind: "decay", updates: 2 },
    });
    field.observeCircle("scout", -10, -10, 2); // update 1: observed
    field.observeCircle("scout", 10, 10, 2); // update 2: -10,-10 -> remembered (tick 2)
    expect(field.isRemembered("scout", -10, -10)).toBe(true);

    field.observeCircle("scout", 10, 10, 2); // update 3: age 1
    expect(field.isRemembered("scout", -10, -10)).toBe(true);
    const delta = field.observeCircle("scout", 10, 10, 2); // update 4: age 2 -> hidden
    expect(delta.hidden).toContain(field.cellIndex(-10, -10));
    expect(field.isKnown("scout", -10, -10)).toBe(false);
  });

  it("drops terrain straight to hidden under a `none` memory policy", () => {
    const field = createVisibilityField({
      bounds: BOUNDS,
      cellSize: 2,
      memory: { kind: "none" },
    });
    field.observeCircle("ghost", 0, 0, 2);
    const delta = field.observeCircle("ghost", 12, 12, 2);
    expect(delta.hidden.length).toBeGreaterThan(0);
    expect(delta.remembered).toEqual([]);
    expect(field.isKnown("ghost", 0, 0)).toBe(false);
  });

  it("unions overlapping observers within a group before observing", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    const cells: number[] = [];
    field.cellsInRadius(-8, 0, 2, cells);
    field.cellsInRadius(8, 0, 2, cells);
    field.observe("team", cells);
    expect(field.isObserved("team", -8, 0)).toBe(true);
    expect(field.isObserved("team", 8, 0)).toBe(true);
  });

  it("round-trips through serialization", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    field.observeCircle("red", -10, -10, 3);
    field.observeCircle("red", 10, 10, 3); // leaves the first area remembered
    field.observeCircle("blue", 0, 0, 3);

    const state = field.toState();
    const json = JSON.parse(JSON.stringify(state));
    const restored = createVisibilityField({ bounds: BOUNDS, cellSize: 2, restore: json });

    for (const [x, z] of [
      [-10, -10],
      [10, 10],
      [0, 0],
      [4, 4],
    ] as const) {
      expect(restored.stateAt("red", x, z)).toBe(field.stateAt("red", x, z));
      expect(restored.stateAt("blue", x, z)).toBe(field.stateAt("blue", x, z));
    }
    expect(restored.knownCount("red")).toBe(field.knownCount("red"));
    expect(restored.groups().sort()).toEqual(["blue", "red"]);
  });

  it("exposes dense cell codes for minimap rendering", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    field.observeCircle("team", 0, 0, 3);
    field.observeCircle("team", 12, 12, 3);
    const snapshot = field.cells("team");
    expect(snapshot.cols).toBe(20);
    expect(snapshot.codes.length).toBe(20 * 20);
    expect(snapshot.codes[field.cellIndex(12, 12)]).toBe(2); // observed
    expect(snapshot.codes[field.cellIndex(0, 0)]).toBe(1); // remembered
  });

  it("resets a single group without touching others", () => {
    const field = createVisibilityField({ bounds: BOUNDS, cellSize: 2 });
    field.observeCircle("a", 0, 0, 2);
    field.observeCircle("b", 8, 8, 2);
    field.reset("a");
    expect(field.isKnown("a", 0, 0)).toBe(false);
    expect(field.isKnown("b", 8, 8)).toBe(true);
  });
});
