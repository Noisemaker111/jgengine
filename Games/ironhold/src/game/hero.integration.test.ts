import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGameDefinition";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { content } from "./content";
import { resetSession, session } from "./session";
import {
  castThunderClap,
  grantHeroXp,
  heroAttackBonus,
  heroLevel,
  heroTrack,
  heroXpFor,
  HERO_ID,
  HERO_MAX_LEVEL,
  THUNDERCLAP_COST,
  tickHero,
  thunderClapReady,
} from "./hero";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "IronholdHeroTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

function spawnHero(ctx: GameContext, pos: EntityPosition = [0, 0, 0]): void {
  ctx.scene.entity.spawn("hero", { id: HERO_ID, position: pos, role: "npc" });
  session.units.set(HERO_ID, { id: HERO_ID, catalogId: "hero", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}

function spawnGrunt(ctx: GameContext, id: string, pos: EntityPosition): void {
  ctx.scene.entity.spawn("grunt", { id, position: pos, role: "npc" });
  session.units.set(id, { id, catalogId: "grunt", faction: "enemy", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}

function statVal(ctx: GameContext, id: string, key: string): { current: number; max: number } | null {
  const s = ctx.scene.entity.stats.get(id, key);
  return s === null ? null : { current: s.current, max: s.max };
}

describe("hero mana + Thunder Clap", () => {
  beforeEach(() => resetSession());

  test("the hero seeds a full mana pool at level 1", () => {
    const ctx = boot();
    spawnHero(ctx);
    expect(statVal(ctx, HERO_ID, "mana")?.current).toBe(100);
    expect(heroLevel(ctx)).toBe(1);
    expect(statVal(ctx, HERO_ID, "xp")?.current).toBe(0);
  });

  test("Thunder Clap bursts enemies in radius, spends mana, and goes on cooldown", () => {
    const ctx = boot();
    spawnHero(ctx);
    spawnGrunt(ctx, "near", [3, 0, 0]); // inside the 7-radius
    spawnGrunt(ctx, "far", [30, 0, 0]); // outside
    const nearBefore = statVal(ctx, "near", "health")!.current;
    const farBefore = statVal(ctx, "far", "health")!.current;

    expect(thunderClapReady(ctx)).toBe(true);
    castThunderClap(ctx);

    expect(statVal(ctx, "near", "health")!.current).toBeLessThan(nearBefore); // hit
    expect(statVal(ctx, "far", "health")!.current).toBe(farBefore); // spared
    expect(statVal(ctx, HERO_ID, "mana")!.current).toBe(100 - THUNDERCLAP_COST);
    expect(thunderClapReady(ctx)).toBe(false); // on cooldown

    // A second cast while on cooldown is a no-op.
    const nearMid = statVal(ctx, "near", "health")!.current;
    castThunderClap(ctx);
    expect(statVal(ctx, "near", "health")!.current).toBe(nearMid);
  });

  test("mana regenerates and the cooldown ticks back to ready", () => {
    const ctx = boot();
    spawnHero(ctx);
    castThunderClap(ctx);
    const spent = statVal(ctx, HERO_ID, "mana")!.current;
    for (let i = 0; i < 200; i += 1) tickHero(ctx, 0.1); // 20s
    expect(statVal(ctx, HERO_ID, "mana")!.current).toBeGreaterThan(spent);
    expect(session.heroState.abilityCooldown).toBe(0);
    expect(thunderClapReady(ctx)).toBe(true);
  });
});

describe("hero XP + leveling", () => {
  beforeEach(() => resetSession());

  test("XP is awarded for enemy units only, scaling with toughness", () => {
    expect(heroXpFor("grunt")).toBeGreaterThan(0);
    expect(heroXpFor("reaver")).toBeGreaterThan(heroXpFor("grunt"));
    expect(heroXpFor("footman")).toBe(0); // own unit
    expect(heroXpFor("keep_enemy")).toBe(0); // structure
  });

  test("leveling raises health, mana, and the hero's damage bonus", () => {
    const ctx = boot();
    spawnHero(ctx);
    const hpBefore = statVal(ctx, HERO_ID, "health")!.max;
    const manaBefore = statVal(ctx, HERO_ID, "mana")!.max;
    expect(heroAttackBonus(ctx, "hero")).toBe(0);

    grantHeroXp(ctx, heroTrack.xpForLevel(1) + 5); // enough for level 2
    expect(heroLevel(ctx)).toBeGreaterThanOrEqual(2);
    expect(statVal(ctx, HERO_ID, "health")!.max).toBeGreaterThan(hpBefore);
    expect(statVal(ctx, HERO_ID, "mana")!.max).toBeGreaterThan(manaBefore);
    expect(heroAttackBonus(ctx, "hero")).toBeGreaterThan(0);
    expect(heroAttackBonus(ctx, "footman")).toBe(0); // bonus is the hero's alone
  });

  test("XP tops out at the max level", () => {
    const ctx = boot();
    spawnHero(ctx);
    grantHeroXp(ctx, 100000);
    expect(heroLevel(ctx)).toBe(HERO_MAX_LEVEL);
  });

  test("with no hero on the field, XP and the ability are inert", () => {
    const ctx = boot();
    expect(grantHeroXp(ctx, 500)).toBe(0);
    expect(thunderClapReady(ctx)).toBe(false);
    expect(() => castThunderClap(ctx)).not.toThrow();
  });
});
