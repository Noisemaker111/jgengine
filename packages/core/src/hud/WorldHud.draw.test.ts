// home-ok: world-space HUD (nameplates, entity bars, float text, reticle, tracers, telegraphs) is HUD drawn in the scene
import { describe, expect, test } from "bun:test";

import { telegraphPulseOpacity } from "@jgengine/shell/world/telegraphPulse";

describe("telegraphPulseOpacity", () => {
  test("pulses from 0.45 to 0.95 across the windup without needing React state", () => {
    expect(telegraphPulseOpacity(1000, 1000, 1000)).toBeCloseTo(0.45, 5);
    expect(telegraphPulseOpacity(1000, 1000, 1500)).toBeCloseTo(0.7, 5);
    expect(telegraphPulseOpacity(1000, 1000, 2000)).toBeCloseTo(0.95, 5);
    expect(telegraphPulseOpacity(1000, 1000, 3000)).toBeCloseTo(0.95, 5);
  });
});
