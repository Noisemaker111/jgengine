import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { editorLayers } from "../editorLayers";
import { onNewPlayer, survivorStart, systems } from "../loop";
import { time, world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { admitToLair, broodPhaseAt, broodView, fightSecondsLeft, FIRST_SPIT, greenObelisk, isInside, leaveFight, newBroodFight, obeliskPrompts, obeliskView, summonBrood, tickBroodFight, tributeCheck, type LairCandidate } from "./broodmother";
import { SURVIVOR } from "./data/survivor";
import { content } from "./content";
import { creaturesView, tames } from "./creatures";
import { BROOD_LAIR, BROOD_PHASES, BROOD_TIERS, broodTier, PORTAL, TROPHY_DROPS } from "./data/bosses";
import { itemDef, itemTraits } from "./data/items";
import { speciesDef } from "./data/species";
import { survivorLevel, survivorView } from "./survivor";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (Broodmother test)",
    multiplayer: "off",
    world,
    time,
    authoredDocument: editorLayers,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true });
}

const tick = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05);
};

const cheat = (game: HeadlessRunner, input: Record<string, unknown>) => game.ui.tryInvoke("cheat", input);
const me = (game: HeadlessRunner) => game.ctx.scene.entity.get(game.userId)!;
const fromLair = (at: readonly number[]) => Math.hypot(at[0]! - BROOD_LAIR.center[0], at[2]! - BROOD_LAIR.center[1]);
const carried = (game: HeadlessRunner, item: string) => [BAG, HOTBAR].reduce((sum, id) => sum + game.ctx.player.inventory.count(id, item), 0);

/** A level-30 survivor at the Green Obelisk's foot. */
function atObelisk(): HeadlessRunner {
  const game = runner();
  tick(game, 0.1);
  cheat(game, { xp: 200_000 });
  const [x, , z] = greenObelisk(game.ctx);
  cheat(game, { teleport: [x + 6, z, 0] });
  tick(game, 0.2);
  return game;
}

test("every tribute, reward and trophy is a real item, and each trophy comes off a real species", () => {
  for (const tier of BROOD_TIERS) {
    expect(speciesDef(tier.species)?.torporImmune).toBe(true);
    for (const item of [...Object.keys(tier.tribute), ...Object.keys(tier.rewards)]) expect(itemDef(item)).not.toBeNull();
  }
  for (const [species, trophy] of Object.entries(TROPHY_DROPS)) {
    expect(speciesDef(species)).not.toBeNull();
    expect(itemDef(trophy)).not.toBeNull();
  }
  expect(BROOD_TIERS.map((tier) => [tier.id, tier.minLevel, speciesDef(tier.species)!.health.base])).toEqual([["gamma", 30, 324000], ["beta", 50, 648000], ["alpha", 70, 972000]]);
});

test("the obelisk refuses a summon without the artifacts and takes nothing", () => {
  const game = atObelisk();
  expect(survivorLevel(game.ctx)).toBeGreaterThanOrEqual(30);
  expect(obeliskPrompts(game.ctx)).toHaveLength(1);
  cheat(game, { give: { artifact_clever: 1, artifact_hunter: 1 } });
  game.ui.tryInvoke("obeliskUse", {});
  game.ui.tryInvoke("summonBoss", { tier: "gamma" });
  tick(game, 0.2);
  expect(broodView(game.ctx).phase).toBe("idle");
  expect(carried(game, "artifact_clever")).toBe(1);
  expect(obeliskView(game.ctx).tiers[0]).toMatchObject({ id: "gamma", ok: false, levelOk: true });
});

test("tribute at the Green Obelisk: the portal takes you and your tames to her lair, her brood comes as she weakens, and a win pays and sends you home", () => {
  const game = atObelisk();
  cheat(game, { give: { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 } });
  cheat(game, { summon: { species: "raptor", level: 20, distance: 5, tamed: true } });
  // A tame left far away stays behind.
  const stood = me(game).position.slice();
  game.ui.tryInvoke("summonBoss", { tier: "gamma" });
  tick(game, 0.2);
  expect(broodView(game.ctx).phase).toBe("portal");
  expect(carried(game, "artifact_clever") + carried(game, "artifact_hunter") + carried(game, "artifact_massive")).toBe(0);
  tick(game, 24);
  expect(broodView(game.ctx).inside).toBe(false);
  tick(game, 1.5);
  const view = broodView(game.ctx);
  expect(view).toMatchObject({ phase: "fight", inside: true, survivors: 1, companions: 1, tier: "Gamma", brood: BROOD_PHASES[0]!.brood });
  expect(fromLair(me(game).position)).toBeLessThan(BROOD_LAIR.radius);
  expect(fromLair(tames(game.ctx)[0]!.at)).toBeLessThan(BROOD_LAIR.radius);
  expect(view.boss?.health).toBe(1);

  // She opens with a spit: acid hurts and drugs, and the web slows.
  expect(survivorView(game.ctx).webbed).toBe(false);
  const healthBefore = survivorView(game.ctx).health.value;
  tick(game, FIRST_SPIT + 0.2);
  expect(survivorView(game.ctx).webbed).toBe(true);
  expect(survivorView(game.ctx).health.value).toBeLessThan(healthBefore);
  expect(survivorView(game.ctx).torpor.value).toBeGreaterThan(0);
  expect(me(game).movement?.walkSpeed).toBeLessThan(SURVIVOR.walkSpeed);

  // Below two thirds she calls more of her brood.
  const before = broodView(game.ctx).brood;
  cheat(game, { broodHealth: 0.6 });
  tick(game, 0.3);
  expect(broodView(game.ctx).boss?.phase).toBe("brood");
  expect(broodView(game.ctx).brood).toBe(before + BROOD_PHASES[1]!.brood);

  cheat(game, { broodHealth: 0 });
  tick(game, 0.5);
  expect(broodView(game.ctx).phase).toBe("victory");
  expect(carried(game, "element")).toBe(20);
  expect(carried(game, "spider_flag")).toBe(1);
  expect(carried(game, "broodmother_trophy_gamma")).toBe(1);
  expect(broodView(game.ctx).brood).toBe(0);

  tick(game, 60.5);
  expect(broodView(game.ctx).phase).toBe("idle");
  expect(Math.hypot(me(game).position[0] - stood[0]!, me(game).position[2] - stood[2]!)).toBeLessThan(1);
  expect(fromLair(tames(game.ctx)[0]!.at)).toBeGreaterThan(1000);
  // The lair is cleared for the next summon.
  expect(creaturesView(game.ctx).count).toBeGreaterThan(0);
  expect(broodView(game.ctx).boss).toBeNull();
});

test("die in her lair and the fight is lost: the tames you brought die there", () => {
  const game = atObelisk();
  cheat(game, { give: { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 } });
  cheat(game, { summon: { species: "raptor", level: 20, distance: 5, tamed: true } });
  game.ui.tryInvoke("summonBoss", { tier: "gamma" });
  tick(game, 26);
  expect(broodView(game.ctx).phase).toBe("fight");
  cheat(game, { kill: true });
  tick(game, 0.5);
  expect(broodView(game.ctx).phase).toBe("idle");
  expect(tames(game.ctx)).toHaveLength(0);
  expect(fromLair(me(game).position)).toBeGreaterThan(1000);
});

test("nobody at the obelisk when the portal opens: it closes and the tribute is spent", () => {
  const game = atObelisk();
  cheat(game, { give: { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 } });
  game.ui.tryInvoke("summonBoss", { tier: "gamma" });
  tick(game, 0.2);
  cheat(game, { teleport: [0, 0] });
  tick(game, 26);
  expect(broodView(game.ctx).phase).toBe("idle");
  expect(carried(game, "artifact_clever")).toBe(0);
});

test("the Broodmother is never knocked out: a punch puts no torpor on her, as it does on an Araneo", () => {
  const torporAfterPunches = (species: string) => {
    const game = runner();
    tick(game, 0.1);
    // A survivor with the health to take a bite of hers (180), or she kills them before the punch lands.
    cheat(game, { xp: 200_000, spend: { health: 40 } });
    cheat(game, { teleport: [BROOD_LAIR.center[0] - 20, BROOD_LAIR.center[1], Math.PI / 2] });
    cheat(game, { summon: { species, level: 1, distance: speciesDef(species)!.radius + 0.8 } });
    tick(game, 0.1);
    game.ui.tryInvoke("fire", { yaw: Math.PI / 2 });
    tick(game, 0.1);
    return creaturesView(game.ctx).aimed?.taming?.torpor ?? -1;
  };
  expect(torporAfterPunches("araneo")).toBeGreaterThan(0);
  expect(torporAfterPunches("broodmother_gamma")).toBe(0);
});

test("a dead Argentavis carries its talon: E on the body opens it, and the talon comes out", () => {
  const game = runner();
  tick(game, 0.1);
  cheat(game, { teleport: [BROOD_LAIR.center[0] - 20, BROOD_LAIR.center[1], Math.PI / 2] });
  cheat(game, { summon: { species: "argentavis", level: 1, distance: 2.5 } });
  tick(game, 0.1);
  const bird = creaturesView(game.ctx).aimed!;
  expect(bird.label).toBe("Argentavis");
  expect(bird.inventory.every((slot) => slot === null)).toBe(true);
  game.ctx.scene.entity.stats.set(bird.id, "health", { current: 0 });
  tick(game, 0.2);
  expect(creaturesView(game.ctx).aimed).toMatchObject({ id: bird.id, dead: true });
  game.ui.tryInvoke("creatureUse", {});
  tick(game, 0.1);
  expect(creaturesView(game.ctx).viewing?.inventory[0]).toMatchObject({ itemId: "argentavis_talon", count: 1 });
  game.ui.tryInvoke("takeCreature", { slot: 0 });
  tick(game, 0.1);
  expect(carried(game, "argentavis_talon")).toBe(1);
});

/** What the survivor carries, for a tribute: how many of an item, and taking them. */
function bag(items: Record<string, number>) {
  const held = { ...items };
  return { held, count: (item: string) => held[item] ?? 0, take: (item: string, count: number) => void (held[item] = (held[item] ?? 0) - count) };
}

const AT = [10, 2, 20] as const;
const survivor: LairCandidate = { id: "me", kind: "survivor", at: AT };

test("a short tribute or level summons nothing and takes nothing", () => {
  const gamma = broodTier("gamma");
  if (gamma === null) throw new Error("Fernwild has no Gamma difficulty");
  const items = bag({ artifact_clever: 1 });
  const result = summonBrood(newBroodFight(), "gamma", items, 40, 0);
  expect(result).toEqual({ ok: false, reason: "tribute", check: { ok: false, missing: [{ item: "artifact_hunter", need: 1, have: 0 }, { item: "artifact_massive", need: 1, have: 0 }], levelShort: 0 } });
  expect(items.held).toEqual({ artifact_clever: 1 });
  expect(tributeCheck(gamma, bag({ artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 }).count, 25)).toEqual({ ok: false, missing: [], levelShort: 5 });
  expect(summonBrood(newBroodFight(), "gamma", bag({ artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 }), 25, 0)).toMatchObject({ ok: false, reason: "tribute" });
  expect(summonBrood(newBroodFight(), "omega", bag({}), 30, 0)).toEqual({ ok: false, reason: "unknown" });
});

test("the portal takes the tribute, counts down, then takes everyone in range up to the caps", () => {
  const items = bag({ artifact_clever: 2, artifact_hunter: 1, artifact_massive: 1 });
  const summon = summonBrood(newBroodFight(), "gamma", items, 30, 100);
  expect(summon.ok).toBe(true);
  if (!summon.ok) return;
  expect(items.held).toEqual({ artifact_clever: 1, artifact_hunter: 0, artifact_massive: 0 });
  expect(summonBrood(summon.fight, "gamma", bag({ artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 }), 30, 101)).toEqual({ ok: false, reason: "busy" });
  const crowd: LairCandidate[] = [
    survivor,
    { id: "friend", kind: "survivor", at: AT },
    ...Array.from({ length: PORTAL.maxSurvivors - 2 }, (_unused, index) => ({ id: `survivor-${index}`, kind: "survivor" as const, at: AT })),
    { id: "third", kind: "survivor", at: AT },
    { id: "rex", kind: "companion", at: AT },
    ...Array.from({ length: PORTAL.maxCompanions - 1 }, (_unused, index) => ({ id: `tame-${index}`, kind: "companion" as const, at: AT })),
    { id: "wolf", kind: "companion", at: AT },
  ];
  const idle = tickBroodFight(summon.fight, 124, true, () => crowd);
  expect(idle.events).toEqual([]);
  expect(fightSecondsLeft(summon.fight, 124)).toBe(1);
  const entered = tickBroodFight(summon.fight, 125, true, () => crowd);
  expect(entered.events[0]).toMatchObject({ type: "entered", tier: "gamma", refused: ["third", "wolf"] });
  expect(entered.fight.phase).toBe("fight");
  expect(entered.fight.survivors).toHaveLength(PORTAL.maxSurvivors);
  expect(entered.fight.companions).toHaveLength(PORTAL.maxCompanions);
  expect(isInside(entered.fight, "rex")).toBe(true);
  expect(isInside(entered.fight, "wolf")).toBe(false);
});

test("a portal with no survivor in range closes and the tribute is spent", () => {
  const summon = summonBrood(newBroodFight(), "gamma", bag({ artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 }), 30, 0);
  expect(summon.ok).toBe(true);
  if (!summon.ok) return;
  const tick = tickBroodFight(summon.fight, PORTAL.seconds, true, () => [{ id: "rex", kind: "companion", at: AT }]);
  expect(tick.events).toEqual([{ type: "closed", tier: "gamma" }]);
  expect(tick.fight).toEqual(newBroodFight());
});

test("a win holds the winners a minute, then sends each back where they stood", () => {
  const summon = summonBrood(newBroodFight(), "gamma", bag({ artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 }), 30, 0);
  if (!summon.ok) throw new Error("the gamma tribute should summon her");
  const rex: LairCandidate = { id: "rex", kind: "companion", at: [1, 1, 1] };
  const fight = tickBroodFight(summon.fight, PORTAL.seconds, true, () => [survivor, rex]).fight;
  expect(tickBroodFight(fight, 40, true, () => [survivor]).events).toEqual([]);
  const won = tickBroodFight(fight, 41, false, () => [survivor]);
  expect(won.events).toEqual([{ type: "won", tier: "gamma", survivors: ["me"], companions: ["rex"] }]);
  expect(fightSecondsLeft(won.fight, 41)).toBe(PORTAL.victorySeconds);
  expect(tickBroodFight(won.fight, 100, false, () => []).events).toEqual([]);
  const returned = tickBroodFight(won.fight, 101, false, () => []);
  expect(returned.events).toEqual([{ type: "returned", tier: "gamma", returns: [{ id: "me", kind: "survivor", to: AT }, { id: "rex", kind: "companion", to: [1, 1, 1] }] }]);
  expect(returned.fight).toEqual(newBroodFight());
});

test("when the last survivor falls the fight is lost with the companions inside", () => {
  const summon = summonBrood(newBroodFight(), "gamma", bag({ artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 }), 30, 0);
  if (!summon.ok) throw new Error("the gamma tribute should summon her");
  const fight = tickBroodFight(summon.fight, PORTAL.seconds, true, () => [survivor, { id: "rex", kind: "companion", at: AT }]).fight;
  const left = leaveFight(fight, "me");
  expect(tickBroodFight(left, 26, true, () => []).events).toEqual([{ type: "lost", tier: "gamma", companions: ["rex"] }]);
});

test("a saved fight resumes where it stood", () => {
  const summon = summonBrood(newBroodFight(), "gamma", bag({ artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 }), 30, 0);
  if (!summon.ok) throw new Error("the gamma tribute should summon her");
  const fight = tickBroodFight(summon.fight, PORTAL.seconds, true, () => [survivor]).fight;
  const saved = JSON.parse(JSON.stringify(fight));
  expect(isInside(saved, "me")).toBe(true);
  expect(tickBroodFight(saved, 30, false, () => []).events[0]?.type).toBe("won");
});

test("her phases follow her health down and never step back up", () => {
  expect(broodPhaseAt(null, 1).id).toBe("hunt");
  expect(broodPhaseAt("hunt", 0.67).id).toBe("hunt");
  expect(broodPhaseAt("hunt", 0.66).id).toBe("brood");
  expect(broodPhaseAt("brood", 0.33).id).toBe("frenzy");
  expect(broodPhaseAt(null, 0).id).toBe("frenzy");
  expect(broodPhaseAt("frenzy", 1).id).toBe("frenzy");
  expect(broodPhaseAt(null, Number.NaN).id).toBe("hunt");
});

