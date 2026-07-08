import { describe, expect, test } from "bun:test";

import { iconForAction, isGameIconName, GAME_ICON_NAMES } from "./icons";

describe("iconForAction", () => {
  test("maps the shipped games' action vocabulary to glyphs", () => {
    expect(iconForAction("jump")).toBe("jump");
    expect(iconForAction("sprint")).toBe("sprint");
    expect(iconForAction("interact")).toBe("hand");
    expect(iconForAction("useAbility")).toBe("lightning");
    expect(iconForAction("restart")).toBe("restart");
    expect(iconForAction("rotateCw")).toBe("rotateCw");
    expect(iconForAction("rotateCcw")).toBe("rotateCcw");
    expect(iconForAction("hardDrop")).toBe("hardDrop");
    expect(iconForAction("softDrop")).toBe("arrowDown");
    expect(iconForAction("hold")).toBe("swap");
    expect(iconForAction("shiftLeft")).toBe("arrowLeft");
    expect(iconForAction("shiftRight")).toBe("arrowRight");
    expect(iconForAction("endTurn")).toBe("skip");
    expect(iconForAction("startNewRun")).toBe("restart");
    expect(iconForAction("moveForward")).toBe("arrowUp");
    expect(iconForAction("moveBack")).toBe("arrowDown");
  });

  test("specific rules beat generic substrings", () => {
    expect(iconForAction("rotateLeft")).toBe("rotateCcw");
    expect(iconForAction("dropDown")).toBe("arrowDown");
    expect(iconForAction("useAbility")).not.toBe("hand");
  });

  test("unknown actions return null", () => {
    expect(iconForAction("frobnicate")).toBeNull();
  });

  test("every rule points at a real glyph", () => {
    for (const action of ["jump", "sprint", "hold", "restart", "ping", "pause", "menu", "confirm", "cancel"]) {
      const icon = iconForAction(action);
      expect(icon === null || isGameIconName(icon)).toBe(true);
      expect(icon).not.toBeNull();
    }
  });
});

describe("isGameIconName", () => {
  test("accepts catalog names and rejects strangers", () => {
    for (const name of GAME_ICON_NAMES) expect(isGameIconName(name)).toBe(true);
    expect(isGameIconName("notAnIcon")).toBe(false);
  });
});
