import { expect, test } from "bun:test";
import {
  freezeNarrativeCanon, validateNarrativeBatch,
  type NarrativeBatch, type NarrativeBatchLimits,
} from "./narrativeAuthoring";

const canon = freezeNarrativeCanon({ revision: "review-3", characterIds: ["witness"], facts: { hatch: "sealed" }, eventIds: ["descent", "alarm"] });
const limits: NarrativeBatchLimits = { maxDialogues: 2, maxNodes: 3, maxChoices: 3, maxClaims: 5, maxTextCharacters: 200 };
function batch(): NarrativeBatch {
  return { canonRevision: canon.revision, dialogues: [{ id: "testimony", graph: {
    start: "account", nodes: [{ id: "account", text: "The hatch was sealed.", choices: [{ text: "Record the account", to: "record" }] }, { id: "record", text: "Recorded." }],
  }, claims: [
    { nodeId: "account", kind: "character", characterId: "witness" },
    { nodeId: "account", kind: "fact", factId: "hatch", value: "sealed" },
    { nodeId: "account", kind: "before", earlier: "descent", later: "alarm" },
  ] }] };
}

test("canon snapshot is detached, frozen, JSON serializable and rejects ambiguous ids", () => {
  const source = { revision: "r", characterIds: ["a"], facts: { status: "alive" }, eventIds: ["arrival"] };
  const snapshot = freezeNarrativeCanon(source);
  source.facts.status = "dead";
  source.characterIds.push("b");
  expect(snapshot.facts.status).toBe("alive");
  expect(snapshot.characterIds).toEqual(["a"]);
  for (const value of [snapshot, snapshot.facts, snapshot.characterIds, snapshot.eventIds]) expect(Object.isFrozen(value)).toBe(true);
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  expect(() => freezeNarrativeCanon({ ...source, revision: "" })).toThrow();
  expect(() => freezeNarrativeCanon({ ...source, eventIds: ["arrival", "arrival"] })).toThrow();
  expect(() => freezeNarrativeCanon({ ...source, characterIds: ["a", "a"] })).toThrow();
});

test("structured assertions and dialogue topology produce candidate locations without mutation", () => {
  const candidate = batch();
  const broken: NarrativeBatch = { ...candidate, dialogues: [{ ...candidate.dialogues[0]!, graph: {
    start: "account", nodes: [{ id: "account", text: "A statement.", choices: [{ text: "Next", to: "absent" }] }],
  }, claims: [
    { nodeId: "account", kind: "character", characterId: "stranger" },
    { nodeId: "missing", kind: "fact", factId: "hatch", value: "open" },
    { nodeId: "account", kind: "before", earlier: "alarm", later: "descent" },
    { nodeId: "account", kind: "fact", factId: "unknown", value: "x" },
    { nodeId: "account", kind: "before", earlier: "unknown", later: "missing" },
  ] }] };
  const before = JSON.stringify(broken);
  const issues = validateNarrativeBatch(canon, broken, limits);
  for (const [code, path] of [
    ["dialogue:missing-target", "/dialogues/0/graph/nodes/0/choices/0/to"],
    ["unknown-character", "/dialogues/0/claims/0/characterId"],
    ["missing-claim-node", "/dialogues/0/claims/1/nodeId"],
    ["fact-conflict", "/dialogues/0/claims/1/value"],
    ["chronology-conflict", "/dialogues/0/claims/2"],
    ["unknown-fact", "/dialogues/0/claims/3/factId"],
    ["unknown-event", "/dialogues/0/claims/4/earlier"],
    ["unknown-event", "/dialogues/0/claims/4/later"],
  ]) expect(issues.some((issue) => issue.code === code && issue.path === path)).toBe(true);
  expect(JSON.stringify(broken)).toBe(before);
  expect(validateNarrativeBatch(canon, candidate, limits)).toEqual([]);
});

test("all total budgets and invalid limits reject; stale revisions skip graph access", () => {
  for (const key of Object.keys(limits) as (keyof NarrativeBatchLimits)[]) {
    expect(validateNarrativeBatch(canon, batch(), { ...limits, [key]: 0 })[0]?.code).toBe("batch-budget");
    for (const value of [-1, Infinity, NaN, 0.5]) expect(() => validateNarrativeBatch(canon, batch(), { ...limits, [key]: value })).toThrow();
  }
  const stale: NarrativeBatch = { canonRevision: "old", get dialogues() { throw new Error("must not inspect stale content"); } };
  expect(validateNarrativeBatch(canon, stale, limits)).toEqual([{ code: "stale-canon", severity: "error", path: "/canonRevision", message: "Candidate uses a different canon revision." }]);
  const oversized: NarrativeBatch = { canonRevision: canon.revision, dialogues: [{ id: "too-large", graph: {
    start: "x", nodes: Array.from({ length: 4 }, () => ({ id: "x", get text() { throw new Error("must not inspect oversized nodes"); } })),
  }, claims: [] }] };
  expect(validateNarrativeBatch(canon, oversized, limits)[0]?.code).toBe("batch-budget");
});

test("budgets accumulate across dialogues; duplicate ids and missing starts are located", () => {
  const first = batch().dialogues[0]!;
  const candidate = { canonRevision: canon.revision, dialogues: [first, { ...first, graph: { ...first.graph, start: "absent" } }] };
  expect(validateNarrativeBatch(canon, candidate, limits)[0]?.code).toBe("batch-budget");
  const issues = validateNarrativeBatch(canon, candidate, { ...limits, maxNodes: 4, maxClaims: 6 });
  expect(issues.some((issue) => issue.code === "duplicate-dialogue" && issue.path === "/dialogues/1/id")).toBe(true);
  expect(issues.some((issue) => issue.code === "dialogue:missing-start" && issue.path === "/dialogues/1/graph/start")).toBe(true);
});

test("the checker does not infer facts or judge prose without explicit claims", () => {
  const candidate = { canonRevision: canon.revision, dialogues: [{ id: "unreviewed", graph: { start: "x", nodes: [{ id: "x", speaker: "Unknown display name", text: "The hatch was open before the descent." }] }, claims: [] }] };
  expect(validateNarrativeBatch(canon, candidate, limits)).toEqual([]);
});
