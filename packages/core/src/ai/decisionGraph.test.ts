import { describe, expect, test } from "bun:test";
import { createDecisionGraphRuntime, type DecisionNode } from "./decisionGraph";

const action = (name: string): DecisionNode => ({ kind: "action", action: name });

describe("decisionGraph", () => {
  test("selector falls through failed branches", () => {
    const calls: string[] = [];
    const runtime = createDecisionGraphRuntime(
      { kind: "selector", children: [{ kind: "condition", key: "ready", op: "=", value: true }, action("fallback")] },
      { fallback: () => { calls.push("fallback"); return "done"; } },
    );
    expect(runtime.tick({}, { ready: false }, 0.1)).toBe("done");
    expect(calls).toEqual(["fallback"]);
  });

  test("sequence stops on failure", () => {
    const calls: string[] = [];
    const runtime = createDecisionGraphRuntime(
      { kind: "sequence", children: [action("first"), action("second")] },
      {
        first: () => { calls.push("first"); return "failed"; },
        second: () => { calls.push("second"); return "done"; },
      },
    );
    expect(runtime.tick({}, {}, 0.1)).toBe("failed");
    expect(calls).toEqual(["first"]);
  });

  test("utility chooses the highest weighted score", () => {
    const calls: string[] = [];
    const runtime = createDecisionGraphRuntime(
      { kind: "utility", options: [
        { score: [{ key: "hunger", weight: 1 }], node: action("eat") },
        { score: [{ key: "threat", weight: 2 }], node: action("hide") },
      ] },
      { eat: () => { calls.push("eat"); return "done"; }, hide: () => { calls.push("hide"); return "done"; } },
    );
    expect(runtime.tick({}, { hunger: 3, threat: 2 }, 0.1)).toBe("done");
    expect(calls).toEqual(["hide"]);
  });

  test("running action is called again on the next tick", () => {
    let calls = 0;
    const runtime = createDecisionGraphRuntime(
      action("wait"),
      { wait: () => { calls += 1; return calls < 2 ? "running" : "done"; } },
    );
    expect(runtime.tick({}, {}, 0.1)).toBe("running");
    expect(runtime.tick({}, {}, 0.1)).toBe("done");
    expect(calls).toBe(2);
  });

  test("snapshot and restore preserve the running marker", () => {
    const runtime = createDecisionGraphRuntime(action("wait"), { wait: () => "running" });
    runtime.tick({}, {}, 0.1);
    const snapshot = runtime.snapshot();
    const restored = createDecisionGraphRuntime(action("wait"), { wait: () => "running" });
    restored.restore(snapshot);
    expect(restored.snapshot()).toEqual(snapshot);
  });
});
