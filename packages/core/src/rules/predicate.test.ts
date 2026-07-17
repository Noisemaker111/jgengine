import { describe, expect, test } from "bun:test";
import { evaluatePredicate, readPath, type Predicate } from "@jgengine/core/rules/predicate";

describe("readPath", () => {
  test("descends dot paths through plain objects", () => {
    const facts = { hit: { crit: true, amount: 42 }, attacker: { team: "red" } };
    expect(readPath(facts, "hit.crit")).toBe(true);
    expect(readPath(facts, "hit.amount")).toBe(42);
    expect(readPath(facts, "attacker.team")).toBe("red");
  });

  test("returns undefined for missing or non-traversable segments", () => {
    expect(readPath({ hit: { amount: 1 } }, "hit.crit")).toBeUndefined();
    expect(readPath({ hit: 5 }, "hit.crit")).toBeUndefined();
    expect(readPath({}, "missing.deep.path")).toBeUndefined();
  });
});

describe("evaluatePredicate", () => {
  const facts = { amount: 30, crit: true, element: "fire", team: "red", nested: { hp: 0 } };

  test("undefined predicate always matches", () => {
    expect(evaluatePredicate(undefined, facts)).toBe(true);
  });

  test("comparators read paths and compare", () => {
    expect(evaluatePredicate({ eq: ["element", "fire"] }, facts)).toBe(true);
    expect(evaluatePredicate({ eq: ["element", "ice"] }, facts)).toBe(false);
    expect(evaluatePredicate({ ne: ["team", "blue"] }, facts)).toBe(true);
    expect(evaluatePredicate({ gt: ["amount", 25] }, facts)).toBe(true);
    expect(evaluatePredicate({ gte: ["amount", 30] }, facts)).toBe(true);
    expect(evaluatePredicate({ lt: ["amount", 30] }, facts)).toBe(false);
    expect(evaluatePredicate({ lte: ["amount", 30] }, facts)).toBe(true);
    expect(evaluatePredicate({ in: ["element", ["fire", "ice"]] }, facts)).toBe(true);
    expect(evaluatePredicate({ in: ["element", ["ice", "poison"]] }, facts)).toBe(false);
  });

  test("has passes for present non-nullish values, including falsy numbers", () => {
    expect(evaluatePredicate({ has: "crit" }, facts)).toBe(true);
    expect(evaluatePredicate({ has: "nested.hp" }, facts)).toBe(true);
    expect(evaluatePredicate({ has: "absent" }, facts)).toBe(false);
  });

  test("numeric comparators reject non-numeric or missing values", () => {
    expect(evaluatePredicate({ gt: ["element", 0] }, facts)).toBe(false);
    expect(evaluatePredicate({ gte: ["absent", 0] }, facts)).toBe(false);
  });

  test("all / any / not combine children", () => {
    const rule: Predicate = {
      all: [{ eq: ["crit", true] }, { any: [{ eq: ["element", "fire"] }, { eq: ["element", "ice"] }] }],
    };
    expect(evaluatePredicate(rule, facts)).toBe(true);
    expect(evaluatePredicate({ not: rule }, facts)).toBe(false);
    expect(evaluatePredicate({ all: [{ eq: ["crit", true] }, { eq: ["team", "blue"] }] }, facts)).toBe(false);
    expect(evaluatePredicate({ any: [] }, facts)).toBe(false);
    expect(evaluatePredicate({ all: [] }, facts)).toBe(true);
  });

  test("round-trips through JSON unchanged", () => {
    const rule: Predicate = { all: [{ gte: ["amount", 10] }, { eq: ["element", "fire"] }] };
    const restored = JSON.parse(JSON.stringify(rule)) as Predicate;
    expect(evaluatePredicate(restored, facts)).toBe(true);
  });
});
