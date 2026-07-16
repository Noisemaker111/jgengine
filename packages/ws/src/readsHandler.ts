import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { HostPersistence, ServerListing } from "@jgengine/core/runtime/hostPersistence";
import { toOpenServerListings, toServerListing } from "@jgengine/core/runtime/hostPersistence";

export type ReadsPersistence = Pick<
  HostPersistence,
  "listServers" | "loadProfile" | "getLeaderboardTop" | "getLeaderboardProfile"
>;

export type ReadsHandler = (request: Request) => Promise<Response>;

export type ReadsAuthenticate = (
  request: Request,
) => Promise<string | null> | string | null;

export type ReadsHandlerOptions = {
  persistence: ReadsPersistence | (() => Promise<ReadsPersistence>);
  basePath?: string;
  listOpenServers?: (args: { gameId: string; limit?: number }) => Promise<ServerListing[]>;
  authenticate?: ReadsAuthenticate;
  allowPublicProfiles?: boolean;
};

function isScope(value: string): value is LeaderboardScope {
  return value === "global" || value === "server" || value === "profile";
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function createReadsHandler(options: ReadsHandlerOptions): ReadsHandler {
  const basePath = (options.basePath ?? "/api").replace(/\/$/, "");
  const allowPublicProfiles = options.allowPublicProfiles === true;
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
    let segments: string[];
    try {
      segments = url.pathname.slice(basePath.length).split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return json({ error: "malformed path" }, 400);
    }
    const gameId = url.searchParams.get("gameId") ?? "";
    const limitParam = url.searchParams.get("limit");
    if (limitParam !== null && !Number.isFinite(Number(limitParam))) {
      return json({ error: "limit must be a number" }, 400);
    }
    const limit = limitParam === null ? undefined : Number(limitParam);
    const [head, tail] = segments;

    if (head === "servers" && tail === undefined) {
      if (options.listOpenServers !== undefined) {
        return json(await options.listOpenServers({ gameId, limit }));
      }
      const records = await (await getPersistence()).listServers(gameId);
      const publicRecords = records.filter((record) => (record.visibility ?? "public") !== "private");
      return json(toOpenServerListings(publicRecords.map((record) => toServerListing(record)), limit));
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
      if (!allowPublicProfiles) {
        if (options.authenticate === undefined) {
          return json({ error: "unauthorized" }, 401);
        }
        const actorUserId = await options.authenticate(request);
        if (actorUserId === null || actorUserId !== tail) {
          return json({ error: "unauthorized" }, 401);
        }
      }
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
