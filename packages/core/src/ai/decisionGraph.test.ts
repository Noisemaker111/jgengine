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

  test("interrupting a running action calls onAbort once", () => {
    const aborted: string[] = [];
    const runtime = createDecisionGraphRuntime(
      { kind: "selector", children: [
        { kind: "sequence", children: [{ kind: "condition", key: "alarm", op: "=", value: true }, action("flee")] },
        action("patrol"),
      ] },
      { flee: () => "running", patrol: () => "running" },
      { onAbort: (name) => aborted.push(name) },
    );
    expect(runtime.tick({}, { alarm: false }, 0.1)).toBe("running");
    expect(runtime.running()).toBe("patrol");
    runtime.tick({}, { alarm: true }, 0.1);
    expect(runtime.running()).toBe("flee");
    runtime.tick({}, { alarm: true }, 0.1);
    expect(aborted).toEqual(["patrol"]);
  });

  test("a memory sequence resumes at its running child", () => {
    const calls: string[] = [];
    let steps = 0;
    const runtime = createDecisionGraphRuntime(
      { kind: "sequence", memory: true, children: [action("pick"), action("walk")] },
      {
        pick: () => { calls.push("pick"); return "done"; },
        walk: () => { calls.push("walk"); steps += 1; return steps < 3 ? "running" : "done"; },
      },
    );
    runtime.tick({}, {}, 0.1);
    runtime.tick({}, {}, 0.1);
    expect(runtime.tick({}, {}, 0.1)).toBe("done");
    expect(calls).toEqual(["pick", "walk", "walk", "walk"]);
  });

  test("wait, invert and cooldown gate on elapsed graph time", () => {
    let barks = 0;
    const runtime = createDecisionGraphRuntime(
      { kind: "selector", children: [
        { kind: "cooldown", seconds: 1, child: action("bark") },
        { kind: "sequence", children: [{ kind: "invert", child: { kind: "condition", key: "hurt", op: "=", value: true } }, { kind: "wait", seconds: 0.25 }] },
      ] },
      { bark: () => { barks += 1; return "done"; } },
    );
    expect(runtime.tick({}, {}, 0.1)).toBe("done");
    expect(runtime.tick({}, {}, 0.1)).toBe("running");
    expect(runtime.tick({}, {}, 0.1)).toBe("running");
    expect(runtime.tick({}, {}, 0.1)).toBe("done");
    expect(runtime.tick({}, { hurt: true }, 0.1)).toBe("failed");
    for (let i = 0; i < 6; i += 1) runtime.tick({}, { hurt: true }, 0.1);
    expect(runtime.tick({}, {}, 0.1)).toBe("done");
    expect(barks).toBe(2);
  });

  test("random picks by weight from the injected rng and sticks while running", () => {
    const rolls = [0.9, 0.0];
    let turns = 0;
    const runtime = createDecisionGraphRuntime(
      { kind: "random", weights: [1, 3], children: [action("sit"), action("walk")] },
      { sit: () => "done", walk: () => (++turns < 2 ? "running" : "done") },
      { rng: () => rolls.shift() ?? 0 },
    );
    runtime.tick({}, {}, 0.1);
    expect(runtime.running()).toBe("walk");
    expect(runtime.tick({}, {}, 0.1)).toBe("done");
    expect(rolls).toEqual([0.0]);
    expect(() => createDecisionGraphRuntime({ kind: "random", children: [action("sit")] }, { sit: () => "done" }).tick({}, {}, 0.1)).toThrow("rng");
  });

  test("snapshot restores timers, memory and cooldowns bit-exactly", () => {
    const graph: DecisionNode = { kind: "sequence", memory: true, children: [
      { kind: "cooldown", seconds: 5, child: action("mark") },
      { kind: "wait", seconds: 1 },
      action("leave"),
    ] };
    const make = () => createDecisionGraphRuntime(graph, { mark: () => "done", leave: () => "done" });
    const original = make();
    original.tick({}, {}, 0.4);
    original.tick({}, {}, 0.4);
    const saved = original.snapshot();
    const copy = make();
    copy.restore(saved);
    expect(copy.snapshot()).toEqual(saved);
    expect(copy.tick({}, {}, 0.4)).toBe(original.tick({}, {}, 0.4));
    expect(copy.snapshot()).toEqual(original.snapshot());
    expect(copy.tick({}, {}, 0.1)).toBe("failed");
  });

  test("restores legacy snapshots that only carry runningPath", () => {
    const runtime = createDecisionGraphRuntime({ kind: "selector", children: [action("a"), action("b")] }, { a: () => "failed", b: () => "running" });
    runtime.restore({ runningPath: [1] });
    expect(runtime.running()).toBe("b");
    expect(runtime.tick({}, {}, 0.1)).toBe("running");
  });
});
