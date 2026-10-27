import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { content } from "./content";
import { itemTraits } from "./data/items";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { bodies, BODY_LASTS, bodyView } from "./deathBody";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (death test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  // Long steps are allowed so the body's hour can be skipped through; everything else steps 0.05 s.
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true, maxStepSeconds: 5 });
}

const tick = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05);
};

/** Every stack carried, item → count, bag and hotbar together. */
function carried(game: HeadlessRunner): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of [BAG, HOTBAR]) {
    for (const slot of game.ctx.player.inventory.state(id).slots) if (slot !== null) out[slot.itemId] = (out[slot.itemId] ?? 0) + slot.count;
  }
  return out;
}

const me = (game: HeadlessRunner) => game.ctx.scene.entity.get(game.userId)!;

test("killed by a raptor far from the beach, the survivor wakes there empty-handed, walks back and takes everything back", () => {
  const game = runner();
  tick(game, 0.1);
  game.ui.tryInvoke("cheat", { give: { stone: 20, wood: 12, stone_pick: 1 }, toHotbar: ["stone_pick"] });
  tick(game, 0.1);
  const before = carried(game);
  expect(before.stone).toBe(20);
  expect(before.stone_pick).toBe(1);
  // On the hillside below the lower south cave, a long way from the beach, with a strong raptor beside.
  game.ui.tryInvoke("cheat", { goto: { cave: "cave_lower_south_cave", back: 30 } });
  tick(game, 0.1);
  const fell = [...me(game).position];
  expect(game.ctx.world.groundHeightAt(fell[0]!, fell[2]!)).toBeGreaterThan(0.5);
  game.ui.tryInvoke("cheat", { summon: { species: "raptor", level: 120, distance: 3 } });
  for (let t = 0; t < 120 && bodies(game.ctx).length === 0; t += 0.05) game.step(0.05);
  expect(bodies(game.ctx)).toHaveLength(1);

  // Awake on the beach with nothing, full health, the body where they fell holding all of it.
  tick(game, 0.1);
  expect(carried(game)).toEqual({});
  const body = bodies(game.ctx)[0]!;
  expect(Math.hypot(body.at[0] - fell[0]!, body.at[2] - fell[2]!)).toBeLessThan(15);
  expect(Object.fromEntries(body.contents.map((stack) => [stack.item, stack.count]))).toEqual(before);
  expect(bodyView(game.ctx)!.distance).toBeGreaterThan(100);
  const health = game.ctx.scene.entity.stats.get(game.userId, "health")!;
  expect(health.current).toBe(health.max);

  // E from far off does nothing.
  game.ui.tryInvoke("recoverBody", {});
  tick(game, 0.1);
  expect(bodies(game.ctx)).toHaveLength(1);

  // Back at the body (the wild cleared off first, ARK's DestroyWildDinos), E takes everything back.
  game.ui.tryInvoke("cheat", { destroyWild: true });
  tick(game, 0.1);
  expect(game.ctx.scene.entity.list().some((entity) => entity.id.startsWith("raptor_"))).toBe(false);
  game.ctx.scene.entity.setPose(game.userId, { position: [body.at[0] + 1, body.at[1], body.at[2]] });
  tick(game, 0.1);
  game.ui.tryInvoke("recoverBody", {});
  tick(game, 0.1);
  expect(carried(game)).toEqual(before);
  expect(bodies(game.ctx)).toHaveLength(0);
  expect(bodyView(game.ctx)).toBeNull();
});

test("a body left lying for an hour falls apart, and what it held is lost", () => {
  const game = runner();
  tick(game, 0.1);
  game.ui.tryInvoke("cheat", { give: { stone: 5 } });
  game.ui.tryInvoke("cheat", { kill: true });
  tick(game, 0.2);
  expect(bodies(game.ctx)).toHaveLength(1);
  expect(bodyView(game.ctx)!.secondsLeft).toBeGreaterThan(BODY_LASTS - 5);
  for (let t = 0; t < BODY_LASTS - 60; t += 5) game.step(5);
  expect(bodies(game.ctx)).toHaveLength(1);
  for (let t = 0; t < 120; t += 5) game.step(5);
  expect(bodies(game.ctx)).toHaveLength(0);
  expect(carried(game).stone ?? 0).toBe(0);
});

test("a body and what it holds are kept in the save", () => {
  const game = runner();
  tick(game, 0.1);
  game.ui.tryInvoke("cheat", { give: { wood: 7 } });
  game.ui.tryInvoke("cheat", { kill: true });
  tick(game, 0.2);
  // The game's save: what a hosted world writes to disk and loads back.
  const saved = game.ctx.state();
  const other = runner();
  tick(other, 0.1);
  other.ctx.restore(saved);
  expect(bodies(other.ctx).map((body) => body.contents)).toEqual([[{ item: "wood", count: 7 }]]);
});
