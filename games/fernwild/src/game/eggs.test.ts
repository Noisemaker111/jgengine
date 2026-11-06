import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { editorLayers } from "../editorLayers";
import { onNewPlayer, survivorStart, systems } from "../loop";
import { time, world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { content } from "./content";
import { recipeDef } from "./data/engrams";
import { itemDef, itemTraits } from "./data/items";
import { EGG_LAY_SECONDS, EGG_SIZES, eggItem, KIBBLE_TIERS, kibbleItem } from "./data/kibble";
import { SPECIES } from "./data/species";
import { eggsOnGround, eggsSave, layerEgg, takeEgg } from "./eggs";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (eggs test)",
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

/** Jump the clock and let the systems catch up. */
const skip = (game: HeadlessRunner, seconds: number) => {
  game.ui.tryInvoke("cheat", { clock: game.ctx.time.now() + seconds });
  tick(game, 1.1);
};

const near = (game: HeadlessRunner, radius: number) => {
  const me = game.ctx.scene.entity.get(game.ctx.player.userId)!;
  return eggsOnGround(game.ctx).filter((egg) => Math.hypot(egg.at[0] - me.position[0], egg.at[2] - me.position[2]) <= radius);
};

test("egg-laying species lay eggs sized to their bodies; mammals lay none", () => {
  expect(layerEgg("dodo", SPECIES.dodo!.radius)).toBe("egg_xs");
  expect(layerEgg("raptor", SPECIES.raptor!.radius)).toBe("egg_s");
  expect(layerEgg("phiomia", SPECIES.phiomia!.radius)).toBeNull();
  for (const size of EGG_SIZES) expect(itemDef(eggItem(size))).not.toBeNull();
});

test("every tameable species eats its kibble tier and up before anything else, and lower tiers last", () => {
  for (const def of Object.values(SPECIES)) {
    if (def.kibble === null) continue;
    const foods = Object.keys(def.taming.foods);
    const at = KIBBLE_TIERS.indexOf(def.kibble);
    expect(foods.slice(0, KIBBLE_TIERS.length - at)).toEqual(KIBBLE_TIERS.slice(at).map(kibbleItem));
    expect(foods.slice(foods.length - at)).toEqual(KIBBLE_TIERS.slice(0, at).reverse().map(kibbleItem));
  }
  expect(SPECIES.raptor!.kibble).toBe("simple");
  expect(SPECIES.rex!.kibble).toBe("exceptional");
  // Each tier cooks in the pot from an egg of its size.
  KIBBLE_TIERS.forEach((tier, index) => {
    const recipe = recipeDef(`cook_${kibbleItem(tier)}`)!;
    expect(recipe.station).toBe("cooking_pot");
    expect(recipe.inputs[0]!.itemId).toBe(eggItem(EGG_SIZES[index]!));
  });
});

test("a wild female dodo lays eggs beside her, a couple at most, and E takes one into the bag", () => {
  const game = runner();
  tick(game, 0.2);
  game.ui.tryInvoke("cheat", { destroyWild: true });
  game.ui.tryInvoke("cheat", { summon: { species: "dodo", level: 5, distance: 1.5, sex: "female" } });
  game.ui.tryInvoke("cheat", { summon: { species: "phiomia", level: 5, distance: 6, side: 6, sex: "female" } });
  tick(game, 1.1);
  expect(near(game, 20)).toHaveLength(0);
  for (let n = 0; n < 8; n += 1) skip(game, EGG_LAY_SECONDS * 1.6);
  const laid = near(game, 20);
  // Only the dodo lays, and she stops at two lying near her.
  expect(laid.length).toBeGreaterThanOrEqual(1);
  expect(laid.length).toBeLessThanOrEqual(2);
  expect(laid.every((egg) => egg.item === "egg_xs")).toBe(true);

  // Saved and restored, the eggs are still there.
  const save = eggsSave(game.ctx);
  const snap = JSON.parse(JSON.stringify(save.snapshot()));
  save.hydrate(snap);
  expect(near(game, 20)).toHaveLength(laid.length);

  const egg = laid[0]!;
  game.ui.tryInvoke("cheat", { teleport: [egg.at[0], egg.at[2]] });
  tick(game, 0.2);
  takeEgg(game.ctx);
  expect(game.ctx.player.inventory.count(BAG, "egg_xs")).toBe(1);
  expect(near(game, 20)).toHaveLength(laid.length - 1);
});
