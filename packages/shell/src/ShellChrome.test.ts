import { describe, expect, test } from "bun:test";
import { createShellKeyHandlers } from "./ShellChrome";

function keyboard(active: boolean) {
  const down: string[] = [];
  let resets = 0;
  let prevented = 0;
  let devtools = 0;
  const held = { current: false };
  const handlers = createShellKeyHandlers({
    f2HeldRef: held,
    tracker: { handleDown: (code) => down.push(code), handleUp() {}, reset: () => { resets++; } },
    devtoolsEnabled: true,
    setDevtoolsOpen: () => { devtools++; },
    controlsActive: () => active,
  });
  return { handlers, down, held, counts: () => ({ resets, prevented, devtools }),
    press(code: string, target?: EventTarget) { handlers.onKeyDown({ code, target, preventDefault: () => { prevented++; } }); } };
}

function within(selector: string): EventTarget {
  const target = { closest: (query: string) => query.includes(selector) ? target : null };
  return target as unknown as EventTarget;
}

describe("shell keyboard ownership", () => {
  test("keeps Tab and Space available when gameplay controls are inactive", () => {
    const keys = keyboard(false);
    keys.press("Tab");
    keys.press("Space");
    expect(keys.counts().prevented).toBe(0);
    expect(keys.down).toEqual([]);
  });

  test("preserves Tab and Space gameplay bindings on the play surface", () => {
    const keys = keyboard(true);
    keys.press("Tab");
    keys.press("Space");
    keys.press("KeyA");
    expect(keys.counts().prevented).toBe(2);
    expect(keys.down).toEqual(["Tab", "Space", "KeyA"]);
  });

  test("leaves keyboard navigation and activation to interactive HUD controls", () => {
    for (const selector of ["button", "a[href]", '[role="dialog"]', '[role="menu"]', '[role="listbox"]', '[role="grid"]', '[role="gridcell"]', '[role="toolbar"]']) {
      const keys = keyboard(true);
      keys.press("Tab", within(selector));
      keys.press("Space", within(selector));
      keys.press("Enter", within(selector));
      expect(keys.counts().prevented).toBe(0);
      expect(keys.down).toEqual([]);
      expect(keys.counts().resets).toBe(3);
    }
  });

  test("a consumer's prevented key retires gameplay input without claiming the key again", () => {
    const keys = keyboard(true);
    keys.press("KeyA");
    keys.handlers.onKeyDown({ code: "Space", defaultPrevented: true, preventDefault: () => { throw new Error("Key already owned"); } });
    expect(keys.down).toEqual(["KeyA"]);
    expect(keys.counts().resets).toBe(1);
    keys.handlers.onKeyDown({ code: "F2", defaultPrevented: true, preventDefault: () => { throw new Error("Chord already owned"); } });
    expect(keys.held.current).toBe(false);
  });

  test("retains text entry suspension and the F2 devtools chord", () => {
    const typing = keyboard(true);
    typing.press("F2", within("input"));
    expect(typing.held.current).toBe(false);
    expect(typing.counts().resets).toBe(1);
    const keys = keyboard(true);
    keys.press("F2", within("button"));
    keys.press("KeyD", within("button"));
    expect(keys.counts().devtools).toBe(1);
    expect(keys.counts().prevented).toBe(2);
    keys.handlers.onKeyUp({ code: "F2", target: within("button") });
    expect(keys.held.current).toBe(false);
  });
});
