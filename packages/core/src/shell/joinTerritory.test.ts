import { createShellKeyHandlers } from "./ShellChrome.draw";
import { expect, test } from "bun:test";

import { JoinGate } from "@jgengine/core/multiplayer/JoinGate.view";

test("failed join blocks children and renders a retry action", () => {
  const html = JSON.stringify(JoinGate({ status: "failed", failureReason: "full", retry: () => {}, children: "gameplay" }));
  expect(html).not.toContain("gameplay");
  expect(html).toContain("Unable to join");
  expect(html).toContain("Retry");
  expect(html).toContain("full");
});

test("typing resets held gameplay actions without consuming spaces or devtools hotkeys", () => {
  const actions: string[] = [];
  let resets = 0;
  let prevented = 0;
  const f2HeldRef = { current: true };
  const keys = createShellKeyHandlers({ f2HeldRef, tracker: { handleDown: (code) => actions.push(code), handleUp: () => {}, reset: () => { resets += 1; } }, devtoolsEnabled: true, setDevtoolsOpen: () => { throw new Error("Typing opened devtools"); }, controlsActive: () => true });
  const target = { closest: () => ({}) } as unknown as EventTarget;
  keys.onKeyDown({ code: "Space", target, preventDefault: () => { prevented += 1; } });
  keys.onKeyDown({ code: "KeyD", target, preventDefault: () => { prevented += 1; } });
  expect(actions).toEqual([]);
  expect(resets).toBe(2);
  expect(prevented).toBe(0);
  expect(f2HeldRef.current).toBe(false);
});
