import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { onNewPlayer, survivorStart, systems } from "../loop";
import { time, world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { content } from "./content";
import { burrowed, creatureCard, creatureStep, creaturesView, destroyWild, hitCreature, slayCreature, disturbForest, isPuppeted, onShoulder, puppetTames, sentryPings, setStorm, stormView } from "./creatures";
import { itemTraits } from "./data/items";
import { editorLayers } from "../editorLayers";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";
import { survivorView } from "./survivor";

/** Wildwire's machine instincts, played in the real game: tricks, stealth, helpers and the Hivemind's signal. */
function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Wildwire (machines test)",
    multiplayer: "off",
    world,
    time,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true, movement: game.controls?.movement });
}

const tick = (g: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) g.step(0.05);
};
const summon = (g: HeadlessRunner, species: string, extra: Record<string, unknown> = {}) => {
  g.ui.tryInvoke("cheat", { summon: { species, level: 1, distance: 2.5, ...extra } });
  tick(g, 0.1);
  return g.ctx.scene.entity.list().filter((entity) => entity.name === species).at(-1)!.id;
};
/** A fresh game with the beach's herds cleared, so only what a test summons is near. */
function quiet(): HeadlessRunner {
  const g = runner();
  tick(g, 0.1);
  destroyWild(g.ctx);
  tick(g, 0.1);
  return g;
}

test("a Klepto that reaches you steals a stack from your bag and blinks away with it", () => {
  const g = quiet();
  g.ctx.player.inventory.put(BAG, "metal_ingot", 25);
  const klepto = summon(g, "klepto");
  const before = g.ctx.player.inventory.count(BAG, "metal_ingot");
  let stole = false;
  for (let i = 0; i < 200 && !stole; i += 1) {
    tick(g, 0.1);
    stole = (creatureCard(g.ctx, klepto)?.inventory ?? []).some((slot) => slot !== null);
  }
  expect(stole).toBe(true);
  expect(g.ctx.player.inventory.count(BAG, "metal_ingot")).toBeLessThan(before + 1);
  const me = g.ctx.scene.entity.get(g.userId)!.position;
  const at = g.ctx.scene.entity.get(klepto)!.position;
  expect(Math.hypot(at[0] - me[0], at[2] - me[2])).toBeGreaterThan(10);
});

test("a Rootkit stands dormant like a tree until someone chops near it, then the forest stands up", () => {
  const g = quiet();
  const rootkit = summon(g, "rootkit", { distance: 6 });
  expect(creatureCard(g.ctx, rootkit)!.dormant).toBe(true);
  const at = g.ctx.scene.entity.get(rootkit)!.position;
  tick(g, 3);
  const still = g.ctx.scene.entity.get(rootkit)!.position;
  expect(Math.hypot(still[0] - at[0], still[2] - at[2])).toBeLessThan(0.01);
  expect(disturbForest(g.ctx, g.ctx.scene.entity.get(g.userId)!.position)).toBe(1);
  expect(creatureCard(g.ctx, rootkit)!.dormant).toBe(false);
  tick(g, 2);
  const now = g.ctx.scene.entity.get(rootkit)!.position;
  expect(Math.hypot(now[0] - at[0], now[2] - at[2])).toBeGreaterThan(0.5);
});

test("a Ticklet swarm's bite drains your stamina", () => {
  const g = quiet();
  summon(g, "ticklet", { distance: 1.5 });
  const start = survivorView(g.ctx).stamina.value;
  let drained = false;
  for (let i = 0; i < 100 && !drained; i += 1) {
    tick(g, 0.1);
    drained = survivorView(g.ctx).stamina.value < start - 10;
  }
  expect(drained).toBe(true);
});

test("a Scrapper Rex hunts other machines before people, and bolts their parts onto itself", () => {
  const g = quiet();
  const scrapper = summon(g, "scrapper", { distance: 30 });
  g.ui.tryInvoke("cheat", { summon: { species: "mowbot", level: 1, distance: 26 } });
  tick(g, 0.1);
  for (let i = 0; i < 200 && (creatureCard(g.ctx, scrapper)?.scrapped ?? 0) === 0; i += 1) tick(g, 0.1);
  expect(creatureCard(g.ctx, scrapper)!.scrapped).toBeGreaterThan(0);
});

test("riding a rigged Mirrorcat, wild hunters do not see you", () => {
  const g = quiet();
  g.ui.tryInvoke("cheat", { give: { mirrorcat_rig: 1 }, summon: { species: "mirrorcat", level: 1, distance: 2.5, tamed: true } });
  tick(g, 0.1);
  const cat = creaturesView(g.ctx).aimed!;
  g.ui.tryInvoke("creatureUse", {});
  g.ui.tryInvoke("giveCreature", { inventoryId: BAG, slot: g.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "mirrorcat_rig") });
  g.ui.tryInvoke("closeCreature", {});
  g.ui.tryInvoke("creatureUse", {});
  expect(creaturesView(g.ctx).riding?.id).toBe(cat.id);
  const hunter = summon(g, "fangsaw", { distance: 6 });
  let seen = false;
  for (let i = 0; i < 60; i += 1) {
    tick(g, 0.1);
    if (creatureStep(g.ctx, hunter)?.targetId === g.userId || creatureStep(g.ctx, hunter)?.targetId === cat.id) seen = true;
  }
  // It never sees its prey; hit it and the cloak no longer hides you from that one.
  expect(seen).toBe(false);
});

test("a following Ticklet patches you up, and the Hivemind's signal freezes your bots", () => {
  const g = quiet();
  const ticklet = summon(g, "ticklet", { tamed: true, distance: 2 });
  g.ui.tryInvoke("whistleFollow", {});
  g.ctx.scene.entity.stats.set(g.userId, "health", { max: survivorView(g.ctx).health.max, current: 20 });
  const hurt = survivorView(g.ctx).health.value;
  tick(g, 9);
  expect(survivorView(g.ctx).health.value).toBeGreaterThan(hurt);
  expect(puppetTames(g.ctx, g.ctx.scene.entity.get(g.userId)!.position, 20, 5)).toBe(1);
  expect(isPuppeted(g.ctx, ticklet)).toBe(true);
  expect(creatureCard(g.ctx, ticklet)!.puppeted).toBe(true);
  tick(g, 6);
  expect(isPuppeted(g.ctx, ticklet)).toBe(false);
});

test("a Watchwing on Guard Zone pings hostiles that come near its post", () => {
  const g = quiet();
  summon(g, "watchwing", { tamed: true, distance: 2 });
  tick(g, 5);
  summon(g, "fangsaw", { distance: 20 });
  tick(g, 5);
  expect(Object.values(sentryPings(g.ctx)).some((count) => count > 0)).toBe(true);
});

test("in a Signal Storm wild machines are Overclocked: even a passive grazer hunts", () => {
  const g = quiet();
  const grazer = summon(g, "craneback", { distance: 8 });
  setStorm(g.ctx, true);
  expect(stormView(g.ctx).storm).toBe(true);
  expect(creatureCard(g.ctx, grazer)!.overclocked).toBe(true);
  tick(g, 4);
  const me = g.ctx.scene.entity.get(g.userId)!.position;
  const at = g.ctx.scene.entity.get(grazer)!.position;
  expect(Math.hypot(at[0] - me[0], at[2] - me[2])).toBeLessThan(5);
});

test("a Choir ring's conductor shields the other singers until it falls", () => {
  const g = quiet();
  g.ui.tryInvoke("cheat", { summon: { species: "choir", level: 9, distance: 6 } });
  g.ui.tryInvoke("cheat", { summon: { species: "choir", level: 1, distance: 3 } });
  tick(g, 0.1);
  const singers = g.ctx.scene.entity.list().filter((entity) => entity.name === "choir").map((entity) => entity.id);
  const conductor = singers.find((id) => creatureCard(g.ctx, id)!.conductor)!;
  const singer = singers.find((id) => id !== conductor)!;
  expect(creatureCard(g.ctx, conductor)!.level).toBe(9);
  const before = creatureCard(g.ctx, singer)!.health.value;
  hitCreature(g.ctx, singer, 40);
  expect(before - creatureCard(g.ctx, singer)!.health.value).toBeLessThanOrEqual(10);
  slayCreature(g.ctx, conductor);
  tick(g, 0.1);
  const after = creatureCard(g.ctx, singer)!.health.value;
  hitCreature(g.ctx, singer, 20);
  expect(after - creatureCard(g.ctx, singer)!.health.value).toBeGreaterThanOrEqual(19);
});

test("an Echo Mimic copies the last trick pulled near it and turns it on you", () => {
  const g = quiet();
  summon(g, "ticklet", { distance: 1.5 });
  for (let i = 0; i < 100 && !g.ctx.game.notices.list().some((n) => n.text.startsWith("Ticklet:")); i += 1) tick(g, 0.1);
  summon(g, "echo", { distance: 1.5 });
  let echoed = false;
  for (let i = 0; i < 150 && !echoed; i += 1) {
    tick(g, 0.1);
    echoed = g.ctx.game.notices.list().some((n) => n.text.startsWith("Echo Mimic: latched on"));
  }
  expect(echoed).toBe(true);
});

test("an uploaded Ticklet told to follow rides on your shoulder", () => {
  const g = quiet();
  const ticklet = summon(g, "ticklet", { tamed: true, distance: 3 });
  expect(onShoulder(g.ctx, ticklet)).toBe(false);
  g.ui.tryInvoke("whistleFollow", {});
  tick(g, 0.5);
  expect(onShoulder(g.ctx, ticklet)).toBe(true);
  g.ui.tryInvoke("whistleStay", {});
  tick(g, 1);
  expect(onShoulder(g.ctx, ticklet)).toBe(false);
});

test("a wild Watchwing perches still by day and takes to the night", () => {
  const moves = (clock: number) => {
    const g = quiet();
    g.ui.tryInvoke("cheat", { clock });
    tick(g, 0.1);
    const owl = summon(g, "watchwing", { distance: 6 });
    const start = g.ctx.scene.entity.get(owl)!.position;
    tick(g, 4);
    const after = g.ctx.scene.entity.get(owl)!.position;
    return Math.hypot(after[0] - start[0], after[2] - start[2]);
  };
  // Noon: perched, however close you stand. Near midnight: skittish and off.
  expect(moves(3600 * 0.5)).toBeLessThan(0.01);
  expect(moves(3600 * 0.95)).toBeGreaterThan(1);
});


test("a wild Thermite Beetle lies burrowed with only its shell showing, and bursts out when you cross its ground", () => {
  const g = quiet();
  const beetle = summon(g, "thermite", { distance: 30 });
  tick(g, 2);
  expect(burrowed(g.ctx, beetle)).toBe(true);
  const at = g.ctx.scene.entity.get(beetle)!.position;
  g.ui.tryInvoke("cheat", { teleport: [at[0] + 3, at[2], 0] });
  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    tick(g, 0.1);
    up = !burrowed(g.ctx, beetle);
  }
  expect(up).toBe(true);
});

test("Lampjaws spawn and stay in deep water off the beaches; Arcwires spawn in the rivers and swim them", () => {
  // A fresh game: the zones near the start fill on the first step, the deep water off the beach among them.
  const g = runner();
  tick(g, 0.1);
  const zone = (prefix: string) => markersOfKind(editorLayers, "creature_spawn").find((marker) => marker.id.startsWith(prefix))!;
  const anglers = g.ctx.scene.entity.list().filter((entity) => entity.name === "lampjaw");
  expect(anglers.length).toBeGreaterThan(0);
  tick(g, 10);
  for (const angler of g.ctx.scene.entity.list().filter((entity) => entity.name === "lampjaw")) {
    const [x, y, z] = angler.position;
    expect(g.ctx.world.groundHeightAt(x, z)).toBeLessThan(-0.3);
    expect(y).toBeCloseTo(-0.6, 1);
  }
  const river = zone("river_");
  g.ui.tryInvoke("cheat", { teleport: [river.position.x + 50, river.position.z + 50, 0] });
  for (let i = 0; i < 20; i += 1) tick(g, 0.5);
  const eels = g.ctx.scene.entity.list().filter((entity) => entity.name === "arcwire" && Math.hypot(entity.position[0] - river.position.x, entity.position[2] - river.position.z) < 30);
  expect(eels.length).toBeGreaterThan(0);
  expect(eels.some((eel) => g.ctx.world.groundHeightAt(eel.position[0], eel.position[2]) < -0.3)).toBe(true);
});
