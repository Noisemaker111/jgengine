import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

// The joint: register the table on ctx.game.loot (rolled with the world's seeded
// ctx.rng, so a host and its replicas roll the same drops) and point the enemy's
// catalog `onDeath` at it. A kill through ctx.scene.entity.effect rolls the table and
// grants the drops to the killer's bag. For drops on the ground: `recipe world-drops`.
const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId !== "goblin") return null;
    return {
      role: "enemy",
      stats: { health: { max: 30 } },
      receive: { damage: { order: ["health"] } },
      onDeath: { drops: [{ table: "goblin" }] },
    };
  },
};

const loot = defineSystem({
  id: "loot",
  create(ctx) {
    ctx.game.loot.register({
      id: "goblin",
      entries: [
        { item: "coin", count: [3, 8], weight: 70 },
        { item: "dagger", count: 1, weight: 25 },
        { item: "ruby", count: 1, weight: 5 },
      ],
    });
  },
});

export const game = defineGame({ name: "Loot", content, inventories: { bag: { slots: 20 } }, systems: [loot] });
// A chest or quest reward: ctx.game.loot.grantToPlayer(userId, ctx.game.loot.roll("goblin"), "chest")
// Listen: ctx.game.events.on("loot.granted", ({ userId, drops }) => ...)
