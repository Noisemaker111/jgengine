import { defineGameDefinition } from "@jgengine/core/game/defineGameDefinition";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import { createHostedGameServerFunctions } from "@jgengine/convex/hostedServer";

const content: GameContextContent = {
  entityById: (catalogId) => (catalogId === "hero" ? { stats: { health: { max: 10 } } } : null),
};

const definition = defineGameDefinition({
  name: "Hosted Demo",
  multiplayer: "off",
  features: { players: true },
  loop: {
    onNewPlayer(ctx: GameContext, player) {
      ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
    },
    onTick(ctx: GameContext, dt) {
      for (const player of ctx.game.players?.list() ?? []) {
        const hero = ctx.scene.entity.get(player.userId);
        if (!hero) continue;
        const forward = player.input?.held.includes("moveForward") ? 4 : 0;
        ctx.scene.entity.setPose(player.userId, {
          position: [hero.position[0] + dt * forward, 0, hero.position[2]],
        });
      }
    },
    onPlayerLeave(ctx: GameContext, player) {
      ctx.scene.entity.despawn(player.userId);
    },
  },
});

export const {
  getHostedServer,
  joinHostedServer,
  leaveHostedServer,
  runHostedCommand,
  submitHostedInput,
  tickHostedWorlds,
} = createHostedGameServerFunctions({
  games: { "hosted-demo": { definition, content } },
  auth: "anonymous",
});
