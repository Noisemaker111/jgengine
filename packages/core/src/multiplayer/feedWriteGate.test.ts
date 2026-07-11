import { describe, expect, test } from "bun:test";

import { createFeedWriteGate, validateFeedWrite } from "./feedWriteGate";

describe("validateFeedWrite", () => {
  test("rejects all client writes when no allowlist is configured", () => {
    expect(validateFeedWrite(undefined, "kill")).toEqual({
      ok: false,
      reason: "client feed writes are disabled",
    });
    expect(validateFeedWrite(createFeedWriteGate(), "kill")).toEqual({
      ok: false,
      reason: "client feed writes are disabled",
    });
  });

  test("rejects actions outside the allowlist", () => {
    const gate = createFeedWriteGate(["kill", "entity.died"]);
    expect(validateFeedWrite(gate, "loot.forge")).toEqual({
      ok: false,
      reason: "feed action not allowed: loot.forge",
    });
  });

  test("accepts allowlisted actions", () => {
    const gate = createFeedWriteGate(["kill"]);
    expect(validateFeedWrite(gate, "kill")).toEqual({ ok: true });
  });
});
