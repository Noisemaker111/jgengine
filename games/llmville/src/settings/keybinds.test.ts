import { describe, expect, test } from "bun:test";

import { DEFAULT_APP_KEYBINDS, keybindRebindSession, keybindsFromSession } from "./keybinds";

describe("keybind rebind session", () => {
  test("the default keys share only across contexts, so the menu shows no conflict", () => {
    expect(keybindRebindSession(DEFAULT_APP_KEYBINDS).hasConflicts()).toBe(false);
  });

  test("a captured key keeps the alternate key and round-trips into keybinds", () => {
    const session = keybindRebindSession(DEFAULT_APP_KEYBINDS);
    session.beginCapture("jump");
    session.capture("KeyQ");
    session.beginCapture("moveForward");
    session.capture("KeyR");
    const keybinds = keybindsFromSession(session);
    expect(keybinds.jump).toEqual({ primary: "KeyQ", secondary: null });
    expect(keybinds.moveForward).toEqual({ primary: "KeyR", secondary: "ArrowUp" });
    expect(keybindsFromSession(keybindRebindSession(keybinds))).toEqual(keybinds);
  });

  test("a key the game cannot bind keeps the action's default", () => {
    const session = keybindRebindSession(DEFAULT_APP_KEYBINDS);
    session.beginCapture("interact");
    session.capture("KeyZ");
    expect(keybindsFromSession(session).interact).toEqual(DEFAULT_APP_KEYBINDS.interact);
  });

  test("two walking actions on one key are flagged", () => {
    const session = keybindRebindSession(DEFAULT_APP_KEYBINDS);
    session.beginCapture("jump");
    session.capture("KeyW");
    expect(session.row("jump")?.conflictWith).toEqual(["moveForward"]);
  });
});
