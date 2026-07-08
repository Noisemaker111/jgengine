import { describe, expect, test } from "bun:test";
import {
  pointInTelegraph,
  telegraphFired,
  telegraphFiredAtTurn,
  telegraphProgress,
  telegraphTurnProgress,
  telegraphTurnsRemaining,
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

describe("turn-scoped telegraph", () => {
  const cfg: TelegraphConfig = { shape: { kind: "circle", radius: 5 }, at: [0, 0, 0], turns: 2 };

  test("turn progress ramps 0..1 then fires", () => {
    expect(telegraphTurnProgress(cfg, 10, 10)).toBe(0);
    expect(telegraphTurnProgress(cfg, 10, 11)).toBeCloseTo(0.5);
    expect(telegraphTurnProgress(cfg, 10, 12)).toBe(1);
    expect(telegraphTurnProgress(cfg, 10, 20)).toBe(1);
  });

  test("telegraphFiredAtTurn fires once the turn count elapses", () => {
    expect(telegraphFiredAtTurn(cfg, 10, 11)).toBe(false);
    expect(telegraphFiredAtTurn(cfg, 10, 12)).toBe(true);
    expect(telegraphFiredAtTurn(cfg, 10, 13)).toBe(true);
  });

  test("telegraphTurnsRemaining counts down to zero and clamps there", () => {
    expect(telegraphTurnsRemaining(cfg, 10, 10)).toBe(2);
    expect(telegraphTurnsRemaining(cfg, 10, 11)).toBe(1);
    expect(telegraphTurnsRemaining(cfg, 10, 12)).toBe(0);
    expect(telegraphTurnsRemaining(cfg, 10, 15)).toBe(0);
  });

  test("a zero-or-unset turns config fires immediately", () => {
    const instant: TelegraphConfig = { shape: { kind: "circle", radius: 1 }, at: [0, 0, 0] };
    expect(telegraphTurnProgress(instant, 5, 5)).toBe(1);
    expect(telegraphFiredAtTurn(instant, 5, 5)).toBe(true);
    expect(telegraphTurnsRemaining(instant, 5, 5)).toBe(0);
  });

  test("real-time windupMs API is untouched by the turn-scoped variant", () => {
    expect(telegraphProgress(1000, 0, 500)).toBeCloseTo(0.5);
    expect(telegraphFired(1000, 0, 1000)).toBe(true);
  });
});
