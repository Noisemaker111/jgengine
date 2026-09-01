import { describe, expect, test } from "bun:test";

import { createAnimGraphRuntime, stateClipWeights, type AnimGraph } from "./animGraph";
import { locomotionGraph } from "./locomotionGraph";

const clips = { idle: 2, walk: 1, run: 0.8, attack: 0.5, die: 1.5 };

function weightOf(out: ReturnType<ReturnType<typeof createAnimGraphRuntime>["advance"]>, clip: string): number {
  return out.clips.filter((c) => c.clip === clip).reduce((sum, c) => sum + c.weight, 0);
}

describe("stateClipWeights", () => {
  test("blend1D interpolates between neighbours and clamps at the ends", () => {
    const state = { kind: "blend1D" as const, param: "speed", points: [{ at: 0, clip: "idle" }, { at: 2, clip: "walk" }, { at: 6, clip: "run" }] };
    expect(stateClipWeights(state, { speed: 1 })).toEqual({ idle: 0.5, walk: 0.5 });
    expect(stateClipWeights(state, { speed: 9 })).toEqual({ run: 1 });
    expect(stateClipWeights(state, {})).toEqual({ idle: 1 });
  });

  test("blend2D favours the nearest point and snaps on an exact match", () => {
    const state = {
      kind: "blend2D" as const,
      params: ["x", "y"] as const,
      points: [
        { at: [0, 1] as const, clip: "fwd" },
        { at: [1, 0] as const, clip: "right" },
      ],
    };
    const w = stateClipWeights(state, { x: 0.2, y: 0.8 });
    expect(w.fwd!).toBeGreaterThan(w.right!);
    expect(stateClipWeights(state, { x: 1, y: 0 })).toEqual({ right: 1 });
  });
});

describe("createAnimGraphRuntime", () => {
  test("a clip state advances time, loops, and fires events across the wrap", () => {
    const graph: AnimGraph = {
      layers: [{ id: "base", entry: "idle", states: { idle: { kind: "clip", clip: "walk" } }, transitions: [] }],
      events: [{ clip: "walk", atSec: 0.9, name: "footstep" }],
    };
    const rt = createAnimGraphRuntime(graph);
    const first = rt.advance(0.5, {}, clips);
    expect(first.clips).toEqual([{ clip: "walk", weight: 1, time: 0.5, layer: "base" }]);
    expect(first.events).toEqual([]);
    const second = rt.advance(0.5, {}, clips);
    expect(second.clips[0]!.time).toBeCloseTo(0, 6);
    expect(second.events).toEqual([{ name: "footstep", clip: "walk" }]);
  });

  test("transitions crossfade by weight and consume their trigger", () => {
    const rt = createAnimGraphRuntime(locomotionGraph({ idle: "idle", walk: "walk", oneShots: { attack: "attack" } }));
    rt.advance(0.1, { speed: 0 }, clips);
    rt.trigger("attack");
    const start = rt.advance(0.0, { speed: 0 }, clips);
    expect(rt.stateOf("base")).toBe("attack");
    expect(weightOf(start, "idle")).toBeCloseTo(1, 6);
    const mid = rt.advance(0.05, { speed: 0 }, clips);
    expect(weightOf(mid, "attack")).toBeCloseTo(0.5, 6);
    expect(weightOf(mid, "idle")).toBeCloseTo(0.5, 6);
    rt.advance(0.05, { speed: 0 }, clips);
    const done = rt.advance(0.1, { speed: 0 }, clips);
    expect(weightOf(done, "attack")).toBeCloseTo(1, 6);
    expect(weightOf(done, "idle")).toBe(0);
    expect(rt.state().triggers).toEqual([]);
  });

  test("a one-shot returns to locomotion at its exit time and death clamps", () => {
    const rt = createAnimGraphRuntime(locomotionGraph({ idle: "idle", walk: "walk", oneShots: { attack: "attack", death: "die" } }));
    rt.trigger("attack");
    rt.advance(0, { speed: 0 }, clips);
    for (let i = 0; i < 4; i += 1) rt.advance(0.1, { speed: 0 }, clips);
    expect(rt.stateOf("base")).toBe("attack");
    rt.advance(0.2, { speed: 0 }, clips);
    expect(rt.stateOf("base")).toBe("locomotion");
    rt.trigger("death");
    rt.advance(0, { speed: 0 }, clips);
    for (let i = 0; i < 30; i += 1) rt.advance(0.1, { speed: 0 }, clips);
    expect(rt.stateOf("base")).toBe("death");
    const held = rt.advance(0.1, { speed: 0 }, clips);
    expect(held.clips[0]!.time).toBe(clips.die);
  });

  test("locomotion blends by the speed parameter", () => {
    const rt = createAnimGraphRuntime(locomotionGraph({ idle: "idle", walk: "walk", run: "run", walkSpeed: 1, runSpeed: 5 }));
    const walking = rt.advance(0.1, { speed: 3 }, clips);
    expect(weightOf(walking, "walk")).toBeCloseTo(0.5, 6);
    expect(weightOf(walking, "run")).toBeCloseTo(0.5, 6);
    expect(weightOf(walking, "idle")).toBe(0);
  });

  test("layers weight their output and snapshot/restore round-trips", () => {
    const graph: AnimGraph = {
      layers: [
        { id: "base", entry: "a", states: { a: { kind: "clip", clip: "idle" } }, transitions: [] },
        { id: "upper", entry: "b", states: { b: { kind: "clip", clip: "attack" } }, transitions: [], mask: ["Spine"], weight: 0.5 },
      ],
    };
    const rt = createAnimGraphRuntime(graph);
    const out = rt.advance(0.25, {}, clips);
    expect(out.clips.find((c) => c.layer === "upper")!.weight).toBe(0.5);
    const saved = rt.snapshot();
    rt.advance(1, {}, clips);
    rt.restore(saved);
    expect(rt.advance(0, {}, clips).clips.find((c) => c.clip === "idle")!.time).toBeCloseTo(0.25, 6);
  });

  test("parameter conditions gate transitions", () => {
    const graph: AnimGraph = {
      layers: [
        {
          id: "base",
          entry: "idle",
          states: { idle: { kind: "clip", clip: "idle" }, aim: { kind: "clip", clip: "attack" } },
          transitions: [
            { from: "idle", to: "aim", when: [{ param: "aiming", op: "==", value: true }], duration: 0 },
            { from: "aim", to: "idle", when: [{ param: "aiming", op: "!=", value: true }], duration: 0 },
          ],
        },
      ],
    };
    const rt = createAnimGraphRuntime(graph);
    rt.advance(0.1, { aiming: false }, clips);
    expect(rt.stateOf("base")).toBe("idle");
    rt.advance(0.1, { aiming: true }, clips);
    expect(rt.stateOf("base")).toBe("aim");
    rt.advance(0.1, { aiming: false }, clips);
    expect(rt.stateOf("base")).toBe("idle");
  });
});
