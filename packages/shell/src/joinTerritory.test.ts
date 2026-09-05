import { createShellKeyHandlers } from "./ShellChrome";
import { expect, test } from "bun:test";

import { JoinGate } from "./JoinGate";
import { TerritoryOverlay } from "./TerritoryOverlay";

test("failed join blocks children and renders a retry action", () => {
  const html = JSON.stringify(JoinGate({ status: "failed", failureReason: "full", retry: () => {}, children: "gameplay" }));
  expect(html).not.toContain("gameplay");
  expect(html).toContain('"role":"alert"');
  expect(html).toContain("Retry");
  expect(html).toContain("full");
});
test("territory feedback distinguishes blocked land from unaffordable claims", () => {
  const props = { cells: [{ key: "0,0", x: 0, z: 0, status: "claimable" as const }], cost: 50, affordable: false };
  expect(JSON.stringify(TerritoryOverlay(props))).toContain("Insufficient funds");
  expect(JSON.stringify(TerritoryOverlay({ ...props, cells: [{ ...props.cells[0]!, status: "blocked" }] }))).toContain("Land unavailable");
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
