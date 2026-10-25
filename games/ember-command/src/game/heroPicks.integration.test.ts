import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { tickUnits } from "./ai/units";
import { content } from "./content";
import {
  carriedHeroPicks,
  castHeroAct,
  chooseHeroPick,
  heroActViews,
  heroRuntime,
  lineMultiplier,
  loadHeroPicks,
  pendingHeroOffer,
  restoreHeroPicks,
  tickHero,
} from "./heroActs";
import { grantHeroXp, HERO_ID, heroTrack } from "./hero";
import { HERO_PICKS, heroPickStore, LEVEL_OFFERS } from "./heroPicks";
import { resetSession, session } from "./session";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "EmberCommandPicksTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

function spawnHero(ctx: GameContext, pos: EntityPosition = [0, 0, 0]): void {
  ctx.scene.entity.spawn("hero", { id: HERO_ID, position: pos, role: "npc" });
  session.units.set(HERO_ID, { id: HERO_ID, catalogId: "hero", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}

function spawnUnit(ctx: GameContext, id: string, catalogId: "footman" | "grunt", pos: EntityPosition): void {
  ctx.scene.entity.spawn(catalogId, { id, position: pos, role: "npc" });
  const faction = catalogId === "footman" ? "player" : "enemy";
  session.units.set(id, { id, catalogId, faction, kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}

function health(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "health")!.current;
}

function mana(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(HERO_ID, "mana")!.current;
}

/** Raise the hero to `level` and flush the pick point each level earns. */
function levelTo(ctx: GameContext, level: number): void {
  let xp = 0;
  for (let at = 1; at < level; at += 1) xp += heroTrack.xpForLevel(at);
  grantHeroXp(ctx, xp);
  tickHero(ctx, 0);
}

/** Answer the live offer with `id`. The model enforces offer order, so a test picks in order too. */
function pick(ctx: GameContext, id: string): void {
  expect(chooseHeroPick(ctx, id)).toBe(true);
}

describe("level-ups offer a choice", () => {
  beforeEach(() => resetSession());

  test("levels 2 to 4 each offer one act against one item; level 5 is the capstone item choice", () => {
    for (const [level, pair] of Object.entries(LEVEL_OFFERS)) {
      expect(pair).toHaveLength(2);
      const kinds = pair.map((id) => HERO_PICKS.find((node) => node.id === id)!.kind).sort();
      expect(kinds).toEqual(Number(level) <= 4 ? ["active", "passive"] : ["passive", "passive"]);
    }
    expect(Object.keys(LEVEL_OFFERS).map(Number)).toEqual([2, 3, 4, 5]);
  });

  test("a level-up opens the offer for that level and grants one point", () => {
    const ctx = boot();
    spawnHero(ctx);
    expect(pendingHeroOffer(ctx)).toBeNull();
    levelTo(ctx, 2);
    const offer = pendingHeroOffer(ctx);
    expect(offer?.level).toBe(2);
    expect(offer?.options.map((option) => option.id)).toEqual([...LEVEL_OFFERS[2]!]);
    expect(offer?.options.every((option) => option.allocatable)).toBe(true);
  });

  test("a pick outside the live offer is refused, not force-spent", () => {
    const ctx = boot();
    spawnHero(ctx);
    levelTo(ctx, 2);
    expect(chooseHeroPick(ctx, "ward")).toBe(false); // level 4's act, not on this card
    expect(pendingHeroOffer(ctx)?.level).toBe(2);
  });

  test("an act pick adds the act to the command card; an item pick adds to the kit", () => {
    const ctx = boot();
    spawnHero(ctx);
    levelTo(ctx, 2);
    pick(ctx, "muster");
    expect(carriedHeroPicks().map((node) => node.id)).toEqual(["muster"]);
    expect(heroActViews(ctx).find((act) => act.id === "banner")?.owned).toBe(true);

    levelTo(ctx, 3);
    pick(ctx, "draught");
    expect(heroActViews(ctx).find((act) => act.id === "volley")?.owned).toBe(false);
    expect(carriedHeroPicks().map((node) => node.id)).toEqual(["muster", "draught"]);
  });

  test("two level-5 heroes who picked differently fight differently", () => {
    const acts = boot();
    spawnHero(acts);
    levelTo(acts, 5);
    pick(acts, "muster");
    pick(acts, "volley");
    pick(acts, "ward");
    pick(acts, "tempo");
    const ownedByActs = heroActViews(acts).filter((act) => act.owned).map((act) => act.id);
    const cooldownWithTempo = heroRuntime().kit.config("banner")!.cooldownMs;

    resetSession();
    const items = boot();
    spawnHero(items);
    levelTo(items, 5);
    pick(items, "signet");
    pick(items, "draught");
    pick(items, "standard");
    pick(items, "zeal");
    const ownedByItems = heroActViews(items).filter((act) => act.owned).map((act) => act.id);

    expect(ownedByActs).toEqual(["thunderclap", "banner", "volley", "ward"]);
    expect(ownedByItems).toEqual(["thunderclap"]);
    // The item route pays in the line's numbers instead of in acts: hits 15% harder, takes 12% less.
    expect(lineMultiplier("player", "enemy")).toBeCloseTo(1.15, 5);
    expect(lineMultiplier("enemy", "player")).toBeCloseTo(0.88, 5);
    // ...and the act route pays in tempo.
    expect(cooldownWithTempo).toBeLessThan(24_000);
  });
});

describe("the pick is campaign save data", () => {
  beforeEach(() => resetSession());

  test("a pick survives a save and load into the next battle", () => {
    const first = boot();
    spawnHero(first);
    levelTo(first, 3);
    pick(first, "muster");
    pick(first, "volley");
    const saved = first.state();

    resetSession(); // the next battle starts with a fresh world, level 1 and cold cooldowns
    const next = boot();
    spawnHero(next);
    next.hydrate(saved);
    loadHeroPicks(next);

    expect(carriedHeroPicks().map((node) => node.id).sort()).toEqual(["muster", "volley"]);
    expect(heroActViews(next).find((act) => act.id === "volley")?.owned).toBe(true);
    // The carried kit is the kit, not the points an earlier battle left unspent.
    expect(pendingHeroOffer(next)).toBeNull();
  });

  test("a saved pick this build does not author fails at load", () => {
    const ctx = boot();
    spawnHero(ctx);
    heroPickStore.write(ctx, { muster: 1, ghost_volley: 1 });
    expect(() => restoreHeroPicks(ctx)).toThrow(/ghost_volley/);
  });

  test("a saved rank outside the pick's cap also fails at load", () => {
    const ctx = boot();
    spawnHero(ctx);
    heroPickStore.write(ctx, { muster: 3 });
    expect(() => restoreHeroPicks(ctx)).toThrow(/outside 1\.\.1/);
  });

  test("the boot guard reports a stale kit and keeps the battle playable", () => {
    const ctx = boot();
    spawnHero(ctx);
    heroPickStore.write(ctx, { ghost_volley: 1 });
    expect(() => loadHeroPicks(ctx)).not.toThrow();
    expect(carriedHeroPicks()).toEqual([]);
    expect(heroPickStore.peek(ctx)).toBeUndefined();
  });
});

describe("acts do something and their cooldown gates them", () => {
  beforeEach(() => resetSession());

  test("Ember Volley damages nearby Marauders, spends mana once, and refuses a second cast on cooldown", () => {
    const ctx = boot();
    spawnHero(ctx);
    spawnUnit(ctx, "near", "grunt", [3, 0, 0]);
    spawnUnit(ctx, "far", "grunt", [30, 0, 0]);
    levelTo(ctx, 3);
    pick(ctx, "muster");
    pick(ctx, "volley");

    const nearBefore = health(ctx, "near");
    const farBefore = health(ctx, "far");
    const manaBefore = mana(ctx);

    expect(castHeroAct(ctx, "volley").ok).toBe(true);
    expect(health(ctx, "near")).toBeLessThan(nearBefore);
    expect(health(ctx, "far")).toBe(farBefore);
    const spent = manaBefore - mana(ctx);
    expect(spent).toBeGreaterThan(0);

    const struckOnce = health(ctx, "near");
    expect(castHeroAct(ctx, "volley")).toEqual({ ok: false, reason: "cooldown" });
    expect(health(ctx, "near")).toBe(struckOnce); // the refused cast dealt nothing
    expect(manaBefore - mana(ctx)).toBe(spent); // and spent nothing

    // The command card reads the same gate the cast path does.
    const card = heroActViews(ctx).find((act) => act.id === "volley")!;
    expect(card.ready).toBe(false);
    expect(card.remaining).toBeGreaterThan(0);

    for (let i = 0; i < 200; i += 1) tickHero(ctx, 0.1); // 20s: past the 14s recharge
    expect(heroActViews(ctx).find((act) => act.id === "volley")!.remaining).toBe(0);
    expect(castHeroAct(ctx, "volley").ok).toBe(true);
  });

  test("an act the hero never picked cannot be cast", () => {
    const ctx = boot();
    spawnHero(ctx);
    expect(castHeroAct(ctx, "ward")).toEqual({ ok: false, reason: "not-picked" });
    expect(castHeroAct(ctx, "sword")).toEqual({ ok: false, reason: "unknown-slot" });
  });

  test("Banner Muster raises the line's damage for 8s and then lapses", () => {
    const ctx = boot();
    spawnHero(ctx, [30, 0, 0]);
    spawnUnit(ctx, "footman_1", "footman", [0, 0, 0]);
    spawnUnit(ctx, "grunt_1", "grunt", [1.4, 0, 0]);
    levelTo(ctx, 2);
    pick(ctx, "muster");

    const before = health(ctx, "grunt_1");
    tickUnits(ctx, 0.016);
    const plainHit = before - health(ctx, "grunt_1");
    expect(plainHit).toBeGreaterThan(0);

    resetSession();
    const buffed = boot();
    spawnHero(buffed, [30, 0, 0]);
    spawnUnit(buffed, "footman_1", "footman", [0, 0, 0]);
    spawnUnit(buffed, "grunt_1", "grunt", [1.4, 0, 0]);
    levelTo(buffed, 2);
    pick(buffed, "muster");
    expect(castHeroAct(buffed, "banner").ok).toBe(true);
    expect(lineMultiplier("player", "enemy")).toBeCloseTo(1.3, 5);

    const buffedBefore = health(buffed, "grunt_1");
    tickUnits(buffed, 0.016);
    expect(buffedBefore - health(buffed, "grunt_1")).toBeGreaterThan(plainHit);

    session.elapsed = 9;
    tickHero(buffed, 0.1);
    expect(lineMultiplier("player", "enemy")).toBeCloseTo(1, 5);
  });

  test("Ash Ward softens what the line takes, and Drilled Tempo shortens every act's recharge", () => {
    const ctx = boot();
    spawnHero(ctx);
    levelTo(ctx, 5);
    pick(ctx, "muster");
    pick(ctx, "volley");
    pick(ctx, "ward");
    const baseCooldown = heroRuntime().kit.config("banner")!.cooldownMs;

    expect(castHeroAct(ctx, "ward").ok).toBe(true);
    expect(lineMultiplier("enemy", "player")).toBeCloseTo(0.55, 5);

    pick(ctx, "tempo");
    expect(heroRuntime().kit.config("banner")!.cooldownMs).toBe(Math.round(baseCooldown * 0.8));
  });

  test("an act with no hero on the field is inert", () => {
    const ctx = boot();
    expect(castHeroAct(ctx, "thunderclap")).toEqual({ ok: false, reason: "unknown-slot" });
    expect(heroActViews(ctx).every((act) => !act.ready)).toBe(true);
  });
});
