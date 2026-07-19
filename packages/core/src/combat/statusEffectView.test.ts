import { describe, expect, test } from "bun:test";
import type { StatusInstance } from "@jgengine/core/combat/statusApplication";
import {
  statusEffectRemainingFraction,
  toStatusEffectView,
  toStatusEffectViews,
} from "@jgengine/core/combat/statusEffectView";

function instance(overrides: Partial<StatusInstance> = {}): StatusInstance {
  return { status: "poison", stacks: 1, remainingMs: 3000, ticks: 3, magnitude: 5, ...overrides };
}

describe("status effect view adapter", () => {
  test("maps a live instance onto the ring-ready view shape", () => {
    const view = toStatusEffectView(instance(), { durationMs: 6000 });
    expect(view).toEqual({ id: "poison", kind: "poison", remainingMs: 3000, durationMs: 6000, stacks: 1, magnitude: 5 });
  });

  test("resolves duration per instance and never lets it fall below remaining", () => {
    const views = toStatusEffectViews(
      [instance({ status: "haste", remainingMs: 4000 }), instance({ status: "poison", remainingMs: 8000 })],
      { durationMs: (i) => (i.status === "haste" ? 5000 : 6000) },
    );
    expect(views[0]!.durationMs).toBe(5000);
    // remaining (8000) exceeds the given duration (6000) → clamp up so the fraction never exceeds 1.
    expect(views[1]!.durationMs).toBe(8000);
  });

  test("falls back to a full ring when no duration is supplied", () => {
    const view = toStatusEffectView(instance({ remainingMs: 2500 }));
    expect(view.durationMs).toBe(2500);
    expect(statusEffectRemainingFraction(view)).toBe(1);
  });

  test("omits magnitude when zero and derives a custom key", () => {
    const view = toStatusEffectView(instance({ status: "shield", magnitude: 0, source: "totem" }), {
      id: (i) => `${i.status}:${i.source}`,
    });
    expect(view.magnitude).toBeUndefined();
    expect(view.id).toBe("shield:totem");
  });

  test("remaining fraction is clamped to [0,1]", () => {
    expect(statusEffectRemainingFraction({ id: "p", kind: "p", remainingMs: 1500, durationMs: 3000, stacks: 1 })).toBe(0.5);
    expect(statusEffectRemainingFraction({ id: "p", kind: "p", remainingMs: 0, durationMs: 0, stacks: 1 })).toBe(0);
  });
});
