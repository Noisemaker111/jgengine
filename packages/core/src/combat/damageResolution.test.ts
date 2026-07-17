import { describe, expect, it } from "bun:test";
import { seededRng } from "../random/rng";
import { resolveDamageHit, type DamageHitInput } from "./damageResolution";
import type { DamageMatchup } from "./damageMatchup";
import type { ReceivedModifier } from "./receivedDamage";

const matchup: DamageMatchup = {
  entries: {
    fire: {
      fleshy: { impact: 1.5, applyChance: 2 },
      armored: { impact: 0.5 },
    },
  },
};

const amplifyWhileBurning: ReceivedModifier[] = [
  { id: "burn-amp", when: { whileStatus: ["burn"] }, policy: { kind: "scale", factor: 2 } },
];

const baseHit: DamageHitInput = {
  channel: "fire",
  impact: 100,
  target: "grunt",
  source: "player",
  targetTraits: ["fleshy"],
  matchup,
};

describe("resolveDamageHit", () => {
  it("scales impact by the matchup impact axis", () => {
    const r = resolveDamageHit(baseHit);
    expect(r.impact).toBe(150); // 100 * 1.5
    expect(r.matchup.matched).toBe(true);
  });

  it("applies receiver-side amplification after the matchup", () => {
    const r = resolveDamageHit({
      ...baseHit,
      targetStatuses: ["burn"],
      received: amplifyWhileBurning,
    });
    expect(r.impact).toBe(300); // 100 * 1.5 * 2
    expect(r.received.steps[0]?.modifierId).toBe("burn-amp");
  });

  it("rolls status application scaled by the matchup applyChance axis", () => {
    const r = resolveDamageHit({
      ...baseHit,
      status: { status: "burn", chance: 0.5, durationMs: 4000, magnitude: 10 },
      rng: () => 0.9, // 0.5 * 2 (fleshy) = 1.0 -> lands
    });
    expect(r.status?.kind).toBe("applied");
    expect(r.status?.instance?.status).toBe("burn");
  });

  it("keeps full provenance across matchup, received, and status", () => {
    const r = resolveDamageHit({
      ...baseHit,
      targetTraits: ["armored"],
      status: { status: "burn", chance: 1, magnitude: 5 },
      rng: () => 0,
    });
    expect(r.impact).toBe(50); // 100 * 0.5
    expect(r.matchup.contributions[0]?.trait).toBe("armored");
    expect(r.received.steps).toHaveLength(0);
    expect(r.status?.kind).toBe("applied");
  });

  it("is deterministic under a seeded RNG", () => {
    const runs = () => {
      const rng = seededRng("hit-929");
      return Array.from({ length: 6 }, () =>
        resolveDamageHit({ ...baseHit, status: { status: "burn", chance: 0.4 }, rng }).status?.kind,
      );
    };
    expect(runs()).toEqual(runs());
  });
});
