import { describe, expect, test } from "bun:test";

import { createAnimGraphRuntime } from "./animGraph";
import { ACTION_REST_STATE, actionLayer, withActionLayers } from "./actionLayer";
import { locomotionGraph } from "./locomotionGraph";
import { LOWER_BODY_MASK, SKELETON_SLOTS, UPPER_BODY_MASK, standardBoneMask } from "./skeletonStandard";

const CLIPS = { Idle: 2, Walk: 1, Hit_A: 0.6, Hit_B: 0.7, Reload: 1.1 };

describe("standard bone masks", () => {
  test("a sided slot contributes its side-less prefix, an unsided slot its runtime name", () => {
    expect(standardBoneMask(["upperLeg.l", "hand.r", "hips", "chest"])).toEqual(["upperleg", "hand", "hips", "chest"]);
  });

  test("the shipped masks cover the standard's upper and lower halves", () => {
    expect(UPPER_BODY_MASK).toEqual(["spine", "chest", "head", "upperarm", "lowerarm", "hand", "handslot"]);
    expect(LOWER_BODY_MASK).toEqual(["hips", "upperleg", "lowerleg", "foot", "toes"]);
    for (const prefix of [...UPPER_BODY_MASK, ...LOWER_BODY_MASK]) {
      expect(SKELETON_SLOTS.some((slot) => slot.toLowerCase().startsWith(prefix))).toBe(true);
    }
  });
});

describe("actionLayer", () => {
  test("an unmasked or restless overlay is rejected instead of driving the whole rig", () => {
    expect(() => actionLayer({ id: "hit", mask: [], rest: "Idle", actions: { hit: "Hit_A" } })).toThrow(/mask/);
    expect(() => actionLayer({ id: "hit", mask: ["  "], rest: "Idle", actions: { hit: "Hit_A" } })).toThrow(/mask/);
    expect(() => actionLayer({ id: "hit", mask: ["chest"], rest: " ", actions: { hit: "Hit_A" } })).toThrow(/rest/);
    expect(() => actionLayer({ id: "hit", mask: ["chest"], rest: "Idle", actions: { rest: "Hit_A" } })).toThrow(/resting state/);
  });

  test("the layer carries its mask, blend mode and weight", () => {
    const layer = actionLayer({ id: "hit", mask: [" chest ", "spine"], rest: "Idle", actions: { hit: ["Hit_A", "Hit_B"] }, additive: true, weight: 0.5 });
    expect(layer.id).toBe("hit");
    expect(layer.entry).toBe(ACTION_REST_STATE);
    expect(layer.mask).toEqual(["chest", "spine"]);
    expect(layer.additive).toBe(true);
    expect(layer.weight).toBe(0.5);
    expect(layer.states.hit).toMatchObject({ clip: "Hit_A", loop: false, variants: ["Hit_A", "Hit_B"] });
  });

  test("an additive layer holds its rest frame so rest contributes no pose", () => {
    const additive = actionLayer({ id: "hit", mask: ["chest"], rest: "Idle", actions: { hit: "Hit_A" }, additive: true });
    expect(additive.states[ACTION_REST_STATE]).toMatchObject({ clip: "Idle", speed: 0 });
    const plain = actionLayer({ id: "aim", mask: ["chest"], rest: "Idle", actions: { reload: "Reload" } });
    expect(plain.states[ACTION_REST_STATE]).toMatchObject({ clip: "Idle" });
    expect((plain.states[ACTION_REST_STATE] as { speed?: number }).speed).toBeUndefined();
    expect(plain.additive).toBeUndefined();
  });

  test("an action plays once on its trigger and returns to rest", () => {
    const layer = actionLayer({ id: "hit", mask: ["chest"], rest: "Idle", actions: { hit: "Hit_A" } });
    const runtime = createAnimGraphRuntime({ layers: [layer] });
    expect(runtime.stateOf("hit")).toBe(ACTION_REST_STATE);
    expect(runtime.advance(1 / 60, {}, CLIPS).clips).toEqual([{ clip: "Idle", weight: 1, time: 1 / 60, layer: "hit" }]);
    runtime.trigger("hit");
    // The trigger is consumed at the end of an advance; the action is current from the next one.
    runtime.advance(0, {}, CLIPS);
    expect(runtime.stateOf("hit")).toBe("hit");
    expect(runtime.advance(1 / 60, {}, CLIPS).clips.some((entry) => entry.clip === "Hit_A")).toBe(true);
    // Held for the clip's length, then released.
    for (let i = 0; i < 60; i += 1) runtime.advance(1 / 60, {}, CLIPS);
    expect(runtime.stateOf("hit")).toBe(ACTION_REST_STATE);
  });

  test("two variants pick one per entry with a single roll", () => {
    const layer = actionLayer({ id: "hit", mask: ["chest"], rest: "Idle", actions: { hit: ["Hit_A", "Hit_B"] } });
    let rolls = 0;
    const runtime = createAnimGraphRuntime({ layers: [layer] }, { rng: () => { rolls += 1; return 0.9; } });
    runtime.trigger("hit");
    runtime.advance(0, {}, CLIPS);
    expect(runtime.advance(1 / 60, {}, CLIPS).clips.some((entry) => entry.clip === "Hit_B")).toBe(true);
    expect(rolls).toBe(1);
  });
});

describe("withActionLayers", () => {
  test("an overlay sits on the locomotion graph and both layers contribute one unit each", () => {
    const graph = withActionLayers(locomotionGraph({ idle: "Idle", walk: "Walk" }), [
      { id: "hit", mask: UPPER_BODY_MASK, rest: "Idle", actions: { hit: ["Hit_A", "Hit_B"] }, additive: true },
    ]);
    expect(graph.layers.map((layer) => layer.id)).toEqual(["base", "hit"]);
    const runtime = createAnimGraphRuntime(graph);
    const output = runtime.advance(1 / 60, { speed: 2 }, CLIPS);
    const byLayer = new Map<string, number>();
    for (const entry of output.clips) byLayer.set(entry.layer, (byLayer.get(entry.layer) ?? 0) + entry.weight);
    expect(byLayer.get("base")).toBeCloseTo(1, 6);
    expect(byLayer.get("hit")).toBeCloseTo(1, 6);
    runtime.trigger("hit");
    runtime.advance(1 / 60, { speed: 2 }, CLIPS);
    const overlaid = runtime.advance(1 / 60, { speed: 2 }, CLIPS);
    expect(overlaid.clips.some((entry) => entry.layer === "hit" && entry.clip.startsWith("Hit_"))).toBe(true);
    expect(overlaid.clips.some((entry) => entry.layer === "base" && entry.clip === "Walk")).toBe(true);
  });

  test("a duplicate layer id is rejected rather than shadowing the base", () => {
    const graph = locomotionGraph({ idle: "Idle", walk: "Walk" });
    expect(() => withActionLayers(graph, [{ id: "base", mask: ["chest"], rest: "Idle", actions: {} }])).toThrow(/already has a layer/);
  });

  test("events on the base graph survive adding overlays", () => {
    const graph = locomotionGraph({ idle: "Idle", walk: "Walk" });
    const withEvent = { ...graph, events: [{ clip: "Walk", atSec: 0.5, name: "footstep" }] };
    expect(withActionLayers(withEvent, []).events).toEqual(withEvent.events);
  });
});
