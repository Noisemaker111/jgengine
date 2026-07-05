import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { GameRuntimePlayerView } from "@jgengine/core/runtime/transport";
import type { LeaderboardEntry, ServerListing } from "@jgengine/core/runtime/hostPersistence";

export type HttpReadsOptions = {
  baseUrl: string;
  gameId: string;
  fetchImpl?: typeof fetch;
};

export type HttpReads = {
  getTop: (args: {
    stat: string;
    scope: LeaderboardScope;
    serverId?: string;
    limit?: number;
  }) => Promise<LeaderboardEntry[]>;
  getLeaderboardProfile: (userId: string) => Promise<Record<string, number>>;
  getPlayerProfile: (userId: string) => Promise<GameRuntimePlayerView | null>;
  listOpenServers: (args?: { limit?: number }) => Promise<ServerListing[]>;
};

export function createHttpReads(options: HttpReadsOptions): HttpReads {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");

  const get = async <T>(path: string, params: Record<string, string | number | undefined>): Promise<T> => {
    const search = new URLSearchParams({ gameId: options.gameId });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
    }
    const response = await fetchImpl(`${base}${path}?${search}`);
    if (!response.ok) {
      throw new Error(`GET ${path} failed: ${response.status}`);
    }
    return (await response.json()) as T;
  };

  return {
    getTop: (args) =>
      get(`/api/leaderboard/${encodeURIComponent(args.stat)}`, {
        scope: args.scope,
        serverId: args.serverId,
        limit: args.limit,
      }),
    getLeaderboardProfile: (userId) =>
      get(`/api/leaderboard-profile/${encodeURIComponent(userId)}`, {}),
    getPlayerProfile: (userId) => get(`/api/profile/${encodeURIComponent(userId)}`, {}),
    listOpenServers: (args) => get(`/api/servers`, { limit: args?.limit }),
  };
}
