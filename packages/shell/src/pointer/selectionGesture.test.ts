import { describe, expect, test } from "bun:test";

import {
  isSelectDoubleClick,
  resolveClickSelection,
  resolveMarqueeSelection,
  SELECT_DOUBLE_CLICK_MS,
} from "./selectionGesture";

const kinds: Record<string, string> = { a: "worker", b: "worker", c: "tank", d: "worker" };
const kindOf = (id: string) => kinds[id] ?? null;
const onScreen = () => ["a", "b", "c"];
const click = (hit: string | null, current: string[], additive = false, sameKind = false, withKinds = true) =>
  resolveClickSelection({ hit, current, additive, sameKind, kindOf: withKinds ? kindOf : undefined, onScreen });

describe("resolveClickSelection", () => {
  test("plain click replaces with the hit and ground clears", () => {
    expect(click("c", ["a", "b"])).toEqual(["c"]);
    expect(click(null, ["a"])).toEqual([]);
  });

  test("Shift toggles the hit and Shift on ground keeps the selection", () => {
    expect(click("c", ["a"], true)).toEqual(["a", "c"]);
    expect(click("a", ["a", "c"], true)).toEqual(["c"]);
    expect(click(null, ["a"], true)).toEqual(["a"]);
  });

  test("same-kind selects the on-screen kind, Shift adds it, and no kind falls back to a plain click", () => {
    expect(click("a", [], false, true)).toEqual(["a", "b"]);
    expect(click("a", ["c"], true, true)).toEqual(["c", "a", "b"]);
    expect(click("d", [], false, true)).toEqual(["d", "a", "b"]);
    expect(click("a", ["c"], false, true, false)).toEqual(["a"]);
    expect(click("e", ["c"], false, true)).toEqual(["e"]);
  });
});

describe("resolveMarqueeSelection", () => {
  test("replaces, or with Shift adds without duplicates", () => {
    expect(resolveMarqueeSelection(["b"], ["a"], false)).toEqual(["b"]);
    expect(resolveMarqueeSelection(["a", "b"], ["a", "c"], true)).toEqual(["a", "c", "b"]);
  });
});

describe("isSelectDoubleClick", () => {
  const first = { entity: "a", at: 1000, x: 10, y: 10 };
  test("needs the same entity inside the window and slop", () => {
    expect(isSelectDoubleClick(null, first)).toBe(false);
    expect(isSelectDoubleClick(first, { ...first, at: 1000 + SELECT_DOUBLE_CLICK_MS })).toBe(true);
    expect(isSelectDoubleClick(first, { ...first, at: 1001 + SELECT_DOUBLE_CLICK_MS })).toBe(false);
    expect(isSelectDoubleClick(first, { ...first, entity: "b", at: 1100 })).toBe(false);
    expect(isSelectDoubleClick(first, { ...first, x: 30, at: 1100 })).toBe(false);
    expect(isSelectDoubleClick({ ...first, entity: null }, { ...first, entity: null, at: 1100 })).toBe(false);
  });
});
