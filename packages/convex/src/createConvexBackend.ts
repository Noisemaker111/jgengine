import type { ConvexReactClient } from "convex/react";
import type { GameBackend } from "@jgengine/core/runtime/transport";
import {
  createConvexGameFeeds,
  createConvexGameTransport,
  createConvexLeaderboardReads,
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
> = GameBackend<TPresenceRow, TPresenceLocation, TGameId> & {
  leaderboard: ConvexLeaderboardReads;
};

export type ConvexBackendOptions<
  TRawPresenceRow extends { actorExternalId: string },
  TPresenceRow,
> = {
  client: ConvexReactClient;
  api: ConvexGameApi;
  gameId: string;
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
  const config = { gameId: options.gameId };
  return {
    transport: createConvexGameTransport(options.client, options.api, config),
    feeds: createConvexGameFeeds(options.client, options.api, config),
    leaderboard: createConvexLeaderboardReads(options.api, config),
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
