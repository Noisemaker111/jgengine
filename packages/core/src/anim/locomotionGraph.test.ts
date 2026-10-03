import { describe, expect, test } from "bun:test";
import { createAnimGraphRuntime } from "./animGraph";
import { animGraphFromConfig, locomotionGraph } from "./locomotionGraph";
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
