import { describe, expect, test } from "bun:test";
import {
  pointInTelegraph,
  telegraphFired,
  telegraphProgress,
  type TelegraphConfig,
} from "@jgengine/core/combat/telegraph";

describe("telegraph", () => {
  test("windup progress ramps 0..1 then fires", () => {
    expect(telegraphProgress(1000, 0, 500)).toBeCloseTo(0.5);
    expect(telegraphProgress(1000, 0, 1500)).toBe(1);
    expect(telegraphFired(1000, 0, 999)).toBe(false);
    expect(telegraphFired(1000, 0, 1000)).toBe(true);
  });

  test("circle contains points inside radius", () => {
    const cfg: TelegraphConfig = { shape: { kind: "circle", radius: 5 }, at: [0, 0, 0], windupMs: 500 };
    expect(pointInTelegraph(cfg, [3, 0, 0])).toBe(true);
    expect(pointInTelegraph(cfg, [6, 0, 0])).toBe(false);
  });

  test("ring excludes the inner hole", () => {
    const cfg: TelegraphConfig = {
      shape: { kind: "ring", radius: 6, innerRadius: 3 },
      at: [0, 0, 0],
      windupMs: 500,
    };
    expect(pointInTelegraph(cfg, [2, 0, 0])).toBe(false);
    expect(pointInTelegraph(cfg, [4, 0, 0])).toBe(true);
  });

  test("cone respects facing and half-angle", () => {
    const cfg: TelegraphConfig = {
      shape: { kind: "cone", radius: 8, angle: Math.PI / 2 },
      at: [0, 0, 0],
      dir: 0,
      windupMs: 500,
    };
    expect(pointInTelegraph(cfg, [0, 0, 5])).toBe(true);
    expect(pointInTelegraph(cfg, [0, 0, -5])).toBe(false);
    expect(pointInTelegraph(cfg, [2, 0, 5])).toBe(true);
    expect(pointInTelegraph(cfg, [5, 0, 0])).toBe(false);
  });

  test("line covers a forward strip within width", () => {
    const cfg: TelegraphConfig = {
      shape: { kind: "line", length: 10, width: 2 },
      at: [0, 0, 0],
      dir: 0,
      windupMs: 500,
    };
    expect(pointInTelegraph(cfg, [0.5, 0, 5])).toBe(true);
    expect(pointInTelegraph(cfg, [2, 0, 5])).toBe(false);
    expect(pointInTelegraph(cfg, [0, 0, 12])).toBe(false);
  });
});
