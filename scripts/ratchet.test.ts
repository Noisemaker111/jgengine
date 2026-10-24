import { describe, expect, test } from "bun:test";

import { evaluateRatchet } from "./ratchet";

const finding = (key: string, group?: string) => (group === undefined ? { key } : { key, group });

describe("evaluateRatchet", () => {
  test("a plain array baseline still excuses its known offenders", () => {
    const verdict = evaluateRatchet([finding("a"), finding("b")], { keys: ["a", "b"] });
    expect(verdict.added).toEqual([]);
    expect(verdict.fixed).toEqual([]);
  });

  test("an offender the baseline does not name is added, and the group rides along", () => {
    const verdict = evaluateRatchet([finding("a"), finding("b", "round-trip")], { keys: ["a"] });
    expect(verdict.added).toEqual([{ key: "b", group: "round-trip" }]);
  });

  test("a baselined key that no longer appears is fixed, so the list stays shrink-only", () => {
    const verdict = evaluateRatchet([finding("a")], { keys: ["b", "a"] });
    expect(verdict.fixed).toEqual(["b"]);
  });

  test("a group above its ceiling is reported with its members", () => {
    const verdict = evaluateRatchet([finding("a", "round-trip"), finding("b", "round-trip")], {
      ceilings: { "round-trip": 1 },
      keys: ["a", "b"],
    });
    expect(verdict.overCeilings).toEqual([
      { group: "round-trip", limit: 1, live: 2, findings: [finding("a", "round-trip"), finding("b", "round-trip")] },
    ]);
  });

  test("a group below its ceiling is slack, which forces the committed number down", () => {
    const verdict = evaluateRatchet([finding("a", "round-trip")], { ceilings: { "round-trip": 2 }, keys: ["a"] });
    expect(verdict.slackCeilings).toEqual([{ group: "round-trip", limit: 2, live: 1 }]);
  });

  test("ceilings ignore findings that belong to no group", () => {
    const verdict = evaluateRatchet([finding("a"), finding("b"), finding("c", "round-trip")], {
      ceilings: { "round-trip": 1 },
      keys: ["a", "b", "c"],
    });
    expect(verdict.overCeilings).toEqual([]);
    expect(verdict.slackCeilings).toEqual([]);
  });
});
