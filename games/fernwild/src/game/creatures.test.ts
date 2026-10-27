import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { content } from "./content";
import { creatureCard, creaturesView } from "./creatures";
import { itemTraits } from "./data/items";
import { openScreen } from "./screens";
import { editorLayers } from "../editorLayers";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";
import { speciesDef, wildLevelCap } from "./data/species";
import { entityModels } from "./models";

function islandRunner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (creatures test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true });
}

const tick = (runner: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) runner.step(0.05);
};
const bagSlot = (runner: HeadlessRunner, itemId: string) => runner.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === itemId);
const equip = (runner: HeadlessRunner, itemId: string) => {
  runner.ui.tryInvoke("shuttle", { inventoryId: BAG, slot: bagSlot(runner, itemId) });
  runner.ctx.item.use.use({ from: runner.userId, itemId, inventoryId: HOTBAR });
};
const facing = (runner: HeadlessRunner) => runner.ctx.scene.entity.get(runner.userId)!.rotationY;

const wildNames = (runner: HeadlessRunner) => runner.ctx.scene.entity.list().filter((entity) => entity.id !== runner.userId).map((entity) => entity.name);
const farthest = (runner: HeadlessRunner) => {
  const me = runner.ctx.scene.entity.get(runner.userId)!.position;
  return Math.max(...runner.ctx.scene.entity.list().filter((entity) => entity.id !== runner.userId).map((entity) => Math.hypot(entity.position[0] - me[0], entity.position[2] - me[2])));
};

test("every species any spawn zone lists has stats and a body, so no zone stays empty", () => {
  const listed = new Set(
    markersOfKind(editorLayers, "creature_spawn").flatMap((marker) => ((marker.meta ?? {}) as { species?: readonly { species: string }[] }).species ?? []).map((entry) => entry.species),
  );
  expect(listed.size).toBeGreaterThan(40);
  const missing = [...listed].filter((species) => speciesDef(species) === null || entityModels[species] === undefined);
  expect(missing).toEqual([]);
});

test("only the herds near the survivor are awake, and they follow the survivor across the island", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  // The south beach wakes with ARK's beach herds: dodos and phiomias, nothing from the far side of the island.
  const beach = new Set(wildNames(runner));
  expect(beach.has("dodo")).toBe(true);
  expect(beach.has("phiomia")).toBe(true);
  expect(creaturesView(runner.ctx).count).toBeGreaterThan(5);
  expect(farthest(runner)).toBeLessThan(320);

  // Carried to the farthest jungle zone across the island, the beach herds sleep (they are gone) and the zones there wake.
  const beachIds = new Set(runner.ctx.scene.entity.list().map((entity) => entity.id).filter((id) => id !== runner.userId));
  const me0 = runner.ctx.scene.entity.get(runner.userId)!.position;
  const far = markersOfKind(editorLayers, "creature_spawn")
    .filter((marker) => marker.meta?.["biome"] === "jungle")
    .sort((a, b) => Math.hypot(b.position.x - me0[0], b.position.z - me0[2]) - Math.hypot(a.position.x - me0[0], a.position.z - me0[2]))[0]!;
  expect(Math.hypot(far.position.x - me0[0], far.position.z - me0[2])).toBeGreaterThan(1000);
  runner.ctx.scene.entity.setPose(runner.userId, { position: [far.position.x, runner.ctx.world.groundHeightAt(far.position.x, far.position.z), far.position.z], rotationY: 0 });
  tick(runner, 0.2);
  const there = runner.ctx.scene.entity.list().filter((entity) => entity.id !== runner.userId);
  expect(there.length).toBeGreaterThan(0);
  expect(there.some((entity) => beachIds.has(entity.id))).toBe(false);
  expect(farthest(runner)).toBeLessThan(320);
});

test("club a raptor unconscious, tame it on raw meat, saddle it and ride it", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  // A survivor who levelled health and stamina, as anyone taking on a raptor with a club must: it
  // bites for 15 every 0.8 s while they swing, so they need far more than a new survivor's 100 health.
  runner.ui.tryInvoke("cheat", { xp: 100000, give: { wooden_club: 1, raw_meat: 10, raptor_saddle: 1 }, tamingSpeed: 20, spend: { health: 45, stamina: 8 } });
  equip(runner, "wooden_club");
  runner.ui.tryInvoke("cheat", { summon: { species: "raptor", level: 1, distance: 2.5 } });

  let hits = 0;
  while (creaturesView(runner.ctx).down === 0 && hits < 40) {
    runner.ui.tryInvoke("fire", { yaw: facing(runner) });
    hits += 1;
    tick(runner, 0.95);
  }
  // A club hit lands 20 torpor on a level-1 raptor's 180; its torpor drains a little between swings.
  expect(hits).toBeGreaterThanOrEqual(9);
  expect(hits).toBeLessThanOrEqual(10);
  expect(creaturesView(runner.ctx).aimed?.taming?.unconscious).toBe(true);
  // It fought back the whole time, and the survivor outlasted it.
  const health = runner.ctx.scene.entity.stats.get(runner.userId, "health")!;
  expect(health.current).toBeGreaterThan(0);
  expect(health.current).toBeLessThan(health.max - 150);

  runner.ui.tryInvoke("creatureUse", {});
  expect(openScreen(runner.ctx)).toBe("creature");
  runner.ui.tryInvoke("giveCreature", { inventoryId: BAG, slot: bagSlot(runner, "raw_meat") });
  expect(creaturesView(runner.ctx).viewing?.inventory.some((slot) => slot?.itemId === "raw_meat")).toBe(true);
  for (let t = 0; t < 40 && creaturesView(runner.ctx).tamed === 0; t += 1) tick(runner, 1);
  const tame = creaturesView(runner.ctx).viewing!;
  expect(tame.tamed).toBe(true);
  // Seven raw meat at level 1; the other three stay in its inventory.
  expect(tame.inventory.filter((slot) => slot?.itemId === "raw_meat").reduce((sum, slot) => sum + slot!.count, 0)).toBe(3);

  runner.ui.tryInvoke("giveCreature", { inventoryId: BAG, slot: bagSlot(runner, "raptor_saddle") });
  expect(creaturesView(runner.ctx).viewing?.saddled).toBe(true);
  runner.ui.tryInvoke("closeCreature", {});
  runner.ui.tryInvoke("creatureUse", {});
  expect(runner.ctx.player.possession.active(runner.userId)).toBe(tame.id);
  expect(creaturesView(runner.ctx).riding?.id).toBe(tame.id);

  // W now drives the raptor at its own walking pace, with the rider on its back.
  const start = runner.ctx.scene.entity.get(tame.id)!.position;
  runner.aim({ heading: facing(runner) });
  for (let t = 0; t < 1; t += 0.05) runner.step(0.05, { held: ["moveForward"] });
  const mount = runner.ctx.scene.entity.get(tame.id)!;
  expect(Math.hypot(mount.position[0] - start[0], mount.position[2] - start[2])).toBeGreaterThan(3.5);
  const rider = runner.ctx.scene.entity.get(runner.userId)!;
  expect(Math.hypot(rider.position[0] - mount.position[0], rider.position[2] - mount.position[2])).toBeLessThan(0.5);
  expect(rider.position[1]).toBeGreaterThan(mount.position[1] + 1);

  runner.ui.tryInvoke("creatureUse", {});
  expect(runner.ctx.player.possession.active(runner.userId)).toBe(runner.userId);
});

test("a tame levels on ARK's curve from kills, spends points into its stats, and a ridden sprint costs its stamina", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  runner.ui.tryInvoke("cheat", { give: { raptor_saddle: 1 }, summon: { species: "raptor", level: 1, distance: 2.5 } });
  tick(runner, 0.1);
  runner.ui.tryInvoke("cheat", { forceTame: true });
  tick(runner, 0.1);
  const raptor = creaturesView(runner.ctx).aimed!;
  expect(raptor.tamed).toBe(true);
  expect(raptor.growth).toMatchObject({ tamedAt: 1, gained: 0, unspent: 0, xpNext: 10 });
  expect(raptor.stamina).toEqual({ value: 150, max: 150 });

  // 10 XP for the first level, 20 for the second: 35 XP is two levels and 5 toward the third.
  runner.ui.tryInvoke("creatureUse", {});
  runner.ui.tryInvoke("cheat", { tameXp: 35 });
  let sheet = creaturesView(runner.ctx).viewing!;
  expect(sheet.level).toBe(3);
  expect(sheet.growth).toMatchObject({ gained: 2, unspent: 2, xp: 5, xpNext: 30 });

  // Each health point adds ARK's 5.4% of the 200 it was tamed with, to the max and to what it has.
  runner.ui.tryInvoke("levelTame", { stat: "health" });
  runner.ui.tryInvoke("levelTame", { stat: "health" });
  runner.ui.tryInvoke("levelTame", { stat: "stamina" });
  sheet = creaturesView(runner.ctx).viewing!;
  expect(sheet.health).toEqual({ value: 222, max: 222 });
  expect(sheet.growth!.unspent).toBe(0);
  expect(sheet.growth!.stats.find((stat) => stat.id === "health")!.points).toBe(2);

  // A kill by the tame gives it the kill's XP: a level-1 dodo is worth ARK's 2.
  runner.ui.tryInvoke("giveCreature", { inventoryId: BAG, slot: bagSlot(runner, "raptor_saddle") });
  runner.ui.tryInvoke("closeCreature", {});
  runner.ui.tryInvoke("creatureUse", {});
  expect(creaturesView(runner.ctx).riding?.id).toBe(raptor.id);
  runner.ui.tryInvoke("cheat", { summon: { species: "dodo", level: 1, distance: 2.4 } });
  const mount = runner.ctx.scene.entity.get(raptor.id)!;
  const dodo = runner.ctx.scene.entity.list().filter((entity) => entity.name === "dodo").sort((a, b) => Math.hypot(a.position[0] - mount.position[0], a.position[2] - mount.position[2]) - Math.hypot(b.position[0] - mount.position[0], b.position[2] - mount.position[2]))[0]!;
  runner.ctx.scene.entity.setPose(dodo.id, { position: [mount.position[0] + Math.sin(mount.rotationY) * 2.4, mount.position[1], mount.position[2] + Math.cos(mount.rotationY) * 2.4], rotationY: 0 });
  // A hurt dodo runs; leave it one bite from death so the kill lands before it can.
  runner.ctx.scene.entity.stats.set(dodo.id, "health", { current: 5 });
  const xpBefore = creaturesView(runner.ctx).riding!.growth!.xp;
  runner.ui.tryInvoke("fire", {});
  tick(runner, 0.1);
  expect(runner.ctx.scene.entity.stats.get(dodo.id, "health")!.current).toBeLessThanOrEqual(0);
  expect(creaturesView(runner.ctx).riding!.growth!.xp - xpBefore).toBeCloseTo(2, 1);

  // Sprinting on its back burns ARK's 6 stamina a second; walking spends none.
  runner.aim({ heading: runner.ctx.scene.entity.get(raptor.id)!.rotationY });
  const fresh = creaturesView(runner.ctx).riding!.stamina.value;
  for (let t = 0; t < 2; t += 0.05) runner.step(0.05, { held: ["moveForward", "sprint"] });
  const spent = fresh - creaturesView(runner.ctx).riding!.stamina.value;
  expect(spent).toBeGreaterThan(10);
  expect(spent).toBeLessThan(13);
});

test("bare fists knock out as well as hurt: a punch puts ARK's 1.75x its damage into torpor", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  runner.ui.tryInvoke("cheat", { summon: { species: "phiomia", level: 1, distance: 1.2 } });
  tick(runner, 0.1);
  expect(creaturesView(runner.ctx).aimed?.label).toBe("Phiomia");
  runner.ui.tryInvoke("fire", { yaw: facing(runner) });
  tick(runner, 0.1);
  const card = creaturesView(runner.ctx).aimed!;
  expect(card.health.value).toBe(card.health.max - 8);
  // 8 damage x 1.75 = 14 torpor, all of it on the creature.
  expect(card.taming?.torpor).toBe(14);
});

test("danger rises with distance: the beach herds are level 5 at most, the far side of the island rolls up to 30", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  const survivor = runner.ctx.scene.entity.get(runner.userId);
  if (survivor === null) throw new Error("no survivor on the beach");
  const start = survivor.position;
  // A herd's zone is 40 m across, so a creature may stand up to 40 m nearer the start than its zone's centre.
  const wild = runner.ctx.scene.entity.list().filter((entity) => entity.id !== runner.userId);
  expect(wild.length).toBeGreaterThan(5);
  for (const entity of wild) {
    const fromStart = Math.hypot(entity.position[0] - start[0], entity.position[2] - start[2]);
    expect(creatureCard(runner.ctx, entity.id)?.level ?? Infinity).toBeLessThanOrEqual(wildLevelCap(fromStart + 40));
  }
  const nearby = wild.filter((entity) => Math.hypot(entity.position[0] - start[0], entity.position[2] - start[2]) < 60);
  expect(nearby.length).toBeGreaterThan(0);
  for (const entity of nearby) expect(creatureCard(runner.ctx, entity.id)?.level ?? Infinity).toBeLessThanOrEqual(7);
  // The beach by the start keeps no hunters: a new survivor learns the island before anything hunts them.
  expect(nearby.filter((entity) => speciesDef(entity.name)?.temperament === "aggressive").map((entity) => entity.name)).toEqual([]);
  expect(wildLevelCap(0)).toBe(5);
  expect(wildLevelCap(500)).toBe(15);
  expect(wildLevelCap(2000)).toBe(30);
});

test("fists put a dodo to sleep before they kill it, at any wild level", () => {
  for (const level of [1, 15, 30]) {
    const runner = islandRunner();
    tick(runner, 0.1);
    runner.ui.tryInvoke("cheat", { summon: { species: "dodo", level, distance: 1.2 } });
    tick(runner, 0.1);
    const me = runner.ctx.scene.entity.get(runner.userId);
    if (me === null) throw new Error("no survivor on the beach");
    const near = (id: string) => {
      const at = runner.ctx.scene.entity.get(id)?.position;
      return at === undefined ? Infinity : Math.hypot(at[0] - me.position[0], at[2] - me.position[2]);
    };
    const dodo = runner.ctx.scene.entity.list().filter((entity) => entity.name === "dodo").sort((a, b) => near(a.id) - near(b.id))[0]?.id ?? "";
    expect(dodo).not.toBe("");
    // The dodo runs when hit: each swing, the survivor has caught up with it again.
    for (let swing = 0; swing < 60 && runner.ctx.scene.entity.get(dodo) !== undefined; swing += 1) {
      const yaw = facing(runner);
      const [x, , z] = me.position;
      const ahead: [number, number] = [x + Math.sin(yaw) * 1.2, z + Math.cos(yaw) * 1.2];
      runner.ctx.scene.entity.setPose(dodo, { position: [ahead[0], runner.ctx.world.groundHeightAt(ahead[0], ahead[1]), ahead[1]], rotationY: 0 });
      tick(runner, 0.05);
      const card = creaturesView(runner.ctx).aimed;
      if (card?.taming?.unconscious === true) break;
      runner.ui.tryInvoke("fire", { yaw });
      tick(runner, 1);
    }
    expect(runner.ctx.scene.entity.get(dodo)).toBeDefined();
    expect(creaturesView(runner.ctx).aimed?.taming?.unconscious).toBe(true);
  }
});

test("a dodo runs when hit, and its body carves into meat and hide", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  runner.ui.tryInvoke("cheat", { give: { spear: 1, stone_pick: 1 }, summon: { species: "dodo", level: 1, distance: 1.6 } });
  equip(runner, "spear");
  const dodo = creaturesView(runner.ctx).aimed?.id ?? null;
  tick(runner, 0.1);
  expect(creaturesView(runner.ctx).aimed?.label).toBe("Dodo");
  runner.ui.tryInvoke("fire", { yaw: facing(runner) });
  tick(runner, 0.95);
  expect(runner.ctx.scene.entity.distance(dodo ?? creaturesView(runner.ctx).aimed!.id, runner.userId)!).toBeGreaterThan(2);
  runner.ui.tryInvoke("fire", { yaw: facing(runner) });
  tick(runner, 0.2);
  expect(creaturesView(runner.ctx).aimed?.dead).toBe(true);

  // Walk up to the body and carve it with a pick: meat first, as ARK's pick favours.
  const body = runner.ctx.scene.entity.get(creaturesView(runner.ctx).aimed!.id)!;
  const me = runner.ctx.scene.entity.get(runner.userId)!;
  const away = Math.atan2(body.position[0] - me.position[0], body.position[2] - me.position[2]);
  runner.ctx.scene.entity.setPose(runner.userId, { position: [body.position[0] - Math.sin(away) * 1.2, body.position[1], body.position[2] - Math.cos(away) * 1.2], rotationY: away });
  equip(runner, "stone_pick");
  for (let swing = 0; swing < 4; swing += 1) {
    runner.ui.tryInvoke("fire", { yaw: facing(runner) });
    tick(runner, 0.75);
  }
  expect(runner.ctx.player.inventory.count(BAG, "raw_meat")).toBeGreaterThan(runner.ctx.player.inventory.count(BAG, "hide"));
});
