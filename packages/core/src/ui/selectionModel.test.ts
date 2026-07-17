import { describe, expect, test } from "bun:test";

import {
  moveSelectionFocus,
  selectionWindow,
  summarizeSelection,
  type EntitySummaryDef,
} from "@jgengine/core/ui/selectionModel";

const roster: EntitySummaryDef[] = [
  { id: "m1", name: "Marine", kind: "marine", icon: "marine" },
  { id: "m2", name: "Marine", kind: "marine", icon: "marine" },
  { id: "t1", name: "Tank", kind: "tank", icon: "tank" },
  { id: "m3", name: "Marine", kind: "marine", icon: "marine" },
];

describe("summarizeSelection", () => {
  test("picks the first member as primary by default", () => {
    const view = summarizeSelection(roster);
    expect(view.count).toBe(4);
    expect(view.focusIndex).toBe(0);
    expect(view.primary?.id).toBe("m1");
  });

  test("primaryId wins over focusIndex and clamps a bad index", () => {
    expect(summarizeSelection(roster, { primaryId: "t1" }).focusIndex).toBe(2);
    expect(summarizeSelection(roster, { focusIndex: 99 }).focusIndex).toBe(3);
    expect(summarizeSelection(roster, { primaryId: "missing", focusIndex: 1 }).focusIndex).toBe(1);
  });

  test("buckets members by kind, ordered by count then label", () => {
    const view = summarizeSelection(roster, { labelOf: (k) => k.toUpperCase() });
    expect(view.groups.map((g) => [g.kind, g.count, g.label])).toEqual([
      ["marine", 3, "MARINE"],
      ["tank", 1, "TANK"],
    ]);
    expect(view.groups[0]?.ids).toEqual(["m1", "m2", "m3"]);
  });

  test("grouped flips true past the threshold", () => {
    expect(summarizeSelection(roster, { groupThreshold: 3 }).grouped).toBe(true);
    expect(summarizeSelection(roster, { groupThreshold: 4 }).grouped).toBe(false);
  });

  test("empty selection yields no primary and -1 focus", () => {
    const view = summarizeSelection([]);
    expect(view.count).toBe(0);
    expect(view.primary).toBeNull();
    expect(view.focusIndex).toBe(-1);
    expect(view.groups).toEqual([]);
  });

  test("missing kind falls back to a unit bucket", () => {
    const view = summarizeSelection([{ id: "x" }, { id: "y" }]);
    expect(view.groups).toEqual([{ kind: "unit", label: "unit", count: 2, ids: ["x", "y"] }]);
  });
});

describe("moveSelectionFocus", () => {
  test("steps with wrap and jumps to ends", () => {
    expect(moveSelectionFocus(4, 0, "next")).toBe(1);
    expect(moveSelectionFocus(4, 3, "next")).toBe(0);
    expect(moveSelectionFocus(4, 0, "prev")).toBe(3);
    expect(moveSelectionFocus(4, 2, "first")).toBe(0);
    expect(moveSelectionFocus(4, 2, "last")).toBe(3);
    expect(moveSelectionFocus(4, -1, "next")).toBe(0);
    expect(moveSelectionFocus(0, 0, "next")).toBe(-1);
  });
});

describe("selectionWindow", () => {
  const many: EntitySummaryDef[] = Array.from({ length: 100 }, (_, i) => ({ id: `u${i}` }));
  test("slices a size-length window and clamps the end", () => {
    const win = selectionWindow(many, 0, 10);
    expect(win.start).toBe(0);
    expect(win.end).toBe(10);
    expect(win.items).toHaveLength(10);
  });
  test("clamps the start so the window never runs past the end", () => {
    const win = selectionWindow(many, 200, 10);
    expect(win.start).toBe(90);
    expect(win.end).toBe(100);
    expect(win.items[0]?.id).toBe("u90");
  });
  test("handles a selection smaller than the window", () => {
    const win = selectionWindow(many.slice(0, 3), 5, 10);
    expect(win.start).toBe(0);
    expect(win.items).toHaveLength(3);
  });
});
