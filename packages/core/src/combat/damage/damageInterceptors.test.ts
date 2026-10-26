import { describe, expect, test } from "bun:test";

import {
  type DamageInterceptor,
  type PendingDamage,
  createAntiOneShotPolicy,
  createDamageClamp,
  createDamagePipeline,
  createImmunityWindow,
  resolveDamage,
} from "./damageInterceptors";

function hit(over: Partial<PendingDamage> = {}): PendingDamage {
  return { target: "hero", source: "goblin", amount: 10, ...over };
}

describe("resolveDamage decisions", () => {
  test("pass leaves the application unchanged with a provenance row", () => {
    const passthru: DamageInterceptor = { id: "noop", intercept: () => ({ kind: "pass" }) };
    const res = resolveDamage([passthru], hit(), { nowMs: 0 });
    expect(res.applications).toEqual([hit()]);
    expect(res.deferred).toEqual([]);
    expect(res.provenance).toEqual([{ interceptor: "noop", kind: "pass", target: "hero", before: 10, after: 10 }]);
  });

  test("transform floors at zero and records before/after", () => {
    const half: DamageInterceptor = { id: "half", intercept: (p) => ({ kind: "transform", amount: p.amount / 2 }) };
    const neg: DamageInterceptor = { id: "neg", intercept: () => ({ kind: "transform", amount: -99 }) };
    expect(resolveDamage([half], hit({ amount: 40 }), { nowMs: 0 }).applications[0]?.amount).toBe(20);
    expect(resolveDamage([neg], hit(), { nowMs: 0 }).applications[0]?.amount).toBe(0);
  });

  test("clamp only lowers, never raises", () => {
    const clamp = createDamageClamp({ maxPerHit: 5 });
    expect(resolveDamage([clamp], hit({ amount: 12 }), { nowMs: 0 }).applications[0]?.amount).toBe(5);
    expect(resolveDamage([clamp], hit({ amount: 3 }), { nowMs: 0 }).applications[0]?.amount).toBe(3);
  });

  test("redirect changes the target while preserving amount", () => {
    const taunt: DamageInterceptor = { id: "taunt", intercept: () => ({ kind: "redirect", target: "tank" }) };
    const res = resolveDamage([taunt], hit({ amount: 15 }), { nowMs: 0 });
    expect(res.applications).toEqual([hit({ target: "tank", amount: 15 })]);
  });

  test("split fans out into multiple applications that skip the splitter", () => {
    const shard: DamageInterceptor = {
      id: "shard",
      intercept: (p) => ({
        kind: "split",
        parts: [
          { ...p, target: "a", amount: p.amount / 2 },
          { ...p, target: "b", amount: p.amount / 2 },
        ],
      }),
    };
    // A downstream clamp still runs on each split part.
    const clamp = createDamageClamp({ maxPerHit: 3 });
    const res = resolveDamage([shard, clamp], hit({ amount: 20 }), { nowMs: 0 });
    expect(res.applications.map((a) => [a.target, a.amount])).toEqual([
      ["a", 3],
      ["b", 3],
    ]);
  });

  test("defer holds the application without applying it", () => {
    const hold: DamageInterceptor = { id: "hold", intercept: () => ({ kind: "defer" }) };
    const res = resolveDamage([hold], hit(), { nowMs: 0 });
    expect(res.applications).toEqual([]);
    expect(res.deferred).toEqual([hit()]);
  });

  test("reject drops the application and records zero", () => {
    const shield: DamageInterceptor = { id: "shield", intercept: () => ({ kind: "reject" }) };
    const res = resolveDamage([shield], hit(), { nowMs: 0 });
    expect(res.applications).toEqual([]);
    expect(res.provenance[0]).toMatchObject({ interceptor: "shield", kind: "reject", after: 0 });
  });

  test("interceptors run in order and thread the transformed value", () => {
    const clampFirst = createDamageClamp({ id: "cap", maxPerHit: 8 });
    const doubler: DamageInterceptor = { id: "double", intercept: (p) => ({ kind: "transform", amount: p.amount * 2 }) };
    const res = resolveDamage([clampFirst, doubler], hit({ amount: 100 }), { nowMs: 0 });
    expect(res.applications[0]?.amount).toBe(16); // clamp 100→8, then double → 16
    expect(res.provenance.map((r) => r.interceptor)).toEqual(["cap", "double"]);
  });

  test("a malicious self-splitting interceptor is bounded, not infinite", () => {
    const forkBomb: DamageInterceptor = {
      id: "fork",
      // Re-splits into two parts; parts skip this interceptor so it cannot recurse.
      intercept: (p) => ({ kind: "split", parts: [{ ...p }, { ...p }] }),
    };
    const res = resolveDamage([forkBomb], hit(), { nowMs: 0 });
    // Two parts, each passes straight to application (no re-entry to the splitter).
    expect(res.applications).toHaveLength(2);
  });
});

describe("createDamagePipeline install/remove", () => {
  test("transitions install and remove interceptors, changing the outcome", () => {
    const pipeline = createDamagePipeline();
    const ctx = { nowMs: 0 };
    expect(pipeline.resolve(hit({ amount: 50 }), ctx).applications[0]?.amount).toBe(50);

    pipeline.install(createDamageClamp({ id: "phase-cap", maxPerHit: 10 }));
    expect(pipeline.has("phase-cap")).toBe(true);
    expect(pipeline.resolve(hit({ amount: 50 }), ctx).applications[0]?.amount).toBe(10);

    expect(pipeline.remove("phase-cap")).toBe(true);
    expect(pipeline.resolve(hit({ amount: 50 }), ctx).applications[0]?.amount).toBe(50);
    expect(pipeline.remove("phase-cap")).toBe(false);
  });

  test("installing the same id replaces in place and preserves order", () => {
    const pipeline = createDamagePipeline([
      createDamageClamp({ id: "a", maxPerHit: 100 }),
      createDamageClamp({ id: "b", maxPerHit: 100 }),
    ]);
    pipeline.install(createDamageClamp({ id: "a", maxPerHit: 5 }));
    expect(pipeline.interceptorIds()).toEqual(["a", "b"]);
    expect(pipeline.resolve(hit({ amount: 40 }), { nowMs: 0 }).applications[0]?.amount).toBe(5);
  });
});

describe("createImmunityWindow", () => {
  test("rejects damage while active, passes after expiry", () => {
    const immunity = createImmunityWindow();
    immunity.grantFor("hero", 1000, 500); // immune [1000, 1500)
    expect(resolveDamage([immunity.interceptor], hit(), { nowMs: 1200 }).applications).toEqual([]);
    expect(resolveDamage([immunity.interceptor], hit(), { nowMs: 1500 }).applications).toEqual([hit()]);
  });

  test("grant extends but never shortens", () => {
    const immunity = createImmunityWindow();
    immunity.grant("hero", 2000);
    immunity.grant("hero", 1000); // shorter — ignored
    expect(immunity.active("hero", 1500)).toBe(true);
  });

  test("clearExpired prunes only lapsed windows", () => {
    const immunity = createImmunityWindow();
    immunity.grant("a", 100);
    immunity.grant("b", 900);
    immunity.clearExpired(500);
    expect(immunity.snapshot()).toEqual({ b: 900 });
  });

  test("snapshot round-trips through restore", () => {
    const immunity = createImmunityWindow();
    immunity.grant("hero", 3000);
    const snap = JSON.parse(JSON.stringify(immunity.snapshot()));
    const restored = createImmunityWindow();
    restored.restore(snap);
    expect(restored.active("hero", 2000)).toBe(true);
    expect(restored.active("hero", 3000)).toBe(false);
  });
});

describe("createAntiOneShotPolicy", () => {
  const config = { guardAboveFraction: 0.3, leaveFraction: 0.1, recoverMs: 500 };
  const health = (current: number) => ({ nowMs: 0, healthOf: () => ({ current, max: 100 }) });

  test("clamps a near-lethal hit to leave the health floor", () => {
    const policy = createAntiOneShotPolicy(config);
    const res = resolveDamage([policy.interceptor], hit({ amount: 999 }), health(100));
    // Leave 10 (0.1 * 100), so at most 90 damage applies.
    expect(res.applications[0]?.amount).toBe(90);
  });

  test("passes when the target is at or below the guard fraction (can die)", () => {
    const policy = createAntiOneShotPolicy(config);
    const res = resolveDamage([policy.interceptor], hit({ amount: 999 }), health(25)); // 25% <= 30%
    expect(res.applications[0]?.amount).toBe(999);
  });

  test("passes a survivable hit unchanged", () => {
    const policy = createAntiOneShotPolicy(config);
    const res = resolveDamage([policy.interceptor], hit({ amount: 20 }), health(100));
    expect(res.applications[0]?.amount).toBe(20);
  });

  test("arms recovery immunity after a save, then lets the next hit through", () => {
    const policy = createAntiOneShotPolicy(config);
    resolveDamage([policy.interceptor], hit({ amount: 999 }), { nowMs: 0, healthOf: () => ({ current: 100, max: 100 }) });
    expect(policy.immune("hero", 200)).toBe(true);
    // During recovery, even a fresh big hit is rejected.
    const during = resolveDamage([policy.interceptor], hit({ amount: 999 }), {
      nowMs: 200,
      healthOf: () => ({ current: 10, max: 100 }),
    });
    expect(during.applications).toEqual([]);
    expect(policy.immune("hero", 600)).toBe(false);
  });

  test("recovery state round-trips through snapshot/restore", () => {
    const policy = createAntiOneShotPolicy(config);
    resolveDamage([policy.interceptor], hit({ amount: 999 }), { nowMs: 0, healthOf: () => ({ current: 100, max: 100 }) });
    const snap = JSON.parse(JSON.stringify(policy.snapshot()));
    const restored = createAntiOneShotPolicy(config);
    restored.restore(snap);
    expect(restored.immune("hero", 200)).toBe(true);
  });
});
