import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

// The joint: damage goes through ctx.scene.entity.effect, never a raw stats.delta.
// The catalog `receive` map names the pools an effect drains, in order (put "shield"
// before "health" for shield-then-health). Draining the last pool runs the death
// pipeline: despawn, the `entity.died` event, and the catalog's `onDeath` drops.
// An effect with no `receive` rule is ignored — check with ctx.scene.entity.canReceive.
const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId !== "goblin") return null;
    return {
      role: "enemy",
      stats: { health: { max: 30 } },
      receive: { damage: { order: ["health"] } },
    };
  },
};

const combat = defineSystem({
  id: "combat",
  create(ctx) {
    ctx.game.commands.define<{ target: string; amount: number }>("attack", {
      apply(state, { target, amount }) {
        state.scene.entity.effect({ from: state.player.userId, to: target, effect: "damage", via: { amount } });
      },
    });
  },
});

export const game = defineGame({ name: "Combat", content, systems: [combat] });
// Mount: <GameHost playable={game} />  ·  fire: ctx.game.commands.run("attack", { target: goblinId, amount: 12 })
// Data-defined hit math (channels, resistances): resolveDamageHit from @jgengine/core/combat/damageResolution,
// then pass its `impact` as `via.amount`.
