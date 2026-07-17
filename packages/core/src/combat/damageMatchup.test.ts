import { describe, expect, it } from "bun:test";
import { resolveMatchup, type DamageMatchup } from "./damageMatchup";

const matchup: DamageMatchup = {
  entries: {
    fire: {
      fleshy: { impact: 1.5, applyChance: 2, magnitude: 1.25 },
      armored: { impact: 0.75 },
      wet: { impact: 0.5, applyChance: 0 },
    },
    ice: {
      wet: { impact: 1.5, duration: 2 },
      armored: { impact: 1.1 },
    },
  },
  default: { impact: 1 },
};

describe("resolveMatchup", () => {
  it("scales independent output axes and defaults absent axes to 1", () => {
    const r = resolveMatchup(matchup, "fire", ["fleshy"]);
    expect(r.impact).toBe(1.5);
    expect(r.applyChance).toBe(2);
    expect(r.magnitude).toBe(1.25);
    expect(r.duration).toBe(1);
    expect(r.matched).toBe(true);
  });

  it("multiplies outputs across every matching trait, order-independent", () => {
    const forward = resolveMatchup(matchup, "fire", ["fleshy", "wet"]);
    const reverse = resolveMatchup(matchup, "fire", ["wet", "fleshy"]);
    // impact: 1.5 * 0.5, applyChance: 2 * 0
    expect(forward.impact).toBeCloseTo(0.75);
    expect(forward.applyChance).toBe(0);
    expect(reverse.impact).toBeCloseTo(0.75);
    expect(reverse.applyChance).toBe(0);
    expect(forward.contributions).toHaveLength(2);
  });

  it("uses default outputs when no trait matches and reports matched=false", () => {
    const r = resolveMatchup(matchup, "fire", ["ethereal"]);
    expect(r.impact).toBe(1);
    expect(r.matched).toBe(false);
    expect(r.contributions).toHaveLength(0);
  });

  it("uses default for an unknown channel", () => {
    const r = resolveMatchup(matchup, "corrosive", ["armored"]);
    expect(r.impact).toBe(1);
    expect(r.matched).toBe(false);
  });

  it("carries caller-defined extra scalar outputs", () => {
    const withExtra: DamageMatchup = {
      entries: { shock: { drone: { extra: { stagger: 3 } } } },
    };
    const r = resolveMatchup(withExtra, "shock", ["drone"]);
    expect(r.extra.stagger).toBe(3);
  });

  it("survives a JSON serialize round-trip", () => {
    const clone: DamageMatchup = JSON.parse(JSON.stringify(matchup));
    const a = resolveMatchup(matchup, "ice", ["wet", "armored"]);
    const b = resolveMatchup(clone, "ice", ["wet", "armored"]);
    expect(b).toEqual(a);
    expect(b.impact).toBeCloseTo(1.5 * 1.1);
    expect(b.duration).toBe(2);
  });
});
