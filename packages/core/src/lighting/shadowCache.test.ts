import { describe, expect, test } from "bun:test";

import { createShadowLayerState, dropShadowLayer, planShadowPass, recordShadowPass, type ShadowPassPlan } from "./shadowCache";

const A = [1, 2, 3];
const B = [1, 2, 4];

/** Plan and record one pass, as the cache does each frame. */
function pass(state: ReturnType<typeof createShadowLayerState>, key: number[], reaches = false): ShadowPassPlan {
  const plan = planShadowPass(state, key, reaches);
  recordShadowPass(state, key, plan, reaches);
  return plan;
}

describe("planShadowPass", () => {
  test("a light draws full until it re-renders at an unchanged key", () => {
    const state = createShadowLayerState();
    expect(pass(state, A)).toBe("full");
    expect(pass(state, B)).toBe("full");
    // Held for the first time: build the layer, then the map is the layer and nothing changed.
    expect(pass(state, B)).toBe("rebuild");
    expect(pass(state, B)).toBe("hold");
    expect(pass(state, B)).toBe("hold");
  });

  test("a changed caster in reach turns hold into reuse, and hold comes back once it is gone", () => {
    const state = createShadowLayerState();
    pass(state, A);
    pass(state, A);
    expect(pass(state, A, true)).toBe("reuse");
    expect(pass(state, A, true)).toBe("reuse");
    // The map still holds that caster's last draw: one more reuse leaves the layer alone in it.
    expect(pass(state, A, false)).toBe("reuse");
    expect(pass(state, A, false)).toBe("hold");
  });

  test("a stale layer is rebuilt, never reused", () => {
    const state = createShadowLayerState();
    pass(state, A);
    pass(state, A);
    expect(pass(state, A)).toBe("hold");
    state.layerStale = true;
    expect(pass(state, A)).toBe("rebuild");
    expect(pass(state, A)).toBe("hold");
  });

  test("a light whose key moves every pass stays on full", () => {
    const state = createShadowLayerState();
    const plans = Array.from({ length: 6 }, (_, index) => pass(state, [index]));
    expect(plans).toEqual(["full", "full", "full", "full", "full", "full"]);
  });

  test("a move draws in full even after the light held still", () => {
    const state = createShadowLayerState();
    pass(state, A);
    pass(state, A);
    expect(pass(state, A)).toBe("hold");
    expect(pass(state, B)).toBe("full");
    expect(pass(state, B)).toBe("rebuild");
    expect(pass(state, B)).toBe("hold");
  });

  test("returning to the layer's key reuses it rather than holding a map drawn at another key", () => {
    const state = createShadowLayerState();
    pass(state, A);
    expect(pass(state, A)).toBe("rebuild");
    expect(pass(state, A)).toBe("hold");
    expect(pass(state, B)).toBe("full");
    expect(pass(state, A)).toBe("reuse");
    expect(pass(state, A)).toBe("hold");
  });

  test("a key that moves every other pass stops rebuilding layers it never uses", () => {
    // An uncapped frame rate over a fixed simulation step: the camera moves on one frame, holds on the next.
    const state = createShadowLayerState();
    const plans = Array.from({ length: 40 }, (_, index) => pass(state, [Math.floor(index / 2)]));
    expect(plans.filter((plan) => plan === "rebuild")).toHaveLength(1);
    expect(plans.slice(4).every((plan) => plan === "full")).toBe(true);
  });

  test("a key that holds for two passes after each move keeps a layer that serves one of them", () => {
    const state = createShadowLayerState();
    const plans = Array.from({ length: 30 }, (_, index) => pass(state, [Math.floor(index / 3)]));
    // Each move: full, then a rebuild, then a hold, so a third of the passes draw nothing.
    expect(plans.slice(0, 6)).toEqual(["full", "rebuild", "hold", "full", "rebuild", "hold"]);
    expect(plans.filter((plan) => plan === "hold")).toHaveLength(10);
  });

  test("after waiting longer for short holds, a long hold builds the layer and the wait comes back down", () => {
    const state = createShadowLayerState();
    for (let index = 0; index < 20; index += 1) pass(state, [Math.floor(index / 2)]);
    expect(state.rebuildAfter).toBe(2);
    expect(pass(state, A)).toBe("full");
    expect(pass(state, A)).toBe("full");
    expect(pass(state, A)).toBe("rebuild");
    expect(pass(state, A)).toBe("hold");
    expect(state.rebuildAfter).toBe(1);
  });

  test("a dropped layer is rebuilt before anything holds", () => {
    const state = createShadowLayerState();
    pass(state, A);
    pass(state, A);
    expect(pass(state, A)).toBe("hold");
    dropShadowLayer(state);
    expect(pass(state, A)).toBe("rebuild");
  });
});
