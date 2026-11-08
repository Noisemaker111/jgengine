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

  test("a light that held still rebuilds on its first move, then goes back to full while moving", () => {
    const state = createShadowLayerState();
    pass(state, A);
    pass(state, A);
    expect(pass(state, B)).toBe("rebuild");
    expect(pass(state, [9])).toBe("full");
    expect(pass(state, [9])).toBe("rebuild");
  });

  test("returning to the layer's key reuses it rather than holding a map drawn at another key", () => {
    const state = createShadowLayerState();
    pass(state, A);
    pass(state, A);
    expect(pass(state, B)).toBe("rebuild");
    expect(pass(state, B)).toBe("hold");
    expect(pass(state, A)).toBe("rebuild");
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
