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
import {
  createConvexPresenceTransport,
  type ConvexPresenceFunctions,
} from "./convexPresenceTransport";

export type ConvexLeaderboardReads = ReturnType<typeof createConvexLeaderboardReads>;

export type ConvexBackend<
  TPresenceRow = unknown,
  TPresenceLocation = unknown,
  TGameId extends string = string,
> = LiveGameBackend<TPresenceRow, TPresenceLocation, TGameId> & {
  leaderboard: ConvexLeaderboardReads;
};

export type ConvexBackendOptions<
  TRawPresenceRow extends { actorExternalId: string },
  TPresenceRow,
> = {
  client: ConvexReactClient;
  gameId: string;
  userId: string;
  api?: ConvexGameApi;
  poseTuning?: PoseSyncTuning;
  presence?: {
    functions: ConvexPresenceFunctions;
    mapRow: (row: TRawPresenceRow) => TPresenceRow;
  };
};

export function createConvexBackend<
  TRawPresenceRow extends { actorExternalId: string } = { actorExternalId: string },
  TPresenceRow = unknown,
  TPresenceLocation = unknown,
  TGameId extends string = string,
>(
  options: ConvexBackendOptions<TRawPresenceRow, TPresenceRow>,
): ConvexBackend<TPresenceRow, TPresenceLocation, TGameId> {
  const api = options.api ?? defaultConvexGameApi();
  const config = { gameId: options.gameId, userId: options.userId };
  return {
    transport: createConvexGameTransport(options.client, api, config),
    feeds: createConvexGameFeeds(options.client, api, config),
    leaderboard: createConvexLeaderboardReads(api, config),
    presenceSync: createConvexPresenceSync(options.client, api, config, options.poseTuning),
    ...createConvexFeedWrites(options.client, api, config),
    chatSyncFor: (serverId) => createConvexChatSync(options.client, api, config, serverId),
    ...(options.presence === undefined
      ? {}
      : {
          presence: createConvexPresenceTransport<
            TRawPresenceRow,
            TPresenceRow,
            TPresenceLocation,
            TGameId
          >(options.presence.functions, options.presence.mapRow),
        }),
  };
}
