import { describe, expect, test } from "bun:test";
import { createAnimGraphRuntime } from "./animGraph";
import {
  LOCOMOTION_BACKWARD_STATE,
  LOCOMOTION_SPEED_PARAM,
  LOCOMOTION_STATE,
  LOCOMOTION_STRAFE_STATE,
  LOCOMOTION_TURN_STATE,
  animGraphFromConfig,
  locomotionGraph,
} from "./locomotionGraph";
import { parseAnimGraph } from "./animGraph";
import type { ModelAnimationConfig } from "../game/playableGame";

const clips = { idle: 2, walk: 1, hit: 0.3, attack: 0.7, die: 1.2 };

describe("locomotion one-shot lifecycle", () => {
  test("persisted partial roles cannot create graph clips named undefined", () => {
    const partial = { clip: "idle", states: { run: "run" } } as unknown as ModelAnimationConfig;
    expect(animGraphFromConfig(partial)).toBeUndefined();
    expect(animGraphFromConfig({ states: { idle: "idle", walk: "" } })).toEqual(locomotionGraph({ idle: "idle", walk: "idle" }));
    expect(animGraphFromConfig({ states: { idle: " ", walk: "walk" } })).toBeUndefined();
  });
  test("authored variants survive graph conversion, JSON parsing and runtime restoration", () => {
    const graph = animGraphFromConfig({ states: { idle: "idle", walk: "walk" }, oneShots: { attack: ["attack", "alternate"] } })!;
    expect(graph.layers[0]!.states.attack).toMatchObject({ variants: ["attack", "alternate"] });
    const parsed = parseAnimGraph(JSON.parse(JSON.stringify(graph)))!;
    expect(parsed).toEqual(graph);
    let rolls = 0;
    const runtime = createAnimGraphRuntime(parsed, { rng: () => { rolls++; return 0.9; } });
    runtime.advance(0.1, {}, { ...clips, alternate: 0.9 });
    expect(rolls).toBe(0);
    runtime.trigger("attack");
    runtime.advance(0, {}, { ...clips, alternate: 0.9 });
    expect(rolls).toBe(1);
    const output = runtime.advance(0.2, {}, { ...clips, alternate: 0.9 });
    expect(output.clips).toEqual([{ clip: "alternate", weight: 1, time: 0.2, layer: "base" }]);
    const restored = createAnimGraphRuntime(parsed, { rng: () => { throw new Error("restore must retain the selected clip"); } });
    restored.restore(runtime.snapshot());
    expect(restored.advance(0.1, {}, { ...clips, alternate: 0.9 })).toEqual(runtime.advance(0.1, {}, { ...clips, alternate: 0.9 }));
    expect(rolls).toBe(1);
  });

  test("repeated attacks restart and choose another authored variant with one roll per trigger", () => {
    const graph = locomotionGraph({ idle: "idle", walk: "walk", oneShots: { attack: ["attack", "alternate"] } });
    const values = [0.9, 0];
    let rolls = 0;
    const runtime = createAnimGraphRuntime(graph, { rng: () => values[rolls++]! });
    runtime.trigger("attack");
    runtime.advance(0, {}, { ...clips, alternate: 0.9 });
    expect(runtime.advance(0.2, {}, { ...clips, alternate: 0.9 }).clips).toEqual([{ clip: "alternate", weight: 1, time: 0.2, layer: "base" }]);
    runtime.trigger("attack");
    runtime.advance(0, {}, { ...clips, alternate: 0.9 });
    expect(runtime.advance(0.2, {}, { ...clips, alternate: 0.9 }).clips).toEqual([{ clip: "attack", weight: 1, time: 0.2, layer: "base" }]);
    expect(rolls).toBe(2);
    runtime.advance(0.1, {}, { ...clips, alternate: 0.9 });
    expect(rolls).toBe(2);
  });

  test("entry variants choose once on first advance and restore without rolling again", () => {
    const graph = { layers: [{ id: "base", entry: "pose", states: { pose: { kind: "clip" as const, clip: "attack", variants: ["attack", "alternate"] } }, transitions: [] }] };
    let rolls = 0;
    const runtime = createAnimGraphRuntime(graph, { rng: () => { rolls++; return 0.9; } });
    expect(rolls).toBe(0);
    expect(runtime.advance(0.1, {}, { ...clips, alternate: 0.9 }).clips[0]!.clip).toBe("alternate");
    const restored = createAnimGraphRuntime(graph, { rng: () => { throw new Error("selected clip must survive restore"); } });
    restored.restore(runtime.snapshot());
    expect(restored.advance(0.1, {}, { ...clips, alternate: 0.9 }).clips[0]!.clip).toBe("alternate");
    expect(rolls).toBe(1);
  });

  test("death takes precedence over simultaneous hit and attack triggers", () => {
    const runtime = createAnimGraphRuntime(locomotionGraph({ idle: "idle", walk: "walk", oneShots: { hit: "hit", attack: "attack", death: "die" } }));
    runtime.trigger("hit");
    runtime.trigger("attack");
    runtime.trigger("death");
    runtime.advance(0, { speed: 0 }, clips);
    expect(runtime.stateOf("base")).toBe("death");
  });

  test("hit and attack cannot release a held death, including after restoring a save", () => {
    const graph = locomotionGraph({ idle: "idle", walk: "walk", oneShots: { hit: "hit", attack: "attack", death: "die" } });
    const runtime = createAnimGraphRuntime(graph);
    runtime.trigger("death");
    runtime.advance(0, { speed: 0 }, clips);
    runtime.advance(2, { speed: 0 }, clips);
    const restored = createAnimGraphRuntime(graph);
    restored.restore(runtime.snapshot());
    for (const event of ["hit", "attack", "death"]) {
      restored.trigger(event);
      restored.advance(0.1, { speed: 6 }, clips);
      expect(restored.stateOf("base")).toBe("death");
      expect(restored.advance(0, { speed: 6 }, clips).clips).toEqual([{ clip: "die", weight: 1, time: clips.die, layer: "base" }]);
    }
  });

  test("death still interrupts an unfinished attack", () => {
    const runtime = createAnimGraphRuntime(locomotionGraph({ idle: "idle", walk: "walk", oneShots: { attack: "attack", death: "die" } }));
    runtime.trigger("attack");
    runtime.advance(0, {}, clips);
    runtime.advance(0.05, {}, clips);
    runtime.trigger("death");
    runtime.advance(0, {}, clips);
    expect(runtime.stateOf("base")).toBe("death");
  });
});

/** Total weight the graph put on each clip in one advance. */
function weightsOf(output: { clips: readonly { clip: string; weight: number }[] }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of output.clips) out[entry.clip] = (out[entry.clip] ?? 0) + entry.weight;
  return out;
}

/** Ramps one parameter from `from` to `to` in 1/60 s steps, returning each step's weights. */
function ramp(
  graph: Parameters<typeof createAnimGraphRuntime>[0],
  param: string,
  from: number,
  to: number,
  steps: number,
  fixed: Record<string, number> = {},
) {
  const runtime = createAnimGraphRuntime(graph);
  const samples: Record<string, number>[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const value = from + ((to - from) * i) / steps;
    samples.push(weightsOf(runtime.advance(1 / 60, { ...fixed, [param]: value }, clips)));
  }
  return { runtime, samples };
}

describe("locomotion blend tree", () => {
  const DIRECTIONAL = {
    idle: "idle",
    walk: "walk",
    run: "run",
    strafeLeft: "strafeL",
    strafeRight: "strafeR",
    backward: "back",
    turn: "turn",
  };
  const CLIPS = { ...clips, run: 0.8, strafeL: 1, strafeR: 1, back: 1, turn: 1.4 };

  test("the plain idle/walk/run graph keeps its entry and only adds the inert turn blend", () => {
    const graph = locomotionGraph({ idle: "idle", walk: "walk", run: "run" });
    const layer = graph.layers[0]!;
    expect(layer.entry).toBe(LOCOMOTION_STATE);
    expect(Object.keys(layer.states)).toEqual([LOCOMOTION_STATE, LOCOMOTION_TURN_STATE]);
  });

  test("a speed ramp blends idle to walk to run with no step bigger than one crossfade frame", () => {
    const graph = locomotionGraph(DIRECTIONAL);
    const { samples } = ramp(graph, LOCOMOTION_SPEED_PARAM, 0, 8, 800);
    let worstStep = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const total = Object.values(samples[i]!).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
      for (const clip of ["idle", "walk", "run"]) {
        worstStep = Math.max(worstStep, Math.abs((samples[i]![clip] ?? 0) - (samples[i - 1]![clip] ?? 0)));
      }
    }
    expect(samples[0]!.idle).toBeCloseTo(1, 6);
    expect(samples[samples.length - 1]!.run).toBeCloseTo(1, 6);
    expect(samples[50]!.walk ?? 0).toBeGreaterThan(0.99);
    // The ramp advances 0.01 speed units per frame; a hard switch would step the weight by 1.
    expect(worstStep).toBeLessThan(0.05);
    const report = [0, 1, 2, 4, 6, 8]
      .map((speed) => {
        const s = samples[speed * 100]!;
        return `${speed} m/s idle=${(s.idle ?? 0).toFixed(3)} walk=${(s.walk ?? 0).toFixed(3)} run=${(s.run ?? 0).toFixed(3)}`;
      })
      .join(" | ");
    console.log(`speed ramp blend weights: ${report}`);
  });

  test("a direction ramp hands off to the strafe blend and back without popping", () => {
    const graph = locomotionGraph(DIRECTIONAL);
    const { runtime, samples } = ramp(graph, "direction", 0, 1, 120, { speed: 1.2 });
    let worstStep = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const total = Object.values(samples[i]!).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
      for (const clip of ["walk", "strafeL", "strafeR"]) {
        worstStep = Math.max(worstStep, Math.abs((samples[i]![clip] ?? 0) - (samples[i - 1]![clip] ?? 0)));
      }
    }
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_STRAFE_STATE);
    expect(samples[samples.length - 1]!.strafeR).toBeCloseTo(1, 2);
    expect(worstStep).toBeLessThan(0.15);
  });

  test("the strafe blend still resolves both sides across the full lateral range", () => {
    const graph = locomotionGraph(DIRECTIONAL);
    const runtime = createAnimGraphRuntime(graph);
    for (let i = 0; i < 40; i += 1) runtime.advance(1 / 60, { speed: 1.2, direction: -1 }, CLIPS);
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_STRAFE_STATE);
    expect(weightsOf(runtime.advance(1 / 60, { speed: 1.2, direction: -1 }, CLIPS)).strafeL).toBeCloseTo(1, 2);
    for (let i = 0; i < 40; i += 1) runtime.advance(1 / 60, { speed: 1.2, direction: 1 }, CLIPS);
    expect(weightsOf(runtime.advance(1 / 60, { speed: 1.2, direction: 1 }, CLIPS)).strafeR).toBeCloseTo(1, 2);
  });

  test("walking backwards enters the backward blend and returns when facing forward", () => {
    const graph = locomotionGraph(DIRECTIONAL);
    const runtime = createAnimGraphRuntime(graph);
    for (let i = 0; i < 30; i += 1) runtime.advance(1 / 60, { speed: 1.5, facing: -1, direction: 0 }, CLIPS);
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_BACKWARD_STATE);
    expect(weightsOf(runtime.advance(1 / 60, { speed: 1.5, facing: -1, direction: 0 }, CLIPS)).back).toBeCloseTo(1, 2);
    for (let i = 0; i < 30; i += 1) runtime.advance(1 / 60, { speed: 1.5, facing: 1, direction: 0 }, CLIPS);
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_STATE);
  });

  test("turning on the spot blends idle into the pivot clip and releases at rest", () => {
    const graph = locomotionGraph(DIRECTIONAL);
    const runtime = createAnimGraphRuntime(graph);
    for (let i = 0; i < 30; i += 1) runtime.advance(1 / 60, { speed: 0, turnRate: 3 }, CLIPS);
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_TURN_STATE);
    const turning = weightsOf(runtime.advance(1 / 60, { speed: 0, turnRate: 3 }, CLIPS));
    expect(turning.turn ?? 0).toBeGreaterThan(0.5);
    expect((turning.idle ?? 0) + (turning.turn ?? 0)).toBeCloseTo(1, 6);
    for (let i = 0; i < 30; i += 1) runtime.advance(1 / 60, { speed: 0, turnRate: 0 }, CLIPS);
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_STATE);
  });

  test("a rig with no turn clip pivots on its walk clip instead of holding the bind pose", () => {
    const graph = locomotionGraph({ idle: "idle", walk: "walk" });
    const runtime = createAnimGraphRuntime(graph);
    for (let i = 0; i < 40; i += 1) runtime.advance(1 / 60, { speed: 0, turnRate: 4 }, CLIPS);
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_TURN_STATE);
    expect(weightsOf(runtime.advance(1 / 60, { speed: 0, turnRate: 4 }, CLIPS)).walk).toBeCloseTo(1, 2);
  });

  test("an armed hit still wins over the direction transitions", () => {
    const graph = locomotionGraph({ ...DIRECTIONAL, oneShots: { hit: "hit" } });
    const runtime = createAnimGraphRuntime(graph);
    for (let i = 0; i < 30; i += 1) runtime.advance(1 / 60, { speed: 1.2, direction: 0.9 }, CLIPS);
    expect(runtime.stateOf("base")).toBe(LOCOMOTION_STRAFE_STATE);
    runtime.trigger("hit");
    runtime.advance(1 / 60, { speed: 1.2, direction: 0.9 }, CLIPS);
    expect(runtime.stateOf("base")).toBe("hit");
  });

  test("a root-motion locomotion set reports blended root travel", () => {
    const graph = locomotionGraph({ idle: "Idle", walk: "Walk", run: "Run", walkSpeed: 0.5, runSpeed: 6, rootMotion: true });
    const track = (travel: number) => ({ times: new Float32Array([0, 1]), values: new Float32Array([0, 0, 0, 0, 0, travel]) });
    const durations = {
      Idle: { duration: 1, rootTrack: track(0) },
      Walk: { duration: 1, rootTrack: track(0.5) },
      Run: { duration: 1, rootTrack: track(2) },
    };
    // Speed 3.25 puts half the weight on walk and half on run.
    const runtime = createAnimGraphRuntime(graph);
    const first = runtime.advance(0, { speed: 3.25 }, durations);
    expect(first.rootMotion).toBe(true);
    const blended = runtime.advance(1, { speed: 3.25 }, durations);
    expect(blended.rootMotion).toBe(true);
    // Half of walk's 0.5 m cycle plus half of run's 2 m cycle.
    expect(blended.rootDelta![2]).toBeCloseTo(1.25, 6);
    // A rig whose clips are authored in place reports no travel at all.
    const still = createAnimGraphRuntime(locomotionGraph({ idle: "Idle", walk: "Walk" }));
    expect(still.advance(1, { speed: 3 }, { Idle: 1, Walk: 1 }).rootMotion).toBeUndefined();
    expect(still.advance(1, { speed: 3 }, { Idle: 1, Walk: 1 }).rootDelta).toBeUndefined();
  });

  test("directional roles survive a config round trip through saved JSON", () => {
    const config: ModelAnimationConfig = {
      states: { idle: "idle", walk: "walk", run: "run", strafeLeft: "strafeL", strafeRight: "strafeR", backward: "back", turn: "turn" },
    };
    const graph = animGraphFromConfig(config)!;
    expect(parseAnimGraph(JSON.parse(JSON.stringify(graph)))).toEqual(graph);
    expect(Object.keys(graph.layers[0]!.states)).toEqual([
      LOCOMOTION_STATE,
      LOCOMOTION_STRAFE_STATE,
      LOCOMOTION_BACKWARD_STATE,
      LOCOMOTION_TURN_STATE,
    ]);
  });
});
