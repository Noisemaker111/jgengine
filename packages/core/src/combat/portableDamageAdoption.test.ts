import { describe, expect, test } from "bun:test";
import { createDamageClamp, resolveDamage } from "./damageInterceptors";
import { resolveDamageHit } from "./damageResolution";
import { createEffectSystem } from "./effects";
import { createStatPool, type StatPool, type StatPoolAccess } from "../stats/statPool";

describe("portable damage adoption", () => {
  test("pure hit, ordered interceptors, status provenance, and caller-owned pools compose deterministically", () => {
    let state: Record<string, Record<string, StatPool>> = {
      target: {
        shield: createStatPool({ current: 5, max: 5 }),
        vitality: createStatPool({ current: 20, max: 20 }),
      },
    };
    const access: StatPoolAccess = {
      get: (ownerId, statId) => state[ownerId]?.[statId] ?? null,
      set(ownerId, statId, next) {
        const owner = state[ownerId];
        if (owner === undefined) return false;
        state = { ...state, [ownerId]: { ...owner, [statId]: next } };
        return true;
      },
    };
    const effects = createEffectSystem({
      resolveReceive: () => ({ damage: { order: ["shield", "vitality"] } }),
      statPools: access,
      getStat: () => null,
      spatial: { inRadius: () => [], hasLineOfSight: () => true, positionOf: () => undefined },
    });

    const hit = resolveDamageHit({
      channel: "arc",
      impact: 30,
      target: "target",
      source: "attacker",
      status: { status: "charged", chance: 0.5, durationMs: 1_000, magnitude: 2 },
      rng: () => 0.25,
    });
    const intercepted = resolveDamage(
      [
        createDamageClamp({ id: "per-hit-cap", maxPerHit: 18 }),
        { id: "difficulty", intercept: (pending) => ({ kind: "transform", amount: pending.amount * 0.5 }) },
      ],
      { target: "target", source: "attacker", amount: hit.impact, tag: hit.channel },
      { nowMs: 4_000 },
    );
    const applied = intercepted.applications.flatMap((pending) =>
      effects.applyEffect({
        from: pending.source,
        to: pending.target,
        effect: "damage",
        via: { amount: pending.amount },
      }),
    );

    expect(intercepted.provenance.map((step) => [step.interceptor, step.before, step.after])).toEqual([
      ["per-hit-cap", 30, 18],
      ["difficulty", 18, 9],
    ]);
    expect(hit.status).toMatchObject({ kind: "applied", roll: 0.25, instance: { status: "charged" } });
    expect(applied[0]?.applied).toEqual([
      { statId: "shield", delta: -5 },
      { statId: "vitality", delta: -4 },
    ]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state.target?.vitality?.current).toBe(16);
  });
});
