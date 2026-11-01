import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { content } from "./content";
import { itemDef, itemTraits } from "./data/items";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { caveAt, cavesOf, cavesView } from "./caves";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (caves test)",
    multiplayer: "off",
    // The hour this test skips is stepped as whole frames, not 60 Hz steps.
    simulation: { hz: "variable" },
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  // Long steps are allowed so the half-hour respawn wait can be skipped through; walking still steps 0.05 s.
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true, maxStepSeconds: 5 });
}

const tick = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05);
};

test("the Island's eight caves each run into dry land and guard an artifact that is a real item", () => {
  const game = runner();
  tick(game, 0.1);
  const caves = cavesOf(game.ctx);
  expect(caves.length).toBe(8);
  for (const cave of caves) {
    expect(itemDef(cave.artifact)?.kind).toBe("resource");
    const [x, z] = cave.layout.chamber.center;
    // The chamber floor is above the sea, so nobody swims to an artifact.
    expect(game.ctx.world.groundHeightAt(x, z)).toBeGreaterThan(0.5);
    expect(caveAt(game.ctx, x, z)?.cave.id).toBe(cave.id);
  }
  expect(cavesView(game.ctx).caves.every((cave) => cave.artifact !== null)).toBe(true);
});

test("walk down a cave into its chamber, take the artifact, and it is back on the pedestal half an hour later", () => {
  const game = runner();
  tick(game, 0.1);
  const cave = cavesOf(game.ctx).find((entry) => entry.id === "cave_lower_south_cave")!;
  game.ui.tryInvoke("cheat", { goto: { cave: cave.id, back: 2 } });
  tick(game, 0.1);
  const me = () => game.ctx.scene.entity.get(game.userId)!;
  expect(caveAt(game.ctx, me().position[0], me().position[2])).toBeNull();
  // Walk the tunnel's centreline, then into the chamber's middle, through the world's own collision.
  const route = [...cave.layout.path, cave.layout.chamber.center];
  for (const [x, z] of route) {
    for (let step = 0; step < 200; step += 1) {
      const at = me().position;
      const dx = x - at[0];
      const dz = z - at[2];
      if (Math.hypot(dx, dz) < 0.6) break;
      game.aim({ heading: Math.atan2(dx, dz) });
      game.step(0.05, { held: ["moveForward"] });
    }
  }
  const depth = caveAt(game.ctx, me().position[0], me().position[2])?.depth ?? -1;
  expect(depth).toBeGreaterThan(20);
  game.ui.tryInvoke("takeArtifact", {});
  tick(game, 0.1);
  expect(game.ctx.player.inventory.count(BAG, cave.artifact)).toBe(1);
  expect(cavesView(game.ctx).caves.find((entry) => entry.id === cave.id)?.artifact).toBeNull();
  // Taking again from an empty pedestal gives nothing.
  game.ui.tryInvoke("takeArtifact", {});
  tick(game, 0.1);
  expect(game.ctx.player.inventory.count(BAG, cave.artifact)).toBe(1);
  // Half an hour standing still, in big steps.
  for (let t = 0; t < 1801; t += 5) game.step(5);
  expect(cavesView(game.ctx).caves.find((entry) => entry.id === cave.id)?.artifact).toBe(cave.artifact);
});

test("walking up to a cave wakes its dwellers in the chamber, and they keep to the cave", () => {
  const game = runner();
  tick(game, 0.1);
  const cave = cavesOf(game.ctx).find((entry) => entry.id === "cave_lower_south_cave")!;
  // A hundred metres off: far enough that the herd fills before the survivor can see it.
  game.ui.tryInvoke("cheat", { goto: { cave: cave.id, back: 100 } });
  const inside = () =>
    game.ctx.scene.entity
      .list()
      .filter((entity) => entity.id !== game.userId && caveAt(game.ctx, entity.position[0], entity.position[2])?.cave.id === cave.id);
  tick(game, 5);
  expect(inside().length).toBe(3);
  tick(game, 30);
  expect(inside().length).toBe(3);
});
