import { afterEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { resetCharacterState } from "./characters";
import { SHIELD_REGEN_DELAY_MS, playerLastHurtAtMs, tickShields } from "./handroll";

/**
 * Minimal entity-stats-backed context: `tickShields` only reads `player.userId`,
 * `scene.entity.list()` and `scene.entity.stats`.
 */
function makeCtx(entities: Record<string, { shield: number; shieldMax: number; health?: number }>): {
  ctx: GameContext;
  shieldOf: (id: string) => number;
  damage: (id: string, stat: "shield" | "health", amount: number) => void;
} {
  const stats = new Map<string, Map<string, { current: number; max: number }>>();
  for (const [id, spec] of Object.entries(entities)) {
    stats.set(
      id,
      new Map([
        ["shield", { current: spec.shield, max: spec.shieldMax }],
        ["health", { current: spec.health ?? 100, max: 100 }],
      ]),
    );
  }
  const ctx = {
    player: { userId: "p1" },
    scene: {
      entity: {
        list: () => [...stats.keys()].map((id) => ({ id })),
        stats: {
          get: (id: string, statId: string) => stats.get(id)?.get(statId) ?? null,
          delta: (id: string, statId: string, amount: number) => {
            const stat = stats.get(id)?.get(statId);
            if (stat === undefined) return;
            stat.current = Math.max(0, Math.min(stat.max, stat.current + amount));
          },
        },
      },
    },
  } as unknown as GameContext;
  return {
    ctx,
    shieldOf: (id) => stats.get(id)?.get("shield")?.current ?? 0,
    damage: (id, stat, amount) => {
      const entry = stats.get(id)?.get(stat);
      if (entry !== undefined) entry.current = Math.max(0, entry.current - amount);
    },
  };
}

afterEach(() => {
  resetCharacterState();
});

const DT = 1 / 60;
/** Advance wall-clock and simulated time together — the game ticks them from one source. */
const STEP_MS = DT * 1000;

describe("tickShields", () => {
  test("holds regen for the delay after a hit, then refills", () => {
    const { ctx, shieldOf, damage } = makeCtx({ p1: { shield: 100, shieldMax: 100 } });
    let now = 0;
    // Settle, then take a hit through the game's own damage path (not through the shield object).
    tickShields(ctx, now, DT);
    damage("p1", "shield", 60);
    now += STEP_MS;
    tickShields(ctx, now, DT);
    expect(shieldOf("p1")).toBe(40);

    // Still inside the grace period — no regen.
    for (let i = 0; i < 100; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    expect(shieldOf("p1")).toBe(40);

    // Past the grace period the shield refills.
    for (let i = 0; i < Math.ceil(SHIELD_REGEN_DELAY_MS / STEP_MS) + 60; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    expect(shieldOf("p1")).toBeGreaterThan(40);
  });

  test("refills all the way to max and stops there", () => {
    const { ctx, shieldOf } = makeCtx({ p1: { shield: 10, shieldMax: 100 } });
    let now = 0;
    for (let i = 0; i < 2000; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    expect(shieldOf("p1")).toBe(100);
  });

  test("a hit that lands on health also stalls shield regen", () => {
    const { ctx, shieldOf, damage } = makeCtx({ p1: { shield: 50, shieldMax: 100 } });
    let now = 0;
    // Get past the grace period so regen is live.
    for (let i = 0; i < 400; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    const before = shieldOf("p1");
    expect(before).toBeGreaterThan(50);

    damage("p1", "health", 25);
    now += STEP_MS;
    tickShields(ctx, now, DT);
    const afterHit = shieldOf("p1");
    for (let i = 0; i < 100; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    expect(shieldOf("p1")).toBe(afterHit);
  });

  test("records when the player was last hurt, for the damage vignette", () => {
    const { ctx, damage } = makeCtx({ p1: { shield: 100, shieldMax: 100 } });
    let now = 0;
    for (let i = 0; i < 400; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    expect(playerLastHurtAtMs(ctx)).toBe(0);
    damage("p1", "shield", 30);
    now += STEP_MS;
    tickShields(ctx, now, DT);
    expect(playerLastHurtAtMs(ctx)).toBe(now);
  });

  test("regenerates non-player entities independently of the player", () => {
    const { ctx, shieldOf, damage } = makeCtx({
      p1: { shield: 100, shieldMax: 100 },
      bot: { shield: 100, shieldMax: 100 },
    });
    let now = 0;
    tickShields(ctx, now, DT);
    damage("bot", "shield", 50);
    now += STEP_MS;
    tickShields(ctx, now, DT);
    expect(shieldOf("bot")).toBe(50);
    expect(shieldOf("p1")).toBe(100);

    for (let i = 0; i < 1200; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    expect(shieldOf("bot")).toBe(100);
  });

  test("entities with no shield pool are skipped", () => {
    const { ctx, shieldOf } = makeCtx({ p1: { shield: 0, shieldMax: 0 } });
    let now = 0;
    for (let i = 0; i < 600; i += 1) {
      now += STEP_MS;
      tickShields(ctx, now, DT);
    }
    expect(shieldOf("p1")).toBe(0);
  });
});

/**
 * Parity oracle: the hand-rolled snapshot-comparing regen this module replaced, verbatim, so the
 * migration onto `createRegenShield`'s pool port is held to the behavior that shipped rather than
 * to tests written against the new code.
 */
function legacyTickShields(): (ctx: GameContext, nowMs: number, dt: number, regenBonus?: number) => void {
  interface ShieldWatch {
    lastHitAtMs: number;
    lastShield: number;
    lastHealth: number;
  }
  const shieldWatch = new Map<string, ShieldWatch>();
  return (ctx, nowMs, dt, regenBonus = 1) => {
    for (const entity of ctx.scene.entity.list()) {
      const shield = ctx.scene.entity.stats.get(entity.id, "shield");
      if (shield === null || shield.max <= 0) continue;
      const health = ctx.scene.entity.stats.get(entity.id, "health");
      let watch = shieldWatch.get(entity.id);
      if (watch === undefined) {
        watch = { lastHitAtMs: 0, lastShield: shield.current, lastHealth: health?.current ?? 0 };
        shieldWatch.set(entity.id, watch);
      }
      const currentHealth = health?.current ?? 0;
      if (shield.current < watch.lastShield || currentHealth < watch.lastHealth) watch.lastHitAtMs = nowMs;
      watch.lastShield = shield.current;
      watch.lastHealth = currentHealth;
      if (shield.current >= shield.max) continue;
      const delay = SHIELD_REGEN_DELAY_MS;
      if (nowMs - watch.lastHitAtMs < delay) continue;
      const rate = Math.max(6, shield.max * 0.12) * regenBonus;
      ctx.scene.entity.stats.delta(entity.id, "shield", rate * dt);
      watch.lastShield = ctx.scene.entity.stats.get(entity.id, "shield")?.current ?? shield.current;
    }
  };
}

describe("tickShields — parity with the hand-rolled snapshot regen", () => {
  test("tracks the legacy implementation across hits, grace periods and full refills", () => {
    // A non-player entity: the legacy path applied no talent bonuses to those, so the comparison is
    // apples to apples without reaching into character state.
    const next = makeCtx({ bot: { shield: 100, shieldMax: 100 } });
    const old = makeCtx({ bot: { shield: 100, shieldMax: 100 } });
    const legacy = legacyTickShields();

    // Start past the legacy implementation's cold-start window so both agree on the initial state.
    let now = SHIELD_REGEN_DELAY_MS * 2;
    const hits = new Set([120, 400, 405, 900]);
    for (let i = 0; i < 2400; i += 1) {
      now += STEP_MS;
      if (hits.has(i)) {
        next.damage("bot", "shield", 25);
        old.damage("bot", "shield", 25);
      }
      if (i === 700) {
        next.damage("bot", "health", 15);
        old.damage("bot", "health", 15);
      }
      tickShields(next.ctx, now, DT);
      legacy(old.ctx, now, DT);
      expect(next.shieldOf("bot")).toBeCloseTo(old.shieldOf("bot"), 6);
    }
    // The timeline actually exercised regen back to full, not just a flat line.
    expect(next.shieldOf("bot")).toBe(100);
  });
});
