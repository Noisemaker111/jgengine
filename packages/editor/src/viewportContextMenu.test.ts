import { describe, expect, test } from "bun:test";

import {
  RIGHT_CLICK_SLOP_PX,
  buildEditorContextMenu,
  isPointerClick,
} from "./viewportContextMenu";

describe("isPointerClick", () => {
  test("true at origin and within threshold", () => {
    expect(isPointerClick(10, 20, 10, 20)).toBe(true);
    expect(isPointerClick(0, 0, RIGHT_CLICK_SLOP_PX, 0)).toBe(true);
    expect(isPointerClick(0, 0, 3, 2)).toBe(true);
  });

  test("false past threshold so orbit drag does not open the menu", () => {
    expect(isPointerClick(0, 0, RIGHT_CLICK_SLOP_PX + 1, 0)).toBe(false);
    expect(isPointerClick(100, 100, 120, 100)).toBe(false);
  });

  test("respects a custom threshold", () => {
    expect(isPointerClick(0, 0, 5, 0, 6)).toBe(true);
    expect(isPointerClick(0, 0, 5, 0, 4)).toBe(false);
  });
});

describe("buildEditorContextMenu", () => {
  test("selection-aware object verbs when something is hit or selected", () => {
    const actions = buildEditorContextMenu({
      hitId: "spawn_1",
      selection: ["spawn_1"],
      canPaste: false,
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("frame");
    expect(ids).toContain("duplicate");
    expect(ids).toContain("delete");
    expect(ids).toContain("createPrefab");
    expect(ids).toContain("copy");
    expect(ids).not.toContain("addMarker");
    expect(actions.find((a) => a.id === "paste")?.disabled).toBe(true);
  });

  test("empty-ground verbs when nothing is selected or hit", () => {
    const actions = buildEditorContextMenu({
      hitId: null,
      selection: [],
      canPaste: true,
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("paste");
    expect(ids).toContain("addMarker");
    expect(ids).toContain("addVolume");
    expect(ids).toContain("addPath");
    expect(ids).toContain("addNote");
    expect(ids).toContain("openAssets");
    expect(ids).toContain("frameAll");
    expect(ids).not.toContain("duplicate");
    expect(ids).not.toContain("delete");
    expect(actions.find((a) => a.id === "paste")?.disabled).toBe(false);
  });

  test("hit without prior selection still yields object verbs", () => {
    const actions = buildEditorContextMenu({
      hitId: "zone_a",
      selection: [],
      canPaste: false,
    });
    expect(actions.map((a) => a.id)).toContain("frame");
    expect(actions.map((a) => a.id)).toContain("delete");
  });

  test("offers Unparent when canUnparent is set", () => {
    const withParent = buildEditorContextMenu({
      hitId: "child",
      selection: ["child"],
      canPaste: false,
      canUnparent: true,
    });
    expect(withParent.map((a) => a.id)).toContain("unparent");
    const without = buildEditorContextMenu({
      hitId: "child",
      selection: ["child"],
      canPaste: false,
      canUnparent: false,
    });
    expect(without.map((a) => a.id)).not.toContain("unparent");
  });

  test("always offers Parent to… for object verbs", () => {
    const actions = buildEditorContextMenu({
      hitId: "spawn_1",
      selection: ["spawn_1"],
      canPaste: false,
    });
    expect(actions.map((a) => a.id)).toContain("parentTo");
    expect(actions.find((a) => a.id === "parentTo")?.label).toBe("Parent to…");
  });
});
