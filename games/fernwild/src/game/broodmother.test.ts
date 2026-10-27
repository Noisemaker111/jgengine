import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { editorLayers } from "../editorLayers";
import { onNewPlayer, survivorStart, systems } from "../loop";
import { time, world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { broodView, FIRST_SPIT, greenObelisk, obeliskPrompts, obeliskView } from "./broodmother";
import { SURVIVOR } from "./data/survivor";
import { content } from "./content";
import { creaturesView, tames } from "./creatures";
import { BROOD_LAIR, BROOD_PHASES, BROOD_TIERS, TROPHY_DROPS } from "./data/bosses";
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
