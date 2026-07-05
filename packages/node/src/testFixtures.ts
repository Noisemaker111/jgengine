import { createGameRuntime, type GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { LEADERBOARD_PENDING_KEY } from "@jgengine/core/runtime/hostPersistence";
import { markPlayerDirty, markServerDirty, type GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";

type GoldGrantInput = { userId: string; amount: number };

function isGoldGrantInput(input: unknown): input is GoldGrantInput {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as GoldGrantInput).userId === "string" &&
    typeof (input as GoldGrantInput).amount === "number"
  );
}

export function createTestRuntime(gameId = "test-game"): GameRuntime {
  return createGameRuntime({
    gameId,
    save: { auto: "5ms", scope: "player+chunks" },
    commands: {
      "gold.grant": {
        validate: (_snapshot: GameRuntimeSnapshot, input: unknown) =>
          isGoldGrantInput(input) ? null : { reason: "userId and amount required" },
        apply: (snapshot: GameRuntimeSnapshot, input: unknown) => {
          const { userId, amount } = input as GoldGrantInput;
          const player = snapshot.players[userId];
          if (!player) return snapshot;
          const pending = (snapshot.server.session[LEADERBOARD_PENDING_KEY] as unknown[]) ?? [];
          const next: GameRuntimeSnapshot = {
            ...snapshot,
            players: {
              ...snapshot.players,
              [userId]: {
                ...player,
                economy: { ...player.economy, gold: (player.economy.gold ?? 0) + amount },
              },
            },
            server: {
              ...snapshot.server,
              session: {
                ...snapshot.server.session,
                [LEADERBOARD_PENDING_KEY]: [
                  ...pending,
                  { userId, stat: "gold", scope: "profile", by: amount },
                ],
              },
            },
          };
          return markPlayerDirty(next, userId);
        },
      },
    },
    loop: {
      onTick: (ctx, dtSeconds) => {
        const uptime = (ctx.snapshot.server.session.uptime as number | undefined) ?? 0;
        ctx.setSnapshot(
          markServerDirty({
            ...ctx.snapshot,
            server: {
              ...ctx.snapshot.server,
              session: { ...ctx.snapshot.server.session, uptime: uptime + dtSeconds },
            },
          }),
        );
      },
    },
  });
}
