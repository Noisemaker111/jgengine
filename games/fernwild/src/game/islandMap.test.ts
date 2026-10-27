import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { content } from "./content";
import { itemTraits } from "./data/items";
import { NOTES } from "./data/notes";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { islandBake, islandMarks } from "./islandMap";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (map test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true });
}

test("the map marks every unread note, the three obelisks and the eight cave mouths", () => {
  const game = runner();
  game.step(0.05);
  const marks = islandMarks(game.ctx);
  const of = (kind: string) => marks.filter((mark) => mark.kind === kind).length;
  expect(of("note")).toBe(NOTES.length);
  expect(of("obelisk")).toBe(3);
  expect(of("cave")).toBe(8);
});

test("the map's ground is baked from the island: a PNG spanning the whole square, sea and land", () => {
  const game = runner();
  const bake = islandBake(game.ctx);
  expect(bake.background.startsWith("data:image/png;base64,")).toBe(true);
  expect(bake.mapBounds).toEqual({ minX: -1650, minZ: -1650, maxX: 1650, maxZ: 1650 });
  // The corners are open sea and the start beach is land, so the bake reads the real ground.
  expect(game.ctx.world.groundHeightAt(-1600, -1600)).toBeLessThan(0);
  const me = game.ctx.scene.entity.get(game.ctx.player.userId)!;
  expect(game.ctx.world.groundHeightAt(me.position[0], me.position[2])).toBeGreaterThan(0);
});
