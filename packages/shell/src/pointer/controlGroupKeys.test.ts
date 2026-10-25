import { describe, expect, test } from "bun:test";

import { createSelectionSet } from "@jgengine/core/scene/selection";
import { createSelectionBookmarks } from "@jgengine/core/scene/selectionBookmarks";

import { controlGroupDigit, createControlGroupKeys, groupCentroid } from "./controlGroupKeys";

function rig(alive = new Set(["a", "b", "c"])) {
  let clock = 0;
  const focused: string[][] = [];
  const groups = createSelectionBookmarks();
  const selection = createSelectionSet();
  const keys = createControlGroupKeys({
    groups,
    selection,
    isValid: (id) => alive.has(id),
    focus: (ids) => focused.push([...ids]),
    now: () => clock,
  });
  return { keys, groups, selection, focused, alive, at: (ms: number) => { clock = ms; } };
}

describe("controlGroupDigit", () => {
  test("reads top-row and numpad digits only", () => {
    expect(controlGroupDigit("Digit3")).toBe(3);
    expect(controlGroupDigit("Numpad0")).toBe(0);
    expect(controlGroupDigit("KeyA")).toBeNull();
    expect(controlGroupDigit("NumpadAdd")).toBeNull();
  });
});

describe("createControlGroupKeys", () => {
  test("Ctrl binds, Shift appends, a digit recalls and a quick second tap focuses", () => {
    const t = rig();
    t.selection.replace(["a"]);
    expect(t.keys.handle({ code: "Digit1", ctrlKey: true })).toBe(true);
    t.selection.replace(["b"]);
    expect(t.keys.handle({ code: "Digit1", shiftKey: true })).toBe(true);
    expect(t.groups.recall("1")).toEqual(["a", "b"]);
    t.selection.clear();
    t.at(1000);
    t.keys.handle({ code: "Digit1" });
    expect(t.selection.list()).toEqual(["a", "b"]);
    expect(t.focused).toEqual([]);
    t.at(1200);
    t.keys.handle({ code: "Digit1" });
    expect(t.focused).toEqual([["a", "b"]]);
    t.at(2000);
    t.keys.handle({ code: "Digit1" });
    expect(t.focused.length).toBe(1);
  });

  test("recall prunes dead ids, an empty group leaves the selection alone, and Alt or other keys pass through", () => {
    const t = rig();
    t.selection.replace(["a", "c"]);
    t.keys.handle({ code: "Digit2", metaKey: true });
    t.alive.delete("a");
    t.selection.replace(["b"]);
    t.keys.handle({ code: "Digit2" });
    expect(t.selection.list()).toEqual(["c"]);
    t.alive.delete("c");
    t.selection.replace(["b"]);
    expect(t.keys.handle({ code: "Digit2" })).toBe(true);
    expect(t.selection.list()).toEqual(["b"]);
    expect(t.groups.has("2")).toBe(false);
    expect(t.keys.handle({ code: "Digit2", altKey: true })).toBe(false);
    expect(t.keys.handle({ code: "KeyQ" })).toBe(false);
  });

  test("key repeat is swallowed without acting", () => {
    const t = rig();
    t.selection.replace(["a"]);
    t.keys.handle({ code: "Digit5", ctrlKey: true });
    t.at(0);
    t.keys.handle({ code: "Digit5" });
    t.keys.handle({ code: "Digit5", repeat: true });
    expect(t.focused).toEqual([]);
  });
});

describe("groupCentroid", () => {
  test("averages resolvable ground positions", () => {
    const positions: Record<string, [number, number, number]> = { a: [0, 5, 0], b: [4, 0, 8] };
    expect(groupCentroid(["a", "b", "gone"], (id) => positions[id] ?? null)).toEqual({ x: 2, z: 4 });
    expect(groupCentroid(["gone"], () => null)).toBeNull();
  });
});
