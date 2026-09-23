import { describe, expect, test } from "bun:test";
import { createSimulationCuller } from "@jgengine/core/visibility/simulationCulling";

describe("simulationCulling", () => {
  test("disabled by default: step always updates", () => {
    const culler = createSimulationCuller();
    expect(culler.enabled()).toBe(false);
    const decision = culler.step("a", 500, 0.016);
    expect(decision.update).toBe(true);
    expect(decision.elapsed).toBe(0.016);
  });

  test("a protected id always updates even when enabled", () => {
    const culler = createSimulationCuller({ enabled: true, isProtected: (id) => id === "hero" });
    for (let i = 0; i < 5; i += 1) {
      expect(culler.step("hero", 500, 0.05).update).toBe(true);
    }
  });

  test("a distant non-protected entity updates less often than every tick", () => {
    const culler = createSimulationCuller({ enabled: true });
    let updates = 0;
    let skips = 0;
    for (let i = 0; i < 10; i += 1) {
      if (culler.step("mob", 100, 0.05).update) updates += 1;
      else skips += 1;
    }
    expect(skips).toBeGreaterThan(0);
    expect(updates).toBeLessThan(10);
  });

  test("a near entity in the zero-interval band always updates", () => {
    const culler = createSimulationCuller({ enabled: true });
    for (let i = 0; i < 5; i += 1) {
      expect(culler.step("near", 10, 0.016).update).toBe(true);
    }
  });

  test("setEnabled(false) restores always-update", () => {
    const culler = createSimulationCuller({ enabled: true });
    let sawFalse = false;
    for (let i = 0; i < 10; i += 1) {
      if (!culler.step("mob", 100, 0.05).update) {
        sawFalse = true;
        break;
      }
    }
    expect(sawFalse).toBe(true);
    culler.setEnabled(false);
    expect(culler.enabled()).toBe(false);
    expect(culler.step("mob", 100, 0.05).update).toBe(true);
  });

  test("forget resets an id's throttling accumulator instead of carrying it over", () => {
    const culler = createSimulationCuller({ enabled: true });
    culler.step("mob", 100, 0.01);
    culler.forget("mob");
    expect(culler.step("mob", 100, 0).update).toBe(false);
  });

  test("clear resets every tracked entity's accumulator", () => {
    const culler = createSimulationCuller({ enabled: true });
    culler.step("a", 100, 0.01);
    culler.step("b", 100, 0.01);
    culler.clear();
    expect(culler.step("a", 100, 0).update).toBe(false);
    expect(culler.step("b", 100, 0).update).toBe(false);
  });
});

describe("simulation culler snapshot", () => {
  test("snapshot and restore replay bit-exactly", () => {
    const culler = createSimulationCuller({ enabled: true, beyondInterval: 0.5 });
    for (const id of ["near", "mid", "far"]) culler.step(id, id === "near" ? 10 : id === "mid" ? 120 : 400, 0.05);
    const saved = culler.snapshot();
    const frozen = JSON.parse(JSON.stringify(saved));
    const play = () => {
      const out = [];
      for (let i = 0; i < 15; i += 1) for (const id of ["near", "mid", "far"]) out.push(culler.step(id, 60 + i * 20, 0.05));
      return out;
    };
    const a = play();
    culler.setEnabled(false);
    expect(saved).toEqual(frozen);
    culler.restore(saved);
    expect(play()).toEqual(a);
  });
});
