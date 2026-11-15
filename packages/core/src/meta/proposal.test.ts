import { describe, expect, test } from "bun:test";

import { defineEngineProposal, engineProposalProblems, type EngineProposal } from "./proposal";

const valid: EngineProposal = {
  id: "creature-terrain-mode",
  target: "@jgengine/core/ai/creatureDriver",
  need: "The creature driver only knows a flat plane.",
  kind: "extend",
  exports: ["createCreatureDriver"],
};

describe("defineEngineProposal", () => {
  test("returns the proposal unchanged", () => {
    expect(defineEngineProposal(valid)).toBe(valid);
  });

  test("throws with every problem and the id", () => {
    expect(() => defineEngineProposal({ ...valid, kind: "fork" })).toThrow(/invalid engine proposal creature-terrain-mode: a fork names/);
  });

  test("accepts a fork that names its engine file", () => {
    const fork = { ...valid, kind: "fork", fork: "packages/core/src/ai/creatureDriver.ts" } as const;
    expect(defineEngineProposal(fork)).toBe(fork);
  });
});

describe("engineProposalProblems", () => {
  test("a valid proposal has none", () => {
    expect(engineProposalProblems(valid)).toEqual([]);
  });

  test("rejects a non-object", () => {
    expect(engineProposalProblems("x")).toEqual(["a proposal is an object literal"]);
    expect(engineProposalProblems([])).toEqual(["a proposal is an object literal"]);
  });

  test.each([
    ["id", { id: "Creature_Mode" }, /id must be kebab-case/],
    ["id with a double dash", { id: "a--b" }, /id must be kebab-case/],
    ["target outside @jgengine", { target: "three/addons" }, /target must be a public @jgengine import path/],
    ["target into src", { target: "@jgengine/core/src/ai/creatureDriver" }, /not a file inside the package/],
    ["empty need", { need: "  " }, /need must say/],
    ["kind", { kind: "patch" }, /kind must be one of new, extend, fork/],
    ["fork without kind fork", { fork: "packages/core/src/ai/creatureDriver.ts" }, /fork is only for kind "fork"/],
    ["fork outside packages", { kind: "fork", fork: "games/x/a.ts" }, /a fork names the engine file/],
    ["empty exports", { exports: [] }, /at least one name/],
    ["bad export name", { exports: ["a-b"] }, /invalid name: "a-b"/],
    ["duplicate export", { exports: ["a", "a"] }, /lists a twice/],
    ["unknown field", { owner: "me" }, /unknown field "owner"/],
  ])("rejects %s", (_label, patch, message) => {
    const problems = engineProposalProblems({ ...valid, ...patch });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });
});
