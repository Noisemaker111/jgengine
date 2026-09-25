import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

// The joint: catalog `onDeath` with dropMode "world" scatters a kill's drops on the
// ground as world items; `worldItem.rarityStyle` gives each rarity a beam, color and
// label; item `rarity` comes from the item catalog. Pick up with a click
// (`pointer.grabWorldItems`), by walking over (`worldItem.autoPickup`), or on a key
// through ctx.scene.worldItem as the "loot" command below does.
const content: GameContextContent = {
  itemById(itemId) {
    if (itemId === "rusty-sword") return { rarity: "common" };
    if (itemId === "sunblade") return { rarity: "legendary" };
    return null;
  },
  entityById(catalogId) {
    if (catalogId !== "bandit") return null;
    return {
      role: "enemy",
      stats: { health: { max: 40 } },
      receive: { damage: { order: ["health"] } },
      onDeath: { drops: [{ table: "bandit" }], dropMode: "world" },
    };
  },
};

const looting = defineSystem({
  id: "looting",
  create(ctx) {
    ctx.game.loot.register({
      id: "bandit",
      entries: [
        { item: "rusty-sword", count: 1, weight: 90 },
        { item: "sunblade", count: 1, weight: 10 },
      ],
    });
    ctx.game.commands.define("loot", {
      apply(state) {
        const me = state.scene.entity.get(state.player.userId);
        if (me === null) return;
        const nearest = state.scene.worldItem.nearestInRadius(me.position, 2.5);
        if (nearest !== null) state.scene.worldItem.pickup(nearest, state.player.userId);
      },
    });
  },
});

export const game = defineGame({
  name: "Drops",
  content,
  inventories: { bag: { slots: 20 } },
  input: { loot: ["KeyE"] },
  pointer: { grabWorldItems: true },
  worldItem: {
    rarityStyle: {
      common: { color: "#d0d0d0", label: "Common" },
      legendary: { color: "#ff9a1f", beam: true, label: "Legendary" },
    },
    beamHeight: 4,
  },
  systems: [looting],
});
// Pressing E runs the same-named "loot" command. Bag contents: ctx.player.inventory.count("bag", "sunblade").
