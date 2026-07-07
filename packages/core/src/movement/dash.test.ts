import { describe, expect, test } from "bun:test";
import { createDashState, dashOffset, iframeActive, type DashConfig } from "@jgengine/core/movement/dash";

const config: DashConfig = {
  distance: 6,
  durationMs: 300,
  iframes: { fromMs: 40, toMs: 220 },
  staminaCost: 30,
  staminaMax: 100,
  staminaRegenPerSecond: 20,
  cooldownMs: 500,
};

describe("dash", () => {
  test("iframe window overlap", () => {
    expect(iframeActive(config, 20)).toBe(false);
    expect(iframeActive(config, 100)).toBe(true);
    expect(iframeActive(config, 250)).toBe(false);
  });

  test("displacement eases from 0 to full distance", () => {
    expect(dashOffset(config, { x: 1, z: 0 }, 0)[0]).toBeCloseTo(0);
    expect(dashOffset(config, { x: 1, z: 0 }, 300)[0]).toBeCloseTo(6);
    expect(dashOffset(config, { x: 0, z: 0 }, 150)).toEqual([0, 0, 0]);
  });

  test("dash spends stamina and grants i-frames mid-burst", () => {
    const dash = createDashState(config);
    const burst = dash.tryDash({ x: 0, z: 1 }, 0);
    expect("direction" in burst).toBe(true);
    expect(dash.stamina()).toBe(70);
    expect(dash.isInvulnerable(100)).toBe(true);
    expect(dash.isInvulnerable(260)).toBe(false);
  });

  test("cannot dash without enough stamina", () => {
    const dash = createDashState({ ...config, staminaMax: 20 });
    const result = dash.tryDash({ x: 1, z: 0 }, 0);
    expect(result).toEqual({ reason: "no-stamina" });
  });

  test("cooldown blocks a second dash until it clears", () => {
    const dash = createDashState(config);
    dash.tryDash({ x: 1, z: 0 }, 0);
    dash.tick(0.4, 400);
    expect(dash.tryDash({ x: 1, z: 0 }, 400)).toEqual({ reason: "cooldown" });
    dash.tick(5, 1000);
    expect("direction" in dash.tryDash({ x: 1, z: 0 }, 1000)).toBe(true);
  });

  test("stamina regenerates over time up to the cap", () => {
    const dash = createDashState(config);
    dash.tryDash({ x: 1, z: 0 }, 0);
    dash.tick(1, 400);
    expect(dash.stamina()).toBeCloseTo(90);
    dash.tick(5, 5000);
    expect(dash.stamina()).toBe(100);
  });
});
