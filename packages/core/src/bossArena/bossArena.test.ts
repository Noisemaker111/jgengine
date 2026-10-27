import { describe, expect, test } from "bun:test";

import { arenaWall, createBossArena, type ArenaCandidate, type BossArenaOptions } from "./bossArena";

const OPTIONS: BossArenaOptions = {
  tiers: [
    { id: "gamma", minLevel: 30, tribute: { clever: 1, hunter: 1 } },
    { id: "beta", minLevel: 50, tribute: { clever: 1, hunter: 1, talon: 5 } },
  ],
  maxSurvivors: 2,
  maxCompanions: 2,
  maxCompanionWeight: 560,
};

function bag(items: Record<string, number>) {
  const held = { ...items };
  return { held, count: (item: string) => held[item] ?? 0, take: (item: string, count: number) => void (held[item] = (held[item] ?? 0) - count) };
}

const AT = [10, 2, 20] as const;
const me: ArenaCandidate = { id: "me", kind: "survivor", at: AT };

describe("boss arena", () => {
  test("a short tribute or level summons nothing and takes nothing", () => {
    const arena = createBossArena(OPTIONS);
    const items = bag({ clever: 1 });
    const result = arena.summon("gamma", items, 40, 0);
    expect(result).toEqual({ ok: false, reason: "tribute", check: { ok: false, missing: [{ item: "hunter", need: 1, have: 0 }], levelShort: 0 } });
    expect(items.held).toEqual({ clever: 1 });
    expect(arena.check("gamma", bag({ clever: 1, hunter: 1 }).count, 25)).toEqual({ ok: false, missing: [], levelShort: 5 });
    expect(arena.state().phase).toBe("idle");
  });

  test("the portal takes the tribute, counts down, then takes everyone in range up to the caps", () => {
    const arena = createBossArena(OPTIONS);
    const items = bag({ clever: 2, hunter: 1 });
    expect(arena.summon("gamma", items, 30, 100)).toEqual({ ok: true });
    expect(items.held).toEqual({ clever: 1, hunter: 0 });
    expect(arena.summon("gamma", bag({ clever: 1, hunter: 1 }), 30, 101).ok).toBe(false);
    const hooks = {
      bossAlive: () => true,
      gather: () => [
        me,
        { id: "friend", kind: "survivor", at: AT },
        { id: "third", kind: "survivor", at: AT },
        { id: "rex", kind: "companion", at: AT, weight: 500 },
        { id: "bronto", kind: "companion", at: AT, weight: 2000 },
        { id: "raptor", kind: "companion", at: AT, weight: 100 },
        { id: "wolf", kind: "companion", at: AT, weight: 100 },
      ] satisfies ArenaCandidate[],
    };
    expect(arena.tick(124, hooks)).toEqual([]);
    expect(arena.secondsLeft(124)).toBe(1);
    const [entered] = arena.tick(125, hooks);
    expect(entered).toMatchObject({ type: "entered", tier: "gamma", refused: [{ id: "third", reason: "full" }, { id: "bronto", reason: "heavy" }, { id: "wolf", reason: "full" }] });
    expect(arena.state()).toMatchObject({ phase: "fight", survivors: ["me", "friend"], companions: ["rex", "raptor"] });
    expect(arena.inside("rex")).toBe(true);
    expect(arena.inside("bronto")).toBe(false);
  });

  test("a portal with no survivor in range closes and the tribute is spent", () => {
    const arena = createBossArena(OPTIONS);
    arena.summon("gamma", bag({ clever: 1, hunter: 1 }), 30, 0);
    expect(arena.tick(25, { bossAlive: () => true, gather: () => [{ id: "rex", kind: "companion", at: AT }] })).toEqual([{ type: "closed", tier: "gamma" }]);
    expect(arena.state().phase).toBe("idle");
  });

  test("a win holds the winners a minute, then sends each back where they stood", () => {
    const arena = createBossArena(OPTIONS);
    arena.summon("gamma", bag({ clever: 1, hunter: 1 }), 30, 0);
    let alive = true;
    const hooks = { bossAlive: () => alive, gather: () => [me, { id: "rex", kind: "companion" as const, at: [1, 1, 1] as const }] };
    arena.tick(25, hooks);
    expect(arena.tick(40, hooks)).toEqual([]);
    alive = false;
    expect(arena.tick(41, hooks)).toEqual([{ type: "won", tier: "gamma", survivors: ["me"], companions: ["rex"] }]);
    expect(arena.secondsLeft(41)).toBe(60);
    expect(arena.tick(100, hooks)).toEqual([]);
    expect(arena.tick(101, hooks)).toEqual([{ type: "returned", tier: "gamma", returns: [{ id: "me", kind: "survivor", to: AT }, { id: "rex", kind: "companion", to: [1, 1, 1] }] }]);
    expect(arena.state().phase).toBe("idle");
  });

  test("when the last survivor falls the fight is lost with the companions inside", () => {
    const arena = createBossArena(OPTIONS);
    arena.summon("gamma", bag({ clever: 1, hunter: 1 }), 30, 0);
    const hooks = { bossAlive: () => true, gather: () => [me, { id: "rex", kind: "companion" as const, at: AT }] };
    arena.tick(25, hooks);
    arena.leave("me");
    expect(arena.tick(26, hooks)).toEqual([{ type: "lost", tier: "gamma", reason: "wiped", companions: ["rex"] }]);
  });

  test("a time limit loses an unfinished fight", () => {
    const arena = createBossArena({ ...OPTIONS, timeLimitSeconds: 600 });
    arena.summon("gamma", bag({ clever: 1, hunter: 1 }), 30, 0);
    const hooks = { bossAlive: () => true, gather: () => [me] };
    arena.tick(25, hooks);
    expect(arena.secondsLeft(325)).toBe(300);
    expect(arena.tick(625, hooks)).toEqual([{ type: "lost", tier: "gamma", reason: "time", companions: [] }]);
  });

  test("a saved fight resumes where it stood", () => {
    const arena = createBossArena(OPTIONS);
    arena.summon("gamma", bag({ clever: 1, hunter: 1 }), 30, 0);
    arena.tick(25, { bossAlive: () => true, gather: () => [me] });
    const saved = arena.snapshot();
    const again = createBossArena(OPTIONS);
    again.restore(saved);
    expect(again.inside("me")).toBe(true);
    expect(again.tick(30, { bossAlive: () => false, gather: () => [] })[0]?.type).toBe("won");
  });
});

describe("arena wall", () => {
  test("a closed ring of slabs just outside the floor, each standing on the lowest ground under it", () => {
    const solids = arenaWall({ center: [100, -50], radius: 40, height: 20, thickness: 4, sides: 16, ground: (x) => (x > 100 ? 5 : 0) });
    expect(solids).toHaveLength(16);
    for (const solid of solids) {
      const distance = Math.hypot(solid.center[0] - 100, solid.center[2] + 50);
      expect(distance).toBeCloseTo(42, 5);
      // The slab runs along the ring: local +x (cos, -sin of rotationY) is perpendicular to the radius.
      const yaw = solid.rotationY ?? 0;
      const radial = [(solid.center[0] - 100) / distance, (solid.center[2] + 50) / distance];
      expect(Math.abs(Math.cos(yaw) * radial[0]! - Math.sin(yaw) * radial[1]!)).toBeLessThan(1e-9);
      // Neighbouring slabs overlap, so nothing slips between them.
      expect(solid.halfExtents[0] * 2).toBeGreaterThan(2 * 42 * Math.tan(Math.PI / 16));
    }
    const east = solids.find((solid) => solid.center[0] > 140)!;
    // Sunk two metres into the ground it stands on, so no gap shows under it.
    expect(east.center[1] - east.halfExtents[1]).toBe(3);
    const west = solids.find((solid) => solid.center[0] < 60)!;
    expect(west.center[1] - west.halfExtents[1]).toBe(-2);
  });
});
