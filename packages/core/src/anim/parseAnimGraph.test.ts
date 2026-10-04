import { describe, expect, test } from "bun:test";
import { parseAnimGraph, validateAnimGraph, type AnimGraph } from "./animGraph";
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
      locomotionGraph({ idle: "Idle", walk: "Walk", runSpeed: 5, oneShots: { hit: ["HitA", "HitB"] } }),
    );
  });

  test("a single-clip config has no graph", () => {
    expect(animGraphFromConfig({ clip: "Wave" })).toBeUndefined();
  });
});


describe("validateAnimGraph authored acceptance", () => {
  const combat = (): AnimGraph => locomotionGraph({ idle: "Idle", walk: "Walk", run: "Run", oneShots: { hit: ["Hit_A", "Hit_B"], death: ["Death_A", "Death_B"], attack: ["Attack_A", "Attack_B"] } });

  test("a malformed authored death rejects the whole graph while permissive parsing retains its old repair contract", () => {
    const graph = combat() as any;
    graph.layers[0].states.death.clip = 42;
    expect(parseAnimGraph(graph)?.layers[0]?.states.death).toBeUndefined();
    const result = validateAnimGraph(graph);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toEqual([{ path: "layers[0].states.death.clip", message: "Expected a nonempty string.", repair: "Set an explicit name from this graph or imported rig." }]);
    expect(graph.layers[0].states.death.clip).toBe(42);
  });

  test("valid graph data, reverse playback and authored order return by identity without normalization", () => {
    const graph = combat();
    const upper = {
      id: "upper", entry: "rest", mask: ["", "spine"], additive: true, weight: 0.5,
      states: {
        rest: { kind: "clip" as const, clip: "Idle", speed: -1, variants: [] },
        aim: { kind: "blend2D" as const, params: ["aimX", "aimY"] as const, points: [{ at: [-1, 0] as const, clip: "Aim_Left" }, { at: [1, 0] as const, clip: "Aim_Right" }], loop: false, rootMotion: true },
      },
      transitions: [{ from: "*", to: "aim", trigger: "aim", when: [{ param: "aiming", op: "==" as const, value: true }], duration: 0, exitTime: 0 }],
    };
    const authored = { ...graph, layers: [...graph.layers, upper], events: [{ clip: "Attack_B", atSec: 0.2, name: "hit" }], extension: { retained: true } };
    const before = JSON.stringify(authored), result = validateAnimGraph(authored);
    expect(result.graph).toBe(authored);
    expect(result.diagnostics).toEqual([]);
    expect(JSON.stringify(result.graph)).toBe(before);
  });

  test("dangling entries and transitions plus duplicate layer ids have exact repair locations", () => {
    const graph = combat() as any;
    graph.layers[0].entry = "unknown";
    graph.layers[0].transitions[0].from = "absent";
    graph.layers[0].transitions[0].to = "missing";
    graph.layers.push(structuredClone(graph.layers[0]));
    const result = validateAnimGraph(graph);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.map(issue => issue.path)).toContain("layers[0].entry");
    expect(result.diagnostics.map(issue => issue.path)).toContain("layers[0].transitions[0].from");
    expect(result.diagnostics.map(issue => issue.path)).toContain("layers[0].transitions[0].to");
    expect(result.diagnostics.map(issue => issue.path)).toContain("layers[1].id");
    expect(result.diagnostics.every(issue => issue.repair.length > 0)).toBe(true);
  });

  test("malformed known conditions cannot disappear into an unconditional transition", () => {
    const graph = combat() as any;
    graph.layers[0].transitions = [{ from: "locomotion", to: "attack", when: [{ param: "grounded", op: "~", value: "false" }], duration: Infinity, exitTime: NaN }];
    const result = validateAnimGraph(graph);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.map(issue => issue.path)).toEqual([
      "layers[0].transitions[0].duration", "layers[0].transitions[0].exitTime",
      "layers[0].transitions[0].when[0].op", "layers[0].transitions[0].when[0].value",
    ]);
    expect(parseAnimGraph(graph)?.layers[0]?.transitions[0]?.when).toBeUndefined();
  });

  test("every known layer, state, point and event field rejects invalid shape or nonfinite data", () => {
    const cases: Array<[string, (graph: any) => void]> = [
      ["layers", graph => graph.layers = []],
      ["layers[0].transitions", graph => graph.layers[0].transitions = null],
      ["layers[0].weight", graph => graph.layers[0].weight = 2],
      ["layers[0].additive", graph => graph.layers[0].additive = "yes"],
      ["layers[0].mask[0]", graph => graph.layers[0].mask = [42]],
      ["layers[0].states.death.kind", graph => graph.layers[0].states.death.kind = "spin"],
      ["layers[0].states.death.speed", graph => graph.layers[0].states.death.speed = Infinity],
      ["layers[0].states.death.loop", graph => graph.layers[0].states.death.loop = "false"],
      ["layers[0].states.death.rootMotion", graph => graph.layers[0].states.death.rootMotion = 1],
      ["layers[0].states.death.variants[1]", graph => graph.layers[0].states.death.variants = ["Death_A", null]],
      ["layers[0].states.death.points", graph => graph.layers[0].states.death.points = []],
      ["layers[0].states.locomotion.param", graph => graph.layers[0].states.locomotion.param = false],
      ["layers[0].states.locomotion.points[0].at", graph => graph.layers[0].states.locomotion.points[0].at = NaN],
      ["layers[0].states.locomotion.points[0].clip", graph => graph.layers[0].states.locomotion.points[0].clip = null],
      ["layers[0].states.aim.params", graph => graph.layers[0].states.aim = { kind: "blend2D", params: ["x"], points: [] }],
      ["layers[0].states.aim.points[0].at[1]", graph => graph.layers[0].states.aim = { kind: "blend2D", params: ["x", "y"], points: [{ at: [0, Infinity], clip: "Aim" }] }],
      ["layers[0].transitions[0].trigger", graph => graph.layers[0].transitions[0].trigger = []],
      ["layers[0].transitions[0].duration", graph => graph.layers[0].transitions[0].duration = -1],
      ["layers[0].transitions[0].when", graph => graph.layers[0].transitions[0].when = "always"],
      ["events[0].atSec", graph => graph.events = [{ clip: "Attack_A", name: "hit", atSec: -1 }]],
      ["events[0].clip", graph => graph.events = [{ clip: 42, name: "hit", atSec: 0 }]],
      ["events[0].name", graph => graph.events = [{ clip: "Attack_A", name: null, atSec: 0 }]],
    ];
    for (const [path, mutate] of cases) {
      const graph = combat(); mutate(graph);
      const result = validateAnimGraph(graph);
      expect(result.graph).toBeUndefined();
      expect(result.diagnostics.map(issue => issue.path)).toContain(path);
    }
    expect(validateAnimGraph(null).diagnostics[0]?.path).toBe("");
    expect(validateAnimGraph({ layers: "invalid" }).diagnostics[0]?.path).toBe("layers");
  });
});
