import { describe, expect, test } from "bun:test";
import {
  attackMeta,
  counters,
  hasAnyTag,
  hasTag,
  isBlockable,
  isDodgeable,
  isParryable,
} from "@jgengine/core/combat/attackTags";

describe("attack tags", () => {
  test("tag membership", () => {
    const meta = attackMeta(["thrust", "unblockable"], { effect: "pierce", power: 2 });
    expect(hasTag(meta, "thrust")).toBe(true);
    expect(hasTag(meta, "sweep")).toBe(false);
    expect(hasAnyTag(meta, ["sweep", "unblockable"])).toBe(true);
    expect(meta.effect).toBe("pierce");
  });

  test("unblockable cannot be blocked but can be parried or dodged", () => {
    const fury = attackMeta(["unblockable"]);
    expect(isBlockable(fury)).toBe(false);
    expect(isParryable(fury)).toBe(true);
    expect(isDodgeable(fury)).toBe(true);
  });

  test("grab defeats block, parry and dodge", () => {
    const grab = attackMeta(["grab"]);
    expect(isBlockable(grab)).toBe(false);
    expect(isParryable(grab)).toBe(false);
    expect(isDodgeable(grab)).toBe(false);
  });

  test("counter moves match their tag", () => {
    expect(counters(attackMeta(["thrust"]), "mikiri")).toBe(true);
    expect(counters(attackMeta(["sweep"]), "mikiri")).toBe(false);
    expect(counters(attackMeta(["sweep"]), "sidestep")).toBe(true);
  });
});
