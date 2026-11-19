import type { ConvexReactClient } from "convex/react";
import type { LiveGameBackend } from "@jgengine/core/runtime/transport";
import type { PoseSyncTuning } from "@jgengine/core/multiplayer/poseSyncGate";
import {
  createConvexChatSync,
  createConvexFeedWrites,
  createConvexGameFeeds,
  createConvexGameTransport,
  createConvexLeaderboardReads,
  createConvexPresenceSync,
  defaultConvexGameApi,
  type ConvexGameApi,
} from "./createConvexGameTransport";

export type ConvexLeaderboardReads = ReturnType<typeof createConvexLeaderboardReads>;

export type ConvexBackend = LiveGameBackend & {
  leaderboard: ConvexLeaderboardReads;
};

export type ConvexBackendOptions = {
  client: ConvexReactClient;
  gameId: string;
  userId: string;
  api?: ConvexGameApi | undefined;
  poseTuning?: PoseSyncTuning | undefined;
};

export function createConvexBackend(options: ConvexBackendOptions): ConvexBackend {
  const api = options.api ?? defaultConvexGameApi();
  const config = { gameId: options.gameId, userId: options.userId };
  return {
    transport: createConvexGameTransport(options.client, api, config),
    feeds: createConvexGameFeeds(options.client, api, config),
    leaderboard: createConvexLeaderboardReads(api, config),
    presenceSync: createConvexPresenceSync(options.client, api, config, options.poseTuning),
    ...createConvexFeedWrites(options.client, api, config),
    chatSyncFor: (serverId) => createConvexChatSync(options.client, api, config, serverId),
  };
}
