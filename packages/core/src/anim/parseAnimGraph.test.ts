import { describe, expect, test } from "bun:test";
import { parseAnimGraph, type AnimGraph } from "./animGraph";
import { animGraphFromConfig, locomotionGraph } from "./locomotionGraph";

describe("parseAnimGraph", () => {
  test("round-trips a graph through JSON unchanged", () => {
    const graph: AnimGraph = {
      layers: [
        locomotionGraph({ idle: "Idle", walk: "Walk", run: "Run", oneShots: { attack: "Slash", death: "Die" } }).layers[0]!,
        {
          id: "upper",
          entry: "rest",
          mask: ["spine", "arm"],
          weight: 0.8,
          states: {
            rest: { kind: "clip", clip: "Idle" },
            aim: { kind: "blend2D", params: ["aimX", "aimY"], points: [{ at: [0, 0], clip: "AimMid" }, { at: [1, 0], clip: "AimRight" }] },
          },
          transitions: [{ from: "rest", to: "aim", when: [{ param: "aiming", op: "==", value: true }], duration: 0.15 }],
        },
      ],
      events: [{ clip: "Slash", atSec: 0.3, name: "hit" }],
    };
    expect(parseAnimGraph(JSON.parse(JSON.stringify(graph)))).toEqual(graph);
  });

  test("drops malformed states, dangling transitions, bad conditions and entry-less layers", () => {
    const parsed = parseAnimGraph({
      layers: [
        {
          id: "base",
          entry: "idle",
          states: { idle: { kind: "clip", clip: "Idle" }, broken: { kind: "clip" }, odd: { kind: "spin" } },
          transitions: [
            { from: "idle", to: "missing", trigger: "x" },
            { from: "*", to: "idle", when: [{ param: "speed", op: "~", value: 1 }], duration: -2 },
          ],
        },
        { id: "ghost", entry: "nowhere", states: {}, transitions: [] },
      ],
    });
    expect(parsed).toEqual({
      layers: [{ id: "base", entry: "idle", states: { idle: { kind: "clip", clip: "Idle" } }, transitions: [{ from: "*", to: "idle", duration: 0 }] }],
    });
  });

  test("returns undefined for anything that is not a graph", () => {
    expect(parseAnimGraph(null)).toBeUndefined();
    expect(parseAnimGraph({ layers: "no" })).toBeUndefined();
    expect(parseAnimGraph({ layers: [{ id: "a", entry: "b", states: {} }] })).toBeUndefined();
  });
});

describe("animGraphFromConfig", () => {
  test("an authored graph wins", () => {
    const graph = locomotionGraph({ idle: "A", walk: "B" });
    expect(animGraphFromConfig({ graph, states: { idle: "X", walk: "Y" } })).toBe(graph);
  });

  test("states and one-shot variants become the locomotion graph", () => {
    expect(animGraphFromConfig({ states: { idle: "Idle", walk: "Walk", runSpeed: 5 }, oneShots: { hit: ["HitA", "HitB"] } })).toEqual(
      locomotionGraph({ idle: "Idle", walk: "Walk", runSpeed: 5, oneShots: { hit: "HitA" } }),
    );
  });

  test("a single-clip config has no graph", () => {
    expect(animGraphFromConfig({ clip: "Wave" })).toBeUndefined();
  });
});
