import { describe, expect, test } from "bun:test";

import {
  menuIntentForPadAxis,
  menuIntentForPadButton,
  menuIntentForKey,
  menuNavIdAt,
  menuNavIndex,
  menuNavMove,
  shouldRepeatMenuNav,
} from "@jgengine/core/ui/menuNav";

describe("menuNavMove", () => {
  test("a vertical list moves one item and wraps", () => {
    const layout = { count: 4 };
    expect(menuNavMove(1, "down", layout)).toBe(2);
    expect(menuNavMove(3, "down", layout)).toBe(0);
    expect(menuNavMove(0, "up", layout)).toBe(3);
    expect(menuNavMove(1, "left", layout)).toBe(1);
  });

  test("wrap:false stops at the ends instead of looping", () => {
    const layout = { count: 4, wrap: false };
    expect(menuNavMove(3, "down", layout)).toBe(3);
    expect(menuNavMove(0, "up", layout)).toBe(0);
  });

  test("a grid moves by column and keeps left/right inside the row", () => {
    const layout = { count: 6, columns: 3 };
    expect(menuNavMove(1, "down", layout)).toBe(4);
    expect(menuNavMove(4, "up", layout)).toBe(1);
    expect(menuNavMove(1, "right", layout)).toBe(2);
    expect(menuNavMove(2, "right", layout)).toBe(2);
    expect(menuNavMove(3, "left", layout)).toBe(3);
    expect(menuNavMove(0, "left", layout)).toBe(0);
  });

  test("a single horizontal row moves with left/right only", () => {
    const layout = { count: 3, columns: 3 };
    expect(menuNavMove(0, "right", layout)).toBe(1);
    expect(menuNavMove(0, "down", layout)).toBe(0);
  });

  test("first and last jump to the ends and skip disabled items", () => {
    const layout = { count: 4, disabled: [0, 3] };
    expect(menuNavMove(2, "first", layout)).toBe(1);
    expect(menuNavMove(1, "last", layout)).toBe(2);
  });

  test("moves skip disabled items without getting stuck", () => {
    const layout = { count: 4, disabled: [1, 2] };
    expect(menuNavMove(0, "down", layout)).toBe(3);
    expect(menuNavMove(3, "up", layout)).toBe(0);
  });

  test("a fully disabled list keeps the current index", () => {
    const layout = { count: 2, disabled: [0, 1] };
    expect(menuNavMove(0, "down", layout)).toBe(0);
    expect(menuNavMove(1, "first", layout)).toBe(1);
  });

  test("an empty list has no focus", () => {
    expect(menuNavMove(0, "down", { count: 0 })).toBe(-1);
  });
});

describe("menu intent mapping", () => {
  test("keyboard codes map to move, confirm and back", () => {
    expect(menuIntentForKey("ArrowUp")).toBe("up");
    expect(menuIntentForKey("KeyS")).toBe("down");
    expect(menuIntentForKey("Enter")).toBe("confirm");
    expect(menuIntentForKey("Space")).toBe("confirm");
    expect(menuIntentForKey("Escape")).toBe("back");
    expect(menuIntentForKey("Tab")).toBeNull();
    expect(menuIntentForKey("KeyQ")).toBeNull();
  });

  test("standard gamepad buttons map to the same intents", () => {
    expect(menuIntentForPadButton(0)).toBe("confirm");
    expect(menuIntentForPadButton(1)).toBe("back");
    expect(menuIntentForPadButton(12)).toBe("up");
    expect(menuIntentForPadButton(13)).toBe("down");
    expect(menuIntentForPadButton(14)).toBe("left");
    expect(menuIntentForPadButton(15)).toBe("right");
    expect(menuIntentForPadButton(4)).toBeNull();
  });

  test("sticks resolve to one direction past the deadzone", () => {
    expect(menuIntentForPadAxis(0, 0.8)).toBe("right");
    expect(menuIntentForPadAxis(0, -0.8)).toBe("left");
    expect(menuIntentForPadAxis(1, 0.8)).toBe("down");
    expect(menuIntentForPadAxis(1, -0.8)).toBe("up");
    expect(menuIntentForPadAxis(1, 0.2)).toBeNull();
    expect(menuIntentForPadAxis(2, 0.9)).toBeNull();
  });
});

describe("shouldRepeatMenuNav", () => {
  test("fires once on press, then waits for the repeat delay and interval", () => {
    expect(shouldRepeatMenuNav(1000, { pressedAt: 1000, lastFiredAt: null })).toBe(true);
    expect(shouldRepeatMenuNav(1100, { pressedAt: 1000, lastFiredAt: 1000 })).toBe(false);
    expect(shouldRepeatMenuNav(1400, { pressedAt: 1000, lastFiredAt: 1000 })).toBe(true);
    expect(shouldRepeatMenuNav(1450, { pressedAt: 1000, lastFiredAt: 1400 })).toBe(false);
    expect(shouldRepeatMenuNav(1520, { pressedAt: 1000, lastFiredAt: 1400 })).toBe(true);
  });
});

describe("focus order helpers", () => {
  test("ids resolve to an index and back", () => {
    const ids = ["new", "continue", "settings"];
    expect(menuNavIndex(ids, "continue")).toBe(1);
    expect(menuNavIndex(ids, "nope")).toBe(-1);
    expect(menuNavIndex(ids, null)).toBe(-1);
    expect(menuNavIdAt(ids, 2)).toBe("settings");
    expect(menuNavIdAt(ids, 9)).toBeNull();
  });
});
