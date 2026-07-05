import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import type {
  GameRuntimeFeeds,
  GameRuntimePlayerView,
  GameRuntimeServerView,
  GameRuntimeTransport,
} from "@jgengine/core/runtime/transport";
import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";

export type ConvexGameTransportConfig = {
  gameId: string;
};

export type ConvexGameApi = {
  runtime: {
    joinServer: FunctionReference<
      "mutation",
      "public",
      { gameId: string; serverId?: string; slotsPerServer?: number; save?: unknown; mode?: string },
      { serverId: string; isNew: boolean }
    >;
    leaveServer: FunctionReference<"mutation", "public", { serverId: string }, null>;
    runCommand: FunctionReference<
      "mutation",
      "public",
      { serverId: string; command: string; input: unknown },
      { ok: true } | { ok: false; reason: string }
    >;
    getServer: FunctionReference<"query", "public", { serverId: string }, unknown>;
    getPlayerProfile: FunctionReference<"query", "public", { gameId: string }, unknown>;
    getFeed: FunctionReference<"query", "public", { serverId: string; action: string }, unknown[]>;
  };
  leaderboard: {
    getTop: FunctionReference<
      "query",
      "public",
      { gameId: string; stat: string; scope: LeaderboardScope; serverId?: string; limit?: number },
      { userId: string; value: number }[]
    >;
    getProfile: FunctionReference<
      "query",
      "public",
      { gameId: string; userId: string },
      Record<string, number>
    >;
  };
};

export function createConvexGameTransport(
  client: ConvexReactClient,
  api: ConvexGameApi,
  config: ConvexGameTransportConfig,
): GameRuntimeTransport {
  return {
    async joinServer(args) {
      const result = await client.mutation(api.runtime.joinServer, {
        gameId: config.gameId,
        serverId: args.serverId,
      });
      return result;
    },

    async leaveServer(args) {
      await client.mutation(api.runtime.leaveServer, args);
    },

    async runCommand(args) {
      return await client.mutation(api.runtime.runCommand, args);
    },
  };
}

type ServerQueryResult = {
  _id: string;
  gameId: string;
  memberUserIds: string[];
  revision: number;
  serverState: unknown;
  updatedAt: number;
} | null;

type PlayerProfileQueryResult = {
  userId: string;
  gameId: string;
  playerState: unknown;
  updatedAt: number;
} | null;

function watchConvexQuery<TResult, TView>(
  client: ConvexReactClient,
  query: FunctionReference<"query", "public", Record<string, unknown>, TResult>,
  args: Record<string, unknown>,
  toView: (result: TResult) => TView,
  onChange: (view: TView) => void,
): () => void {
  const watch = client.watchQuery(query, args);
  const emit = () => {
    const result = watch.localQueryResult();
    if (result !== undefined) onChange(toView(result));
  };
  const unsubscribe = watch.onUpdate(emit);
  emit();
  return unsubscribe;
}

export function createConvexGameFeeds(
  client: ConvexReactClient,
  api: ConvexGameApi,
  config: ConvexGameTransportConfig,
): GameRuntimeFeeds {
  return {
    subscribeServer(serverId, onChange) {
      return watchConvexQuery(
        client,
        api.runtime.getServer as FunctionReference<"query", "public", Record<string, unknown>, ServerQueryResult>,
        { serverId },
        (result): GameRuntimeServerView | null =>
          result === null
            ? null
            : {
                serverId: result._id,
                gameId: result.gameId,
                revision: result.revision,
                memberUserIds: result.memberUserIds,
                serverState: result.serverState,
                updatedAt: result.updatedAt,
              },
        onChange,
      );
    },

    subscribePlayer(args, onChange) {
      void args;
      return watchConvexQuery(
        client,
        api.runtime.getPlayerProfile as FunctionReference<
          "query",
          "public",
          Record<string, unknown>,
          PlayerProfileQueryResult
        >,
        { gameId: config.gameId },
        (result): GameRuntimePlayerView | null =>
          result === null
            ? null
            : {
                userId: result.userId,
                gameId: result.gameId,
                playerState: result.playerState,
                updatedAt: result.updatedAt,
              },
        onChange,
      );
    },

    subscribeFeed(args, onChange) {
      return watchConvexQuery(
        client,
        api.runtime.getFeed as FunctionReference<"query", "public", Record<string, unknown>, unknown[]>,
        args,
        (entries) => ({ action: args.action, entries }),
        onChange,
      );
    },
  };
}

export function createConvexLeaderboardReads(api: ConvexGameApi, config: ConvexGameTransportConfig) {
  return {
    getTop(args: { stat: string; scope: LeaderboardScope; serverId?: string; limit?: number }) {
      return { query: api.leaderboard.getTop, args: { gameId: config.gameId, ...args } };
    },

    getProfile(userId: string) {
      return { query: api.leaderboard.getProfile, args: { gameId: config.gameId, userId } };
    },
  };
}
