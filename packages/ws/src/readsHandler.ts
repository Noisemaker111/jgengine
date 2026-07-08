import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { HostPersistence, ServerListing } from "@jgengine/core/runtime/hostPersistence";
import { toOpenServerListings, toServerListing } from "@jgengine/core/runtime/hostPersistence";

export type ReadsPersistence = Pick<
  HostPersistence,
  "listServers" | "loadProfile" | "getLeaderboardTop" | "getLeaderboardProfile"
>;

export type ReadsHandler = (request: Request) => Promise<Response>;

export type ReadsHandlerOptions = {
  persistence: ReadsPersistence | (() => Promise<ReadsPersistence>);
  basePath?: string;
  listOpenServers?: (args: { gameId: string; limit?: number }) => Promise<ServerListing[]>;
};

function isScope(value: string): value is LeaderboardScope {
  return value === "global" || value === "server" || value === "profile";
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function createReadsHandler(options: ReadsHandlerOptions): ReadsHandler {
  const basePath = (options.basePath ?? "/api").replace(/\/$/, "");
  let persistence: Promise<ReadsPersistence> | null = null;
  const getPersistence = (): Promise<ReadsPersistence> => {
    persistence ??=
      typeof options.persistence === "function" ? options.persistence() : Promise.resolve(options.persistence);
    return persistence;
  };

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
      return json({ error: "not found" }, 404);
    }
    if (request.method !== "GET") {
      return json({ error: "method not allowed" }, 405);
    }
    const segments = url.pathname.slice(basePath.length).split("/").filter(Boolean).map(decodeURIComponent);
    const gameId = url.searchParams.get("gameId") ?? "";
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam === null ? undefined : Number(limitParam);
    const [head, tail] = segments;

    if (head === "servers" && tail === undefined) {
      if (options.listOpenServers !== undefined) {
        return json(await options.listOpenServers({ gameId, limit }));
      }
      const records = await (await getPersistence()).listServers(gameId);
      return json(toOpenServerListings(records.map(toServerListing), limit));
    }

    if (head === "leaderboard" && tail !== undefined && segments.length === 2) {
      const scope = url.searchParams.get("scope") ?? "global";
      if (!isScope(scope)) {
        return json({ error: "scope must be global | server | profile" }, 400);
      }
      return json(
        await (await getPersistence()).getLeaderboardTop({
          gameId,
          stat: tail,
          scope,
          serverId: url.searchParams.get("serverId") ?? undefined,
          limit,
        }),
      );
    }

    if (head === "leaderboard-profile" && tail !== undefined && segments.length === 2) {
      return json(await (await getPersistence()).getLeaderboardProfile({ gameId, userId: tail }));
    }

    if (head === "profile" && tail !== undefined && segments.length === 2) {
      const profile = await (await getPersistence()).loadProfile({ userId: tail, gameId });
      return json(
        profile === null
          ? null
          : {
              userId: profile.userId,
              gameId: profile.gameId,
              playerState: profile.playerState,
              updatedAt: profile.updatedAt,
            },
      );
    }

    return json({ error: "not found" }, 404);
  };
}
