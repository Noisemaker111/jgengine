import type { ConvexReactClient } from "convex/react";
import { anyApi } from "convex/server";
import type { DefaultFunctionArgs, FunctionReference } from "convex/server";
import type {
  GameRuntimeFeeds,
  GameRuntimePlayerView,
  GameRuntimeServerView,
  GameRuntimeTransport,
  PresencePoseRow,
  PresenceSync,
} from "@jgengine/core/runtime/transport";
import type { ChatMessage } from "@jgengine/core/game/chat";
import type { ChatSendOutcome, ChatSync } from "@jgengine/core/multiplayer/chatContract";
import { createPoseSyncGate, type PoseSyncTuning } from "@jgengine/core/multiplayer/poseSyncGate";
import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";

export type ConvexGameTransportConfig = {
  gameId: string;
  userId?: string;
};

export type ConvexGameApi = {
  runtime: {
    joinServer: FunctionReference<
      "mutation",
      "public",
      {
        gameId: string;
        serverId?: string;
        slotsPerServer?: number;
        save?: unknown;
        mode?: string;
        externalId?: string;
      },
      { serverId: string; isNew: boolean }
    >;
    leaveServer: FunctionReference<"mutation", "public", { serverId: string; externalId?: string }, null>;
    runCommand: FunctionReference<
      "mutation",
      "public",
      { serverId: string; command: string; input: unknown; externalId?: string },
      { ok: true } | { ok: false; reason: string }
    >;
    pushFeedEntry: FunctionReference<
      "mutation",
      "public",
      { serverId: string; action: string; entry: unknown; externalId?: string },
      null
    >;
    getServer: FunctionReference<"query", "public", { serverId: string; externalId?: string }, unknown>;
    getPlayerProfile: FunctionReference<"query", "public", { gameId: string; externalId?: string }, unknown>;
    getFeed: FunctionReference<
      "query",
      "public",
      { serverId: string; action: string; externalId?: string },
      unknown[]
    >;
  };
  presence: {
    list: FunctionReference<"query", "public", { serverId: string }, PresencePoseRow[]>;
    sync: FunctionReference<
      "mutation",
      "public",
      {
        serverId: string;
        pose: { x: number; y: number; z: number; rotationY: number; rotationPitch: number };
        externalId?: string;
      },
      null
    >;
    leave: FunctionReference<"mutation", "public", { serverId: string; externalId?: string }, null>;
  };
  chat: {
    messages: FunctionReference<
      "query",
      "public",
      { serverId: string; channelId: string; externalId?: string },
      ChatMessage[]
    >;
    sendMessage: FunctionReference<
      "mutation",
      "public",
      { serverId: string; channelId: string; body: string; externalId?: string },
      ChatSendOutcome
    >;
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

export function defaultConvexGameApi(): ConvexGameApi {
  return anyApi as unknown as ConvexGameApi;
}

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
        externalId: config.userId,
      });
      return result;
    },

    async leaveServer(args) {
      await client.mutation(api.runtime.leaveServer, { ...args, externalId: config.userId });
    },

    async runCommand(args) {
      return await client.mutation(api.runtime.runCommand, { ...args, externalId: config.userId });
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

export function watchConvexQuery<TArgs extends DefaultFunctionArgs, TResult, TView>(
  client: ConvexReactClient,
  query: FunctionReference<"query", "public", TArgs, TResult>,
  args: TArgs,
  toView: (result: TResult) => TView,
  onChange: (view: TView) => void,
): () => void {
  const watch = client.watchQuery(query, args as never);
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
        api.runtime.getServer as FunctionReference<
          "query",
          "public",
          { serverId: string; externalId?: string },
          ServerQueryResult
        >,
        { serverId, externalId: config.userId },
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
          { gameId: string; externalId?: string },
          PlayerProfileQueryResult
        >,
        { gameId: config.gameId, externalId: config.userId },
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
        api.runtime.getFeed,
        { ...args, externalId: config.userId },
        (entries) => ({ action: args.action, entries }),
        onChange,
      );
    },
  };
}

const DEFAULT_CONVEX_POSE_TUNING: PoseSyncTuning = {
  minIntervalMs: 200,
  heartbeatMs: 5_000,
  positionEpsilon: 0.01,
  verticalEpsilon: 0.01,
  rotationEpsilon: 0.01,
};

export function createConvexPresenceSync(
  client: ConvexReactClient,
  api: ConvexGameApi,
  config: ConvexGameTransportConfig,
  tuning?: PoseSyncTuning,
): PresenceSync {
  const gate = createPoseSyncGate(tuning ?? DEFAULT_CONVEX_POSE_TUNING);
  return {
    subscribe(serverId, onChange) {
      return watchConvexQuery(client, api.presence.list, { serverId }, (rows) => rows, onChange);
    },

    syncPose(serverId, pose) {
      if (!gate.evaluate(pose, Date.now())) return;
      void client
        .mutation(api.presence.sync, { serverId, pose, externalId: config.userId })
        .catch(() => undefined);
    },
  };
}

export function createConvexChatSync(
  client: ConvexReactClient,
  api: ConvexGameApi,
  config: ConvexGameTransportConfig,
  serverId: string,
): ChatSync {
  return {
    subscribe(channelId, onChange) {
      return watchConvexQuery(
        client,
        api.chat.messages,
        { serverId, channelId, externalId: config.userId },
        (messages) => messages,
        onChange,
      );
    },

    async send(channelId, body) {
      const outcome = await client.mutation(api.chat.sendMessage, {
        serverId,
        channelId,
        body,
        externalId: config.userId,
      });
      return outcome ?? { ok: true };
    },
  };
}

export function createConvexFeedWrites(
  client: ConvexReactClient,
  api: ConvexGameApi,
  config: ConvexGameTransportConfig,
) {
  return {
    async pushFeedEntry(args: { serverId: string; action: string; entry: unknown }) {
      await client.mutation(api.runtime.pushFeedEntry, { ...args, externalId: config.userId });
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
