import { describe, expect, test } from "bun:test";

import {
  actionByHotkey,
  actionCooldown,
  actionCooldownFromFraction,
  actionCost,
  moveGridFocus,
  resolveAction,
  resolveActionCollection,
  type ActionDef,
} from "@jgengine/core/ui/actionModel";

describe("actionCooldown", () => {
  test("computes remaining fraction and readiness", () => {
    expect(actionCooldown(1500, 3000)).toEqual({ remainingMs: 1500, totalMs: 3000, fraction: 0.5, ready: false });
    expect(actionCooldown(0, 3000).ready).toBe(true);
    expect(actionCooldown(-5, 0)).toEqual({ remainingMs: 0, totalMs: 0, fraction: 0, ready: true });
  });

  test("fraction form derives a total from a known remaining fraction", () => {
    const cd = actionCooldownFromFraction(1000, 0.25);
    expect(cd.totalMs).toBe(4000);
    expect(cd.fraction).toBe(0.25);
    expect(cd.ready).toBe(false);
    expect(actionCooldownFromFraction(0, 0).ready).toBe(true);
  });
});

describe("actionCost", () => {
  test("met is true when availability is unknown", () => {
    expect(actionCost("mana", 40)).toEqual({ resourceId: "mana", amount: 40, met: true });
  });
  test("met reflects a known pool", () => {
    expect(actionCost("mana", 40, 100).met).toBe(true);
    expect(actionCost("mana", 40, 10).met).toBe(false);
    expect(actionCost("mana", 40, 10).available).toBe(10);
  });
});

describe("resolveAction", () => {
  test("an unblocked action is enabled with no reasons", () => {
    const resolved = resolveAction({ id: "move", label: "Move", hotkey: "M" });
    expect(resolved.enabled).toBe(true);
    expect(resolved.reasons).toEqual([]);
    expect(resolved.label).toBe("Move");
  });

  test("label falls back to id and active/icon carry through", () => {
    const resolved = resolveAction({ id: "hold", icon: "shield", active: true });
    expect(resolved.label).toBe("hold");
    expect(resolved.active).toBe(true);
    expect(resolved.icon).toBe("shield");
  });

  test("orders reasons cooldown, then cost, then caller, then generic disable", () => {
    const def: ActionDef = {
      id: "nuke",
      cooldown: actionCooldown(2000, 4000),
      costs: [actionCost("energy", 50, 10)],
      reasons: [{ code: "range", message: "Out of range" }],
    };
    const resolved = resolveAction(def);
    expect(resolved.enabled).toBe(false);
    expect(resolved.reasons.map((r) => r.code)).toEqual(["cooldown", "cost", "range"]);
  });

  test("hard disabled with no derived reason gets a generic reason", () => {
    const resolved = resolveAction({ id: "build", disabled: true });
    expect(resolved.enabled).toBe(false);
    expect(resolved.reasons).toEqual([{ code: "disabled", message: "Unavailable" }]);
  });

  test("a ready cooldown does not block", () => {
    const resolved = resolveAction({ id: "cast", cooldown: actionCooldown(0, 4000) });
    expect(resolved.enabled).toBe(true);
    expect(resolved.cooldown?.ready).toBe(true);
  });
});

describe("actionByHotkey", () => {
  const actions = resolveActionCollection([
    { id: "a", hotkey: "Q" },
    { id: "b", hotkey: "W" },
  ]);
  test("matches case-insensitively", () => {
    expect(actionByHotkey(actions, "q")).toBe("a");
    expect(actionByHotkey(actions, "W")).toBe("b");
  });
  test("returns null when no hotkey matches", () => {
    expect(actionByHotkey(actions, "z")).toBeNull();
  });
});

describe("moveGridFocus", () => {
  // 5 items, 3 columns:  [0 1 2]
  //                      [3 4  ]
  test("right/left move within a row and clamp at edges", () => {
    expect(moveGridFocus(0, 5, 3, "right")).toBe(1);
    expect(moveGridFocus(2, 5, 3, "right")).toBe(2); // row end, no wrap
    expect(moveGridFocus(1, 5, 3, "left")).toBe(0);
    expect(moveGridFocus(0, 5, 3, "left")).toBe(0);
  });

  test("down/up move across rows and stay put past the grid", () => {
    expect(moveGridFocus(0, 5, 3, "down")).toBe(3);
    expect(moveGridFocus(2, 5, 3, "down")).toBe(2); // no item below col 2
    expect(moveGridFocus(3, 5, 3, "up")).toBe(0);
  });

  test("next/prev walk the flat order and clamp", () => {
    expect(moveGridFocus(4, 5, 3, "next")).toBe(4);
    expect(moveGridFocus(0, 5, 3, "prev")).toBe(0);
    expect(moveGridFocus(-1, 5, 3, "next")).toBe(0);
    expect(moveGridFocus(-1, 5, 3, "prev")).toBe(4);
  });

  test("wrap option cycles at edges", () => {
    expect(moveGridFocus(4, 5, 3, "next", { wrap: true })).toBe(0);
    expect(moveGridFocus(0, 5, 3, "prev", { wrap: true })).toBe(4);
    expect(moveGridFocus(2, 5, 3, "right", { wrap: true })).toBe(0);
  });

  test("first/last jump to the ends and empty stays at -1", () => {
    expect(moveGridFocus(2, 5, 3, "first")).toBe(0);
    expect(moveGridFocus(2, 5, 3, "last")).toBe(4);
    expect(moveGridFocus(0, 0, 3, "next")).toBe(-1);
  });
});
