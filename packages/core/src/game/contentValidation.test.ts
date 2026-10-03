import { describe, expect, test } from "bun:test";
import {
  validateContentProgression,
  validateContentReferences,
  type ContentEntry,
  type ContentProgressionInput,
  type ContentProgressionRule,
  type ContentReference,
} from "./contentValidation";

describe("content reference validation", () => {
  test("accepts game-owned namespaces and identical ids in different roles", () => {
    const entries: ContentEntry[] = [
      { kind: "pilots", id: "heron", path: "/pilots/0" },
      { kind: "radio-call-signs", id: "heron", path: "/calls/0" },
      { kind: "__proto__", id: "constructor", path: "/custom/0" },
    ];
    const references: ContentReference[] = entries.map((entry) => ({ ...entry, contentId: "flight-dusk" }));
    expect(validateContentReferences(entries, references)).toEqual([]);
  });

  test("locates duplicate definitions and missing cross-catalog references with a repair", () => {
    const issues = validateContentReferences([
      { kind: "item", id: "seal", path: "/items/0" },
      { kind: "item", id: "seal", path: "/items/2" },
      { kind: "questgiver", id: "warden", path: "/people/0" },
    ], [
      { kind: "questgiver", id: "wardne", path: "/quests/0/giver", contentId: "opening-gate" },
      { kind: "item", id: "seal", path: "/quests/0/reward", contentId: "opening-gate" },
      { kind: "dialogue", id: "gate-open", path: "/quests/0/dialogue", contentId: "opening-gate" },
    ]);
    expect(issues.map(({ code, path, contentId, referenceId }) => ({ code, path, contentId, referenceId }))).toEqual([
      { code: "duplicate-content", path: "/items/2", contentId: "seal", referenceId: "seal" },
      { code: "unknown-reference", path: "/quests/0/giver", contentId: "opening-gate", referenceId: "wardne" },
      { code: "unknown-reference", path: "/quests/0/dialogue", contentId: "opening-gate", referenceId: "gate-open" },
    ]);
    expect(issues.every((issue) => issue.severity === "error" && issue.repair.length > 0)).toBe(true);
    expect(issues[0]!.message).toContain("/items/0");
    expect(issues[1]!.repair).toContain("questgiver catalog");
  });

  test("is deterministic and does not mutate frozen caller catalogs", () => {
    const entries = Object.freeze([Object.freeze({ kind: "item", id: "seal", path: "/items/0" })]);
    const references = Object.freeze([Object.freeze({ kind: "item", id: "missing", path: "/rewards/0", contentId: "harbor" })]);
    const before = JSON.stringify({ entries, references });
    const first = validateContentReferences(entries, references);
    expect(validateContentReferences(entries, references)).toEqual(first);
    first[0]!.path = "changed";
    expect(validateContentReferences(entries, references)[0]!.path).toBe("/rewards/0");
    expect(JSON.stringify({ entries, references })).toBe(before);
  });

  test("rejects an existing quest offered by the wrong giver under the game's declared relationship", () => {
    const entries = Object.freeze([
      Object.freeze({ kind: "quest", id: "repair-beacon", path: "/quests/0" }),
      Object.freeze({ kind: "quest", id: "deliver-medicine", path: "/quests/1" }),
    ]);
    const allowedIds = Object.freeze(["repair-beacon"]);
    const valid = Object.freeze({ kind: "quest", id: "repair-beacon", path: "/givers/keeper/quest", contentId: "keeper", allowedIds });
    expect(validateContentReferences(entries, [valid])).toEqual([]);
    const wrongGiver = Object.freeze({ ...valid, id: "deliver-medicine" });
    const issues = validateContentReferences(entries, [wrongGiver]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "inconsistent-reference", severity: "error", path: "/givers/keeper/quest", contentId: "keeper", referenceId: "deliver-medicine" });
    expect(issues[0]!.message).toContain('"keeper"');
    expect(issues[0]!.message).toContain('"deliver-medicine"');
    expect(issues[0]!.repair).toContain('"repair-beacon"');
    expect(issues[0]!.repair).toContain("relationship declaration");
    expect(validateContentReferences(entries, [wrongGiver])).toEqual(issues);
    expect(allowedIds).toEqual(["repair-beacon"]);
  });

  test("omitted relationships impose no restriction, while an empty allowed list disallows every existing id", () => {
    const entries = [{ kind: "quest", id: "repair-beacon", path: "/quests/0" }];
    const reference = { kind: "quest", id: "repair-beacon", path: "/givers/keeper/quest", contentId: "keeper" };
    expect(validateContentReferences(entries, [reference])).toEqual([]);
    const issues = validateContentReferences(entries, [{ ...reference, allowedIds: [] }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "inconsistent-reference", path: reference.path, referenceId: reference.id });
    expect(issues[0]!.repair).toContain("none declared");
    expect(issues[0]!.repair).toContain("relationship declaration");
  });

  test("a missing id remains a broken reference even if listed in a declared relationship", () => {
    const issues = validateContentReferences([], [{ kind: "quest", id: "missing", path: "/givers/keeper/quest", contentId: "keeper", allowedIds: ["missing"] }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "unknown-reference", referenceId: "missing", contentId: "keeper" });
    expect(issues[0]!.repair).toContain("quest catalog");
  });
});

describe("declared content progression", () => {
  test("separate sources are alternatives, while a rule requires every prerequisite", () => {
    const result = validateContentProgression({
      initial: ["village", "permission"],
      closedWorld: true,
      rules: [
        { id: "locked-mine", path: "/sources/mine", requires: ["mine-key"], provides: ["ore"] },
        { id: "merchant", path: "/sources/merchant", requires: ["village"], provides: ["ore"] },
        { id: "forge", path: "/recipes/forge", requires: ["ore", "permission"], provides: ["blade"] },
        { id: "sail", path: "/choices/sail", requires: ["blade", "boat"], provides: ["island"] },
      ],
      required: [
        { id: "blade", path: "/quests/arm/reward", contentId: "arm" },
        { id: "island", path: "/quests/cross/destination", contentId: "cross" },
      ],
    });
    expect(result.reachable).toEqual(["village", "permission", "ore", "blade"]);
    expect(result.reachableRules).toEqual(["merchant", "forge"]);
    expect(result.issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "blocked-rule", path: "/sources/mine" },
      { code: "blocked-rule", path: "/choices/sail" },
      { code: "unreachable-content", path: "/quests/cross/destination" },
    ]);
    expect(result.issues[1]!.message).toContain('"boat"');
    expect(result.issues[1]!.message).not.toContain('"blade"');
    expect(result.issues[2]).toMatchObject({ severity: "error", contentId: "cross", referenceId: "island" });
    expect(result.issues.every((issue) => issue.repair.length > 0)).toBe(true);
  });

  test("intentional production cycles pass when seeded", () => {
    const result = validateContentProgression({
      initial: ["cutting"],
      closedWorld: true,
      rules: [
        { id: "grow", path: "/garden/grow", requires: ["cutting"], provides: ["plant"] },
        { id: "propagate", path: "/garden/propagate", requires: ["plant"], provides: ["cutting"] },
      ],
      required: [{ id: "plant", path: "/garden/harvest", contentId: "harvest" }],
    });
    expect(result.reachable).toEqual(["cutting", "plant"]);
    expect(result.reachableRules).toEqual(["grow", "propagate"]);
    expect(result.issues).toEqual([]);
  });

  test("an unseeded cycle fails only when sources are declared complete", () => {
    const input: ContentProgressionInput = {
      initial: [],
      rules: [
        { id: "grow", path: "/garden/grow", requires: ["cutting"], provides: ["plant"] },
        { id: "propagate", path: "/garden/propagate", requires: ["plant"], provides: ["cutting"] },
      ],
      required: [{ id: "plant", path: "/garden/harvest", contentId: "harvest" }],
    };
    const closed = validateContentProgression({ ...input, closedWorld: true });
    const open = validateContentProgression(input);
    expect(closed.reachable).toEqual([]);
    expect(closed.issues.map((issue) => issue.code)).toEqual(["blocked-rule", "blocked-rule", "unreachable-content"]);
    expect(closed.issues.every((issue) => issue.severity === "error")).toBe(true);
    expect(open.issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(open.issues.map(({ severity: _severity, ...issue }) => issue)).toEqual(
      closed.issues.map(({ severity: _severity, ...issue }) => issue),
    );
  });

  test("deduplicates facts and prerequisite edges across fanout and convergence", () => {
    const result = validateContentProgression({
      initial: ["entry", "entry"],
      closedWorld: true,
      rules: [
        { id: "left", path: "/left", requires: ["entry", "entry"], provides: ["left", "shared", "shared"] },
        { id: "right", path: "/right", requires: ["entry"], provides: ["right", "shared"] },
        { id: "end", path: "/end", requires: ["left", "right", "shared", "shared"], provides: ["exit", "exit"] },
      ],
    });
    expect(result.reachable).toEqual(["entry", "left", "shared", "right", "exit"]);
    expect(result.reachableRules).toEqual(["left", "right", "end"]);
    expect(result.issues).toEqual([]);
  });

  test("empty prerequisite rules introduce sources and repeated rule ids fail", () => {
    const result = validateContentProgression({ initial: [], closedWorld: true, rules: [
      { id: "spring", path: "/sources/0", requires: [], provides: ["water"] },
      { id: "spring", path: "/sources/1", requires: ["water"], provides: [] },
    ] });
    expect(result.reachable).toEqual(["water"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: "duplicate-rule", path: "/sources/1", severity: "error", contentId: "spring" });
    expect(result.issues[0]!.repair).toContain("distinct rule id");
  });

  test("resolves an arbitrarily ordered long chain without recursion", () => {
    const count = 1_009;
    const rules: ContentProgressionRule[] = Array.from({ length: count }, (_, position) => {
      const index = position * 37 % count;
      return { id: `step-${index}`, path: `/steps/${index}`, requires: [`fact-${index}`], provides: [`fact-${index + 1}`] };
    });
    const result = validateContentProgression({ initial: ["fact-0"], rules, closedWorld: true,
      required: [{ id: `fact-${count}`, path: "/ending", contentId: "ending" }] });
    expect(result.reachableRules).toEqual(Array.from({ length: count }, (_, index) => `step-${index}`));
    expect(result.reachable).toHaveLength(count + 1);
    expect(result.issues).toEqual([]);
  });

  test("frozen inputs survive deterministic analysis and detached results", () => {
    const input = Object.freeze({
      initial: Object.freeze(["entry"]),
      rules: Object.freeze([Object.freeze({ id: "leave", path: "/choices/0", requires: Object.freeze(["entry"]), provides: Object.freeze(["exit"]) })]),
      required: Object.freeze([Object.freeze({ id: "missing", path: "/endings/0", contentId: "ending" })]),
      closedWorld: true,
    });
    const before = JSON.stringify(input);
    const first = validateContentProgression(input);
    expect(validateContentProgression(input)).toEqual(first);
    first.reachable.push("injected");
    first.reachableRules.length = 0;
    first.issues[0]!.repair = "changed";
    expect(validateContentProgression(input).reachable).toEqual(["entry", "exit"]);
    expect(validateContentProgression(input).reachableRules).toEqual(["leave"]);
    expect(validateContentProgression(input).issues[0]!.repair).not.toBe("changed");
    expect(JSON.stringify(input)).toBe(before);
  });

  test("100,000 sparse reverse-ordered rules use bounded rule visits", () => {
    const count = 100_000;
    let ruleReads = 0;
    const rules = new Proxy(Array.from({ length: count }, (_, position) => {
      const index = count - position - 1;
      return { id: `step-${index}`, path: `/steps/${index}`, requires: [`fact-${index}`], provides: [`fact-${index + 1}`] };
    }), {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) ruleReads++;
        return Reflect.get(target, property, receiver);
      },
    });
    const result = validateContentProgression({ initial: ["fact-0"], rules, closedWorld: true });
    expect(result.issues).toEqual([]);
    expect(result.reachableRules).toHaveLength(count);
    expect(result.reachableRules[0]).toBe("step-0");
    expect(result.reachableRules[count - 1]).toBe(`step-${count - 1}`);
    expect(result.reachable).toHaveLength(count + 1);
    expect(ruleReads).toBeLessThanOrEqual(count * 4);
  });
});
