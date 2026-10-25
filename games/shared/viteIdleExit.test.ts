import { describe, expect, test } from "bun:test";

import { idleVerdict, resolveIdleExitMs } from "./viteIdleExit";

describe("idle game dev servers exit", () => {
  const base = { now: 0, lastActivity: 0, openSockets: 0, rootExists: true, idleMs: 60_000 };

  test("leaves after the idle window; an open socket keeps it", () => {
    expect(idleVerdict({ ...base, now: 59_999 })).toBe("keep");
    expect(idleVerdict({ ...base, now: 60_000 })).toBe("idle");
    expect(idleVerdict({ ...base, now: 600_000, openSockets: 1 })).toBe("keep");
    expect(idleVerdict({ ...base, now: 600_000, idleMs: 0 })).toBe("keep");
  });

  test("leaves at once when its folder is deleted", () => {
    expect(idleVerdict({ ...base, rootExists: false, openSockets: 2 })).toBe("orphaned");
  });

  test("JG_DEV_IDLE_MINUTES sets the window and 0 turns it off", () => {
    expect(resolveIdleExitMs({})).toBe(20 * 60_000);
    expect(resolveIdleExitMs({ JG_DEV_IDLE_MINUTES: "3" })).toBe(3 * 60_000);
    expect(resolveIdleExitMs({ JG_DEV_IDLE_MINUTES: "0" })).toBe(0);
  });
});
