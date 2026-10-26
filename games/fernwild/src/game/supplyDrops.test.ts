import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { editorLayers } from "../editorLayers";
import { onNewPlayer, systems } from "../loop";
import { time, world } from "../world";
import { content } from "./content";
import { itemDef, itemTraits } from "./data/items";
import { SUPPLY_TIERS } from "./data/supplyDrops";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { DROP_HEIGHT, FALL_SECONDS, nearestSupplyDrop, rollCrate, supplyDropPrompts, supplyDrops, supplySites } from "./supplyDrops";
import { survivorLevel } from "./survivor";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (supply drop test)",
    multiplayer: "off",
    world,
    time,
    authoredDocument: editorLayers,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true });
}

const tick = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05);
};

/** Jump the world clock forward, the way the admin settimeofday does, and let the systems catch up. */
const skip = (game: HeadlessRunner, seconds: number) => {
  game.ui.tryInvoke("cheat", { clock: game.ctx.time.now() + seconds });
  tick(game, 0.6);
};

const carried = (game: HeadlessRunner, item: string) => [BAG, HOTBAR].reduce((sum, id) => sum + game.ctx.player.inventory.count(id, item), 0);

test("every crate's loot is something the survivor can hold, and the colours climb from the beaches to the snow", () => {
  for (const tier of SUPPLY_TIERS) for (const entry of tier.loot) expect(itemDef(entry.item!)).not.toBeNull();
  expect(SUPPLY_TIERS.map((tier) => [tier.id, tier.minLevel])).toEqual([["white", 3], ["green", 15], ["blue", 25], ["purple", 35], ["yellow", 45], ["red", 60]]);
  const game = runner();
  tick(game, 0.1);
  // A crate holds its tier's picks, the same item merged: a white one 1–3 stacks, a red one up to 7.
  for (let n = 0; n < 50; n += 1) {
    const white = rollCrate(game.ctx, "white");
    expect(white.length).toBeGreaterThanOrEqual(1);
    expect(white.length).toBeLessThanOrEqual(3);
    expect(new Set(white.map((stack) => stack.item)).size).toBe(white.length);
  }
  const sites = supplySites(game.ctx);
  const known = new Set(SUPPLY_TIERS.map((tier) => tier.id));
  for (const site of sites) {
    // On land, not in the sea.
    expect(site.at[1]).toBeGreaterThan(0.3);
    for (const entry of site.tiers) expect(known.has(entry.tier)).toBe(true);
  }
  const tiersAt = (prefix: string) => new Set(sites.filter((site) => site.id.startsWith(prefix)).flatMap((site) => site.tiers.map((entry) => entry.tier)));
  expect([...tiersAt("drop_south_coast")].sort()).toEqual(["green", "white"]);
  expect(tiersAt("drop_snow").has("red")).toBe(true);
  expect(tiersAt("drop_snow").has("white")).toBe(false);
});

test("a world under way already has crates down across the island", () => {
  const game = runner();
  tick(game, 1);
  const drops = supplyDrops(game.ctx);
  expect(drops.length).toBeGreaterThan(5);
  expect(drops.some((drop) => drop.landed)).toBe(true);
  expect(new Set(drops.map((drop) => drop.tier)).size).toBeGreaterThan(2);
});

test("a crate falls from the sky over two minutes, a fresh survivor can't open it, and at level 3 they take its loot", () => {
  const game = runner();
  tick(game, 0.1);
  const site = supplySites(game.ctx).find((entry) => entry.id === "drop_south_coast_1")!;
  game.ui.tryInvoke("cheat", { teleport: [site.at[0] + 1.5, site.at[2]] });
  tick(game, 0.1);
  game.ui.tryInvoke("cheat", { drop: "white" });
  tick(game, 0.6);
  expect(nearestSupplyDrop(game.ctx)).toMatchObject({ tier: "white", landed: false });
  expect(nearestSupplyDrop(game.ctx)!.altitude).toBeGreaterThan(DROP_HEIGHT - 5);
  expect(supplyDropPrompts(game.ctx)).toHaveLength(0);
  skip(game, FALL_SECONDS / 2);
  expect(nearestSupplyDrop(game.ctx)!.altitude).toBeCloseTo(DROP_HEIGHT / 2, -1);
  skip(game, FALL_SECONDS / 2);
  expect(nearestSupplyDrop(game.ctx)).toMatchObject({ tier: "white", landed: true, altitude: 0 });
  expect(supplyDropPrompts(game.ctx)).toHaveLength(1);

  // Level 1: the crate stays shut.
  expect(survivorLevel(game.ctx)).toBe(1);
  game.ui.tryInvoke("openCrate", {});
  tick(game, 0.1);
  expect(game.ctx.game.notices.list().at(-1)?.text).toBe("White crate: requires level 3");
  expect(supplyDropPrompts(game.ctx)).toHaveLength(1);

  // Level 3: everything in it comes out and the crate is gone.
  game.ui.tryInvoke("cheat", { xp: 25 });
  tick(game, 0.1);
  expect(survivorLevel(game.ctx)).toBe(3);
  const before = [BAG, HOTBAR].reduce((sum, id) => sum + game.ctx.player.inventory.state(id).slots.filter((slot) => slot !== null).length, 0);
  game.ui.tryInvoke("openCrate", {});
  tick(game, 0.1);
  const notice = game.ctx.game.notices.list().at(-1)!;
  expect(notice.tone).toBe("success");
  expect(notice.text.startsWith("White crate: ")).toBe(true);
  const first = /^White crate: (\d+) (.+?)(,|$)/.exec(notice.text)!;
  const label = first[2]!;
  const item = SUPPLY_TIERS[0]!.loot.find((entry) => itemDef(entry.item!)!.label === label)!.item!;
  expect(carried(game, item)).toBeGreaterThanOrEqual(Number(first[1]));
  const after = [BAG, HOTBAR].reduce((sum, id) => sum + game.ctx.player.inventory.state(id).slots.filter((slot) => slot !== null).length, 0);
  expect(after).toBeGreaterThan(before);
  expect(supplyDropPrompts(game.ctx)).toHaveLength(0);
  expect(supplyDrops(game.ctx).some((drop) => Math.hypot(drop.position[0] - site.at[0], drop.position[2] - site.at[2]) < 1)).toBe(false);
});

test("a red crate in the snow stays shut to a level 30 survivor", () => {
  const game = runner();
  tick(game, 0.1);
  const site = supplySites(game.ctx).find((entry) => entry.id.startsWith("drop_snow"))!;
  game.ui.tryInvoke("cheat", { teleport: [site.at[0] + 1.5, site.at[2]], xp: 4350 });
  tick(game, 0.1);
  game.ui.tryInvoke("cheat", { drop: "red" });
  skip(game, FALL_SECONDS + 1);
  expect(survivorLevel(game.ctx)).toBe(30);
  expect(supplyDropPrompts(game.ctx)).toHaveLength(1);
  game.ui.tryInvoke("openCrate", {});
  tick(game, 0.1);
  expect(game.ctx.game.notices.list().at(-1)?.text).toBe("Red crate: requires level 60");
  expect(nearestSupplyDrop(game.ctx)).toMatchObject({ tier: "red", landed: true });
});
