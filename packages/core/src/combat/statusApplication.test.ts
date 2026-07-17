import { describe, expect, it } from "bun:test";
import { seededRng } from "../random/rng";
import {
  resolveStatusApplication,
  type StatusApplicationSpec,
  type StatusInstance,
} from "./statusApplication";

const burn: StatusApplicationSpec = {
  status: "burn",
  chance: 0.5,
  durationMs: 4000,
  ticks: 8,
  magnitude: 10,
};

describe("resolveStatusApplication", () => {
  it("applies a fresh status when the roll lands under the chance", () => {
    const out = resolveStatusApplication({ spec: burn, rng: () => 0.1, source: "gun-1" });
    expect(out.kind).toBe("applied");
    expect(out.instance).toEqual({
      status: "burn",
      stacks: 1,
      remainingMs: 4000,
      ticks: 8,
      magnitude: 10,
      source: "gun-1",
    });
  });

  it("misses when the roll is at or above the effective chance", () => {
    const out = resolveStatusApplication({ spec: burn, rng: () => 0.9 });
    expect(out.kind).toBe("missed");
    expect(out.instance).toBeNull();
    expect(out.roll).toBe(0.9);
  });

  it("scales chance, magnitude, and duration by matchup outputs independently", () => {
    const out = resolveStatusApplication({
      spec: burn,
      scale: { applyChance: 2, magnitude: 1.5, duration: 2 },
      rng: () => 0.9, // 0.5 * 2 = 1.0 chance -> lands
    });
    expect(out.kind).toBe("applied");
    expect(out.chance).toBe(1);
    expect(out.instance?.magnitude).toBe(15);
    expect(out.instance?.remainingMs).toBe(8000);
    expect(out.instance?.ticks).toBe(16);
  });

  it("clamps effective chance into [0,1]", () => {
    const out = resolveStatusApplication({
      spec: { status: "slow", chance: 0.8 },
      scale: { applyChance: 5 },
      rng: () => 0.99,
    });
    expect(out.chance).toBe(1);
    expect(out.kind).toBe("applied");
  });

  it("blocks an immune target without rolling", () => {
    const out = resolveStatusApplication({
      spec: burn,
      immunity: { statuses: ["burn"] },
      rng: () => 0,
    });
    expect(out.kind).toBe("immune");
    expect(out.roll).toBeNull();
  });

  it("refresh keeps stacks and resets duration", () => {
    const current: StatusInstance = { status: "burn", stacks: 3, remainingMs: 100, ticks: 1, magnitude: 5 };
    const out = resolveStatusApplication({ spec: burn, current, rng: () => 0 });
    expect(out.kind).toBe("refreshed");
    expect(out.instance?.stacks).toBe(3);
    expect(out.instance?.remainingMs).toBe(4000);
  });

  it("stack increments up to max", () => {
    const spec: StatusApplicationSpec = { ...burn, stack: { kind: "stack", max: 4, add: 2 } };
    const current: StatusInstance = { status: "burn", stacks: 3, remainingMs: 100, ticks: 1, magnitude: 5 };
    const out = resolveStatusApplication({ spec, current, rng: () => 0 });
    expect(out.kind).toBe("stacked");
    expect(out.instance?.stacks).toBe(4);
  });

  it("ignore leaves an existing instance untouched without rolling", () => {
    const spec: StatusApplicationSpec = { ...burn, stack: { kind: "ignore" } };
    const current: StatusInstance = { status: "burn", stacks: 1, remainingMs: 100, ticks: 1, magnitude: 5 };
    const out = resolveStatusApplication({ spec, current, rng: () => 0 });
    expect(out.kind).toBe("ignored");
    expect(out.instance).toBe(current);
    expect(out.roll).toBeNull();
  });

  it("replace overwrites duration/magnitude and resets stacks to 1", () => {
    const spec: StatusApplicationSpec = { ...burn, stack: { kind: "replace" } };
    const current: StatusInstance = { status: "burn", stacks: 5, remainingMs: 100, ticks: 1, magnitude: 5 };
    const out = resolveStatusApplication({ spec, current, rng: () => 0 });
    expect(out.kind).toBe("replaced");
    expect(out.instance?.stacks).toBe(1);
    expect(out.instance?.magnitude).toBe(10);
  });

  it("is deterministic and reproducible under a seeded RNG", () => {
    const runs = () => {
      const rng = seededRng("issue-929");
      return Array.from({ length: 8 }, () => resolveStatusApplication({ spec: burn, rng }).kind);
    };
    expect(runs()).toEqual(runs());
  });

  it("survives a JSON serialize round-trip of spec and instance", () => {
    const out = resolveStatusApplication({ spec: burn, rng: () => 0 });
    const clone: StatusInstance = JSON.parse(JSON.stringify(out.instance));
    const next = resolveStatusApplication({
      spec: JSON.parse(JSON.stringify(burn)),
      current: clone,
      rng: () => 0,
    });
    expect(next.kind).toBe("refreshed");
    expect(next.instance?.stacks).toBe(1);
  });
});
