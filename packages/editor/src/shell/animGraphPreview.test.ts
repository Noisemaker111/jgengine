import { describe, expect, test } from "bun:test";
import { locomotionGraph } from "@jgengine/core/anim/locomotionGraph";
import type { AnimGraph } from "@jgengine/core/anim/animGraph";
import { graphParamControls, graphTriggers, recordTrigger, simulateGraphPreview } from "./animGraphPreview";

const graph: AnimGraph = {
  ...locomotionGraph({ idle: "Idle", walk: "Walk", run: "Run", walkSpeed: 0.5, runSpeed: 6, oneShots: { attack: "Slash", death: "Die" } }),
  events: [{ clip: "Slash", atSec: 0.3, name: "hit" }],
};
const durations = { Idle: 2, Walk: 1, Run: 0.8, Slash: 0.6, Die: 1.5 };

describe("simulateGraphPreview", () => {
  test("the speed parameter blends locomotion", () => {
    const frame = simulateGraphPreview({ graph, durations, time: 0.5, params: { speed: 3.25 }, triggers: [] });
    expect(frame.states).toEqual({ base: "locomotion" });
    const weights = Object.fromEntries(frame.clips.map((clip) => [clip.clip, clip.weight]));
    expect(weights.Walk).toBeCloseTo(0.5, 6);
    expect(weights.Run).toBeCloseTo(0.5, 6);
  });

  test("a recorded trigger plays its one-shot, fires its event and returns to locomotion", () => {
    const triggers = recordTrigger([], "attack", 0.2);
    expect(simulateGraphPreview({ graph, durations, time: 0.1, params: { speed: 0 }, triggers }).states.base).toBe("locomotion");
    const during = simulateGraphPreview({ graph, durations, time: 0.6, params: { speed: 0 }, triggers });
    expect(during.states.base).toBe("attack");
    expect(during.events.map((event) => event.name)).toEqual(["hit"]);
    expect(during.events[0]!.at).toBeGreaterThan(0.45);
    expect(during.events[0]!.at).toBeLessThan(0.6);
    expect(simulateGraphPreview({ graph, durations, time: 1.5, params: { speed: 0 }, triggers }).states.base).toBe("locomotion");
  });

  test("scrubbing is deterministic and a trigger at the scrub time starts its transition", () => {
    const input = { graph, durations, time: 1, params: { speed: 1 }, triggers: recordTrigger([], "death", 1) };
    expect(simulateGraphPreview(input)).toEqual(simulateGraphPreview(input));
    expect(simulateGraphPreview(input).states.base).toBe("death");
  });

  test("unknown clip durations fall back to one second", () => {
    const frame = simulateGraphPreview({ graph, durations: {}, time: 1.25, params: { speed: 0 }, triggers: [] });
    expect(frame.clips.find((clip) => clip.clip === "Idle")!.time).toBeCloseTo(0.25, 6);
  });
});

describe("graph controls", () => {
  test("lists triggers and parameters with ranges covering the graph", () => {
    const withAim: AnimGraph = {
      layers: [
        ...graph.layers,
        {
          id: "upper",
          entry: "rest",
          states: { rest: { kind: "clip", clip: "Idle" }, aim: { kind: "clip", clip: "Aim" } },
          transitions: [{ from: "rest", to: "aim", when: [{ param: "aiming", op: "==", value: true }] }],
        },
      ],
    };
    expect(graphTriggers(withAim)).toEqual(["attack", "death"]);
    const controls = graphParamControls(withAim);
    expect(controls.map((control) => [control.name, control.kind])).toEqual([
      ["speed", "number"],
      ["aiming", "boolean"],
    ]);
    expect(controls[0]!.max).toBeGreaterThanOrEqual(7.5);
  });
});
