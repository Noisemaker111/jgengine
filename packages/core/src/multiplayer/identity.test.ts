import { describe, expect, test } from "bun:test";

import { resolveGuestSession, sessionPlayer } from "./identity";

describe("resolveGuestSession", () => {
  test("same seed yields the same stable anon id", () => {
    const first = resolveGuestSession("machine-a");
    const second = resolveGuestSession("machine-a");
    expect(first.userId).toBe(second.userId);
    expect(first.userId.startsWith("guest_")).toBe(true);
    expect(first.displayName).toBe(second.displayName);
  });

  test("different seeds yield different ids", () => {
    expect(resolveGuestSession("machine-a").userId).not.toBe(resolveGuestSession("machine-b").userId);
  });

  test("missing or blank seed falls back to the local default", () => {
    expect(resolveGuestSession().userId).toBe(resolveGuestSession("  ").userId);
    expect(resolveGuestSession().userId).toBe(resolveGuestSession("local").userId);
  });
});

describe("sessionPlayer", () => {
  test("maps a session onto the createGameContext player seam", () => {
    expect(sessionPlayer({ userId: "u1", isNew: true })).toEqual({ userId: "u1", isNew: true });
    expect(sessionPlayer({ userId: "u2" })).toEqual({ userId: "u2", isNew: false });
  });
});
