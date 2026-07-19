import { describe, expect, test } from "bun:test";

import {
  closePanel,
  closeTopPanel,
  createPanelState,
  focusPanel,
  isOpen,
  movePanel,
  openPanel,
  orderedOpen,
  panelByHotkey,
  togglePanel,
  type PanelDef,
} from "@jgengine/core/ui/panelModel";

const DEFS: PanelDef[] = [
  { id: "bag", title: "Bags", hotkey: "KeyB" },
  { id: "char", title: "Character", hotkey: "KeyC", group: "center" },
  { id: "spellbook", title: "Spellbook", hotkey: "KeyP", group: "center" },
  { id: "hud", title: "Unit Frames", initial: true, closable: false },
];

describe("createPanelState", () => {
  test("only `initial` panels start open", () => {
    const state = createPanelState(DEFS);
    expect(isOpen(state, "hud")).toBe(true);
    expect(isOpen(state, "bag")).toBe(false);
    expect(orderedOpen(state, DEFS).map((d) => d.id)).toEqual(["hud"]);
  });

  test("is serializable JSON with no functions", () => {
    const state = createPanelState(DEFS);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("open / close / toggle", () => {
  test("open marks a panel open and returns a new state", () => {
    const start = createPanelState(DEFS);
    const next = openPanel(start, "bag");
    expect(isOpen(next, "bag")).toBe(true);
    expect(isOpen(start, "bag")).toBe(false); // immutable
  });

  test("close removes it but keeps a remembered position", () => {
    let state = openPanel(createPanelState(DEFS), "bag");
    state = movePanel(state, "bag", { x: 120, y: 40 });
    state = closePanel(state, "bag");
    expect(isOpen(state, "bag")).toBe(false);
    expect(state.pos.bag).toEqual({ x: 120, y: 40 });
    expect(openPanel(state, "bag").pos.bag).toEqual({ x: 120, y: 40 });
  });

  test("close is a no-op on an already-closed panel", () => {
    const state = createPanelState(DEFS);
    expect(closePanel(state, "bag")).toBe(state);
  });

  test("toggle flips open/closed", () => {
    let state = createPanelState(DEFS);
    state = togglePanel(state, "bag");
    expect(isOpen(state, "bag")).toBe(true);
    state = togglePanel(state, "bag");
    expect(isOpen(state, "bag")).toBe(false);
  });
});

describe("z-order / focus", () => {
  test("opening later panels raises them above earlier ones", () => {
    let state = createPanelState(DEFS);
    state = openPanel(state, "bag");
    state = openPanel(state, "char");
    // hud opened first, then bag, then char -> ascending z render order
    expect(orderedOpen(state, DEFS).map((d) => d.id)).toEqual(["hud", "bag", "char"]);
  });

  test("focus raises an open panel to the top", () => {
    let state = openPanel(createPanelState(DEFS), "bag");
    state = openPanel(state, "char"); // char now on top
    state = focusPanel(state, "bag"); // bag back on top
    const order = orderedOpen(state, DEFS).map((d) => d.id);
    expect(order[order.length - 1]).toBe("bag");
  });

  test("focus on the top panel is a no-op (stable state)", () => {
    let state = openPanel(createPanelState(DEFS), "bag");
    state = openPanel(state, "char");
    expect(focusPanel(state, "char")).toBe(state);
  });

  test("focus on a closed panel is a no-op", () => {
    const state = createPanelState(DEFS);
    expect(focusPanel(state, "bag")).toBe(state);
  });
});

describe("group exclusivity", () => {
  test("opening one panel in a group closes the others", () => {
    let state = createPanelState(DEFS);
    state = openPanel(state, "char");
    expect(isOpen(state, "char")).toBe(true);
    state = openPanel(state, "spellbook");
    expect(isOpen(state, "spellbook")).toBe(true);
    expect(isOpen(state, "char")).toBe(false); // same "center" group
    // ungrouped panels are unaffected
    state = openPanel(state, "bag");
    expect(isOpen(state, "spellbook")).toBe(true);
    expect(isOpen(state, "bag")).toBe(true);
  });

  test("toggle respects group exclusivity too", () => {
    let state = togglePanel(createPanelState(DEFS), "char");
    state = togglePanel(state, "spellbook");
    expect(isOpen(state, "char")).toBe(false);
    expect(isOpen(state, "spellbook")).toBe(true);
  });
});

describe("closeTopPanel (ESC)", () => {
  test("closes the focused (topmost) closable panel", () => {
    let state = createPanelState(DEFS);
    state = openPanel(state, "bag");
    state = openPanel(state, "char"); // char is on top
    state = closeTopPanel(state);
    expect(isOpen(state, "char")).toBe(false);
    expect(isOpen(state, "bag")).toBe(true);
  });

  test("skips panels pinned with closable:false", () => {
    const state = createPanelState(DEFS); // only the non-closable "hud" is open
    expect(closeTopPanel(state)).toBe(state);
  });

  test("closes closable windows but never the pinned one underneath", () => {
    let state = createPanelState(DEFS); // hud (pinned) open
    state = openPanel(state, "bag");
    state = closeTopPanel(state); // closes bag
    expect(isOpen(state, "bag")).toBe(false);
    expect(closeTopPanel(state)).toBe(state); // hud stays pinned
    expect(isOpen(state, "hud")).toBe(true);
  });
});

describe("panelByHotkey", () => {
  test("matches a code or key case-insensitively", () => {
    expect(panelByHotkey(DEFS, "KeyB")).toBe("bag");
    expect(panelByHotkey(DEFS, "keyc")).toBe("char");
  });

  test("returns null when no hotkey matches", () => {
    expect(panelByHotkey(DEFS, "KeyZ")).toBeNull();
  });
});

describe("movePanel", () => {
  test("records a position override immutably", () => {
    const start = createPanelState(DEFS);
    const next = movePanel(start, "bag", { x: 10, y: 20 });
    expect(next.pos.bag).toEqual({ x: 10, y: 20 });
    expect(start.pos.bag).toBeUndefined();
  });
});
