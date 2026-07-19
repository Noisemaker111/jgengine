import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { resolveDamageHit } from "@jgengine/core/combat/damageResolution";

// The joint: a gameplay command resolves a data-defined hit, then drains the target's
// health pool through the entity-stats API. Damage math is an engine primitive; the
// system just registers the command and folds the result back into world state.
const combat = defineSystem({
  id: "combat",
  create(ctx) {
    ctx.game.commands.define<{ target: string; impact: number }>("attack", {
      apply(state, { target, impact }) {
        const hit = resolveDamageHit({ channel: "physical", impact, target });
        state.scene.entity.stats.delta(target, "health", -hit.impact);
      },
    });
  },
});

export const game = defineGame({ name: "Combat", systems: [combat] });
// Mount: <GameHost playable={game} />  ·  fire: ctx.game.commands.run("attack", { target: "goblin", impact: 12 })
