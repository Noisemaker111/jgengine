import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { editorLayers } from "../editorLayers";
import { onNewPlayer, survivorStart, systems } from "../loop";
import { time, world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { content } from "./content";
import { setStorm, slayCreature, stormView } from "./creatures";
import { ROOT_SERVER } from "./data/rootServer";
import { itemTraits } from "./data/items";
import { rootServerChamber, rootServerView } from "./rootServer";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Wildwire (Root Server test)",
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

test("the Root Server sleeps at the bottom of the lava cave, boots when the technician walks in, and spins up its firewall", () => {
  const game = runner();
  tick(game, 0.1);
  const chamber = rootServerChamber(game.ctx);
  expect(chamber).not.toBeNull();
  expect(rootServerView(game.ctx).awake).toBe(false);
  game.ui.tryInvoke("cheat", { teleport: [chamber![0] + 13, chamber![1], 0] });
  tick(game, 1);
  expect(rootServerView(game.ctx).awake).toBe(true);
  // The first firewall spin-up comes on the phase's timer.
  tick(game, ROOT_SERVER.phases[0].firewallEvery + 1);
  expect(rootServerView(game.ctx).firewall).toBeGreaterThan(0);
});

test("destroying the Root Server ends the Signal Storms for good and pays out Element", () => {
  const game = runner();
  tick(game, 0.1);
  const chamber = rootServerChamber(game.ctx)!;
  game.ui.tryInvoke("cheat", { teleport: [chamber[0] + 4, chamber[1], 0] });
  tick(game, 1);
  setStorm(game.ctx, true);
  expect(stormView(game.ctx).storm).toBe(true);
  const server = game.ctx.scene.entity.list().find((entity) => entity.name === ROOT_SERVER.species);
  expect(server).toBeDefined();
  const before = game.ctx.player.inventory.count(BAG, "element");
  slayCreature(game.ctx, server!.id);
  tick(game, 1);
  expect(rootServerView(game.ctx).defeated).toBe(true);
  expect(stormView(game.ctx)).toEqual({ storm: false, ended: true });
  expect(game.ctx.player.inventory.count(BAG, "element") - before).toBe(ROOT_SERVER.rewards["element"]);
  // Storms never come back once it is down.
  expect(setStorm(game.ctx, true)).toEqual([]);
  expect(stormView(game.ctx).storm).toBe(false);
});
