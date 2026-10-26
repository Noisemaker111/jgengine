import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import { onNewPlayer, systems } from "../loop";
import { time, world } from "../world";
import { baseBuilding } from "./base";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { biomeAt, climateAt } from "./climate";
import { content } from "./content";
import { itemTraits } from "./data/items";
import { survivorView } from "./survivor";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (climate test)",
    // The game shell hands the authored scene to the runtime; its weather schedule and snow zones live there.
    authoredDocument: editorLayers,
    time,
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop! });
}

const tick = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05);
};

/** Jump the world clock, weather schedule and all. */
const clock = (game: HeadlessRunner, seconds: number) => game.ui.tryInvoke("cheat", { clock: seconds });
const stand = (game: HeadlessRunner, x: number, z: number) => game.ui.tryInvoke("cheat", { teleport: [x, z] });
const here = (game: HeadlessRunner) => climateAt(game.ctx, game.ctx.scene.entity.get(game.userId)!.position);

const marker = (prefix: string) => markersOfKind(editorLayers, "creature_spawn").find((entry) => entry.id.startsWith(prefix))!.position;
const DAY = time.dayLength;
/** Seconds into the authored weather lap: clear at noon on day one, rain from 2400 s, a storm from 5000 s. */
const NOON = DAY / 2;
const MIDNIGHT = DAY;
const RAINING = 2500;

test("each spawn zone's biome is where ARK puts it, and open sea is coast", () => {
  const snow = marker("herd_snow_");
  const redwood = marker("herd_redwood_");
  expect(biomeAt(snow.x, snow.z)).toBe("snow");
  expect(biomeAt(redwood.x, redwood.z)).toBe("redwood");
  expect(biomeAt(9000, 9000)).toBe("coast");
});

test("the snow freezes a survivor at night while the beach stays warm, and night is colder than noon", () => {
  const game = runner();
  tick(game, 0.1);
  const beach = game.ctx.scene.entity.get(game.userId)!.position;
  clock(game, NOON);
  tick(game, 0.1);
  const beachNoon = survivorView(game.ctx).temperature;
  expect(beachNoon).toBeGreaterThan(24);
  expect(survivorView(game.ctx).comfort).not.toBe("cold");

  clock(game, MIDNIGHT);
  tick(game, 0.1);
  expect(survivorView(game.ctx).temperature).toBeLessThan(beachNoon - 6);

  const snow = marker("herd_snow_");
  stand(game, snow.x, snow.z);
  tick(game, 0.1);
  expect(here(game).biome).toBe("snow");
  expect(survivorView(game.ctx).temperature).toBeLessThan(0);
  expect(survivorView(game.ctx).comfort).toBe("freezing");
  const health = game.ctx.scene.entity.stats.get(game.userId, "health")!.current;
  tick(game, 5);
  expect(game.ctx.scene.entity.stats.get(game.userId, "health")!.current).toBeLessThan(health);

  stand(game, beach[0], beach[2]);
  tick(game, 0.1);
  expect(survivorView(game.ctx).temperature).toBeGreaterThan(10);
});

test("the same storm falls as rain on the beach and as snow on the peaks, and rain soaks and chills", () => {
  const game = runner();
  tick(game, 0.1);
  clock(game, NOON);
  tick(game, 0.1);
  const dry = here(game);
  expect(dry.weather).toBe("clear");
  expect(dry.wet).toBe(false);

  clock(game, RAINING);
  tick(game, 0.1);
  const rain = here(game);
  expect(rain.weather).toBe("rain");
  expect(rain.precipitation).toBeGreaterThan(0.2);
  expect(rain.wet).toBe(true);
  expect(survivorView(game.ctx).weather).toBe("rain");

  const snow = marker("herd_snow_");
  stand(game, snow.x, snow.z);
  tick(game, 0.1);
  const peak = here(game);
  expect(peak.weather).toBe("snow");
  expect(peak.precipitation).toBeCloseTo(rain.precipitation, 2);
});

/** Put an item in hotbar slot 1, hold it and place it ahead. */
function build(game: HeadlessRunner, itemId: string): void {
  game.ctx.player.inventory.put(HOTBAR, itemId, 1);
  game.ctx.item.use.use({ from: game.userId, itemId, inventoryId: HOTBAR });
  tick(game, 0.1);
  game.ui.tryInvoke("fire", { yaw: game.ctx.scene.entity.get(game.userId)!.rotationY });
  tick(game, 0.3);
}

test("a thatch roof keeps the rain off, and a campfire warms whoever stands by it", () => {
  const game = runner();
  tick(game, 0.1);
  clock(game, RAINING);
  tick(game, 0.1);
  const open = here(game);
  expect(open.wet).toBe(true);
  expect(open.covered).toBe(false);

  // A foundation, a wall and the roof the wall holds up, then stand on the floor under it.
  build(game, "thatch_foundation");
  build(game, "thatch_wall");
  build(game, "thatch_ceiling");
  const roof = baseBuilding(game.ctx).list().find((piece) => piece.pieceId === "thatch_ceiling")!;
  const floor = baseBuilding(game.ctx).list().find((piece) => piece.pieceId === "thatch_foundation")!;
  game.ctx.scene.entity.setPose(game.userId, { position: [roof.position[0], floor.position[1] + 0.2, roof.position[2]] });
  tick(game, 0.1);
  const under = here(game);
  expect(under.covered).toBe(true);
  expect(under.wet).toBe(false);
  // Out of the rain's 4 degrees of chill.
  expect(under.temperature).toBeGreaterThan(open.temperature + 3);
  expect(survivorView(game.ctx).sheltered).toBe(true);

  build(game, "campfire");
  tick(game, 0.1);
  expect(here(game).temperature).toBeGreaterThan(under.temperature + 5);
});
