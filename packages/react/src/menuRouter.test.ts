import { describe, expect, test } from "bun:test";

import { menuStackReducer, type MenuStackAction } from "./menuRouter";

type Screen = "title" | "saves" | "settings" | "credits";

const ROOT: Screen = "title";

function run(actions: readonly MenuStackAction<Screen>[]): readonly Screen[] {
  return actions.reduce<readonly Screen[]>((path, action) => menuStackReducer(path, action, ROOT), [ROOT]);
}

describe("menuStackReducer", () => {
  test("open pushes and back pops one screen at a time", () => {
    expect(run([{ type: "open", id: "saves" }, { type: "open", id: "settings" }])).toEqual([
      "title",
      "saves",
      "settings",
    ]);
    expect(run([{ type: "open", id: "saves" }, { type: "open", id: "settings" }, { type: "back" }])).toEqual([
      "title",
      "saves",
    ]);
  });

  test("back at the root is a no-op and keeps the same array", () => {
    const path: readonly Screen[] = [ROOT];
    expect(menuStackReducer(path, { type: "back" }, ROOT)).toBe(path);
  });

  test("opening the current screen again does not deepen the stack", () => {
    expect(run([{ type: "open", id: "saves" }, { type: "open", id: "saves" }])).toEqual(["title", "saves"]);
  });

  test("replace swaps the top without deepening", () => {
    expect(run([{ type: "open", id: "saves" }, { type: "replace", id: "credits" }])).toEqual(["title", "credits"]);
  });

  test("reset collapses to the original root, or to a named one", () => {
    expect(run([{ type: "open", id: "saves" }, { type: "open", id: "settings" }, { type: "reset" }])).toEqual(["title"]);
    expect(run([{ type: "open", id: "saves" }, { type: "reset", id: "settings" }])).toEqual(["settings"]);
  });

  test("replace at the root swaps the root itself", () => {
    expect(run([{ type: "replace", id: "credits" }])).toEqual(["credits"]);
  });
});
