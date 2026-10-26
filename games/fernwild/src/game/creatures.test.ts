import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, systems } from "../loop";
import { world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { content } from "./content";
import { creaturesView } from "./creatures";
import { itemTraits } from "./data/items";
import { openScreen } from "./screens";

function islandRunner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (creatures test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
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
  const slot = runner.ctx.player.inventory.state(HOTBAR).slots.findIndex((stack) => stack?.itemId === itemId);
  runner.ui.tryInvoke(`slot${slot + 1}`, {});
};
const facing = (runner: HeadlessRunner) => runner.ctx.scene.entity.get(runner.userId)!.rotationY;

test("the island's herds wake with the survivor: dodos, phiomias and raptors", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  expect(creaturesView(runner.ctx).count).toBe(7);
  const names = new Set(runner.ctx.scene.entity.list().map((entity) => entity.name));
  for (const species of ["dodo", "phiomia", "raptor"]) expect(names.has(species)).toBe(true);
});

test("club a raptor unconscious, tame it on raw meat, saddle it and ride it", () => {
  const runner = islandRunner();
  tick(runner, 0.1);
  // A survivor who levelled health and stamina, as anyone taking on a raptor with a club must: it
  // bites for 15 every 0.8 s while they swing, so they need about 500 health to outlast 18 hits.
  runner.ui.tryInvoke("cheat", { xp: 100000, give: { wooden_club: 1, raw_meat: 10, raptor_saddle: 1 }, tamingSpeed: 20, spend: { health: 45, stamina: 8 } });
  equip(runner, "wooden_club");
  runner.ui.tryInvoke("cheat", { summon: { species: "raptor", level: 1, distance: 2.5 } });

  let hits = 0;
  while (creaturesView(runner.ctx).down === 0 && hits < 40) {
    runner.ui.tryInvoke("fire", { yaw: facing(runner) });
    hits += 1;
    tick(runner, 0.95);
  }
  // ARK's wiki counts 18 club hits for a level-1 raptor; its torpor drains a little between swings.
  expect(hits).toBeGreaterThanOrEqual(18);
  expect(hits).toBeLessThanOrEqual(19);
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
