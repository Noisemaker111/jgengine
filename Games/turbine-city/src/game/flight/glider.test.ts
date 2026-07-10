import { describe, expect, test } from "bun:test";
import { NO_FLOW, type FlowSample } from "./flowTube";
import { controlDegradation, DEFAULT_GLIDER_TUNING, initialGliderState, resolveSteerInput, stepGlider } from "./glider";

describe("controlDegradation", () => {
  test("no buffet leaves control at full responsiveness", () => {
    expect(controlDegradation(0)).toBe(1);
  });

  test("max buffet never drops control below the configured floor", () => {
    expect(controlDegradation(1, 0.4)).toBeCloseTo(0.4, 5);
    expect(controlDegradation(5, 0.4)).toBeCloseTo(0.4, 5);
  });

  test("degradation is bounded within [minControl, 1] across the whole range", () => {
    for (let buffet = 0; buffet <= 1; buffet += 0.1) {
      const degrade = controlDegradation(buffet, 0.4);
      expect(degrade).toBeLessThanOrEqual(1);
      expect(degrade).toBeGreaterThanOrEqual(0.4);
    }
  });
});

describe("stepGlider", () => {
  const input = { yaw: 0, pitch: 0, thrust: 1, brake: 0, dodgeRequested: false };

  test("thrust with no flow accelerates forward from rest", () => {
    const state = initialGliderState([0, 20, 0], 0);
    const next = stepGlider(state, input, NO_FLOW, [0, 0], 0.5, 0, DEFAULT_GLIDER_TUNING);
    expect(next.position[2]).toBeGreaterThan(0);
  });

  test("a core tube boosts speed far beyond weak self-thrust alone", () => {
    const state = initialGliderState([0, 20, 0], 0);
    const coreFlow: FlowSample = { tubeId: "t", inTube: true, inCore: true, alongFraction: 0.5, radialDistance: 0, axialDir: [0, 0, 1], radialDir: [0, 1, 0], axialSpeed: 30, buffet: 0 };
    let boosted = state;
    let unboosted = state;
    for (let i = 0; i < 20; i += 1) {
      boosted = stepGlider(boosted, input, coreFlow, [0, 0], 0.1, i * 0.1, DEFAULT_GLIDER_TUNING);
      unboosted = stepGlider(unboosted, input, NO_FLOW, [0, 0], 0.1, i * 0.1, DEFAULT_GLIDER_TUNING);
    }
    expect(boosted.position[2]).toBeGreaterThan(unboosted.position[2] * 3);
  });

  test("dodge shifts position laterally and then respects its cooldown", () => {
    const state = initialGliderState([0, 20, 0], 0);
    const dodgeInput = { ...input, thrust: 0, yaw: 1, dodgeRequested: true };
    const dodged = stepGlider(state, dodgeInput, NO_FLOW, [0, 0], 0.016, 0, DEFAULT_GLIDER_TUNING);
    expect(Math.abs(dodged.position[0])).toBeGreaterThan(0);
    expect(dodged.dodgeCooldownRemaining).toBeGreaterThan(0);

    const cannotRedodge = stepGlider(dodged, dodgeInput, NO_FLOW, [0, 0], 0.016, 0.02, DEFAULT_GLIDER_TUNING);
    expect(cannotRedodge.position[0]).toBeCloseTo(dodged.position[0], 5);
  });

  test("stepGlider is a pure function of its inputs", () => {
    const state = initialGliderState([1, 20, 2], 0.3);
    const a = stepGlider(state, input, NO_FLOW, [0.2, 0.1], 0.05, 3, DEFAULT_GLIDER_TUNING);
    const b = stepGlider(state, input, NO_FLOW, [0.2, 0.1], 0.05, 3, DEFAULT_GLIDER_TUNING);
    expect(a).toEqual(b);
  });
});

describe("resolveSteerInput", () => {
  test("arrow keys take priority over mouse offset", () => {
    const result = resolveSteerInput({ pitchUp: true, pitchDown: false, yawLeft: false, yawRight: true, mouseX: -0.9, mouseY: 0.9 });
    expect(result.yaw).toBe(1);
    expect(result.pitch).toBe(1);
  });

  test("mouse drives steering when no arrows are held", () => {
    const result = resolveSteerInput({ pitchUp: false, pitchDown: false, yawLeft: false, yawRight: false, mouseX: 0.5, mouseY: -0.5 });
    expect(result.yaw).toBe(0.5);
    expect(result.pitch).toBe(0.5);
  });
});
