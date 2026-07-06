import type { SaveConfig } from "@jgengine/core/runtime/save";
import type {
  GameServerRecord,
  PlayerProfileRecord,
} from "@jgengine/core/runtime/hostPersistence";
import {
  buildHydratePlayers,
  planServerPersist,
  shouldAutoSave,
} from "@jgengine/core/runtime/hostPersistence";
import type { RuntimeChunkRow, RuntimePlayerRow, RuntimeServerRow } from "@jgengine/core/runtime/snapshot";
import { clearDirtyFlags, createRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getGameRuntime } from "./registry";
import { applyLeaderboardIncrements } from "./leaderboard";

function serverDocToRecord(server: Doc<"jgGameServers">): GameServerRecord {
  return {
    serverId: server._id,
    gameId: server.gameId,
    status: server.status,
    mode: server.mode,
    modeConfig: server.modeConfig,
    memberUserIds: server.memberUserIds,
    slotsPerServer: server.slotsPerServer,
    save: server.save as SaveConfig,
    serverState: server.serverState as RuntimeServerRow,
    sessionPlayers: server.sessionPlayers as Record<string, RuntimePlayerRow>,
    revision: server.revision,
    tickAnchorMs: server.tickAnchorMs,
    lastSavedAt: server.lastSavedAt,
    dirtyAt: server.dirtyAt,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

export async function loadServerSnapshot(
  ctx: MutationCtx,
  server: Doc<"jgGameServers">,
): Promise<ReturnType<typeof createRuntimeSnapshot>> {
  const runtime = getGameRuntime(server.gameId);
  const profiles: Record<string, PlayerProfileRecord | null> = {};

  for (const userId of server.memberUserIds) {
    const profile = await ctx.db
      .query("jgPlayerProfiles")
      .withIndex("by_user_and_game", (q) => q.eq("userId", userId).eq("gameId", server.gameId))
      .unique();

    profiles[userId] = profile
      ? {
          userId,
          gameId: server.gameId,
          playerState: profile.playerState as RuntimePlayerRow,
          revision: profile.revision,
          updatedAt: profile.updatedAt,
        }
      : null;
  }

  const playersByUserId = buildHydratePlayers(serverDocToRecord(server), profiles);

  const chunks = await ctx.db
    .query("jgWorldChunks")
    .withIndex("by_server", (q) => q.eq("serverId", server._id))
    .collect();

  const chunksByKey: Record<string, RuntimeChunkRow> = {};
  for (const chunk of chunks) {
    chunksByKey[chunk.chunkKey] = chunk.snapshot as RuntimeChunkRow;
  }

  return runtime.hydrate({
    gameId: server.gameId,
    serverId: server._id,
    serverRow: server.serverState as RuntimeServerRow,
    playersByUserId,
    chunksByKey,
  });
}

export async function persistServerSnapshot(
  ctx: MutationCtx,
  server: Doc<"jgGameServers">,
  snapshot: ReturnType<typeof createRuntimeSnapshot>,
  save: SaveConfig,
): Promise<void> {
  const now = Date.now();
  const plan = planServerPersist(serverDocToRecord(server), snapshot, save, now);

  if (plan.leaderboard.length > 0) {
    await applyLeaderboardIncrements(ctx, server.gameId, plan.leaderboard);
  }

  for (const profile of plan.profiles) {
    const existing = await ctx.db
      .query("jgPlayerProfiles")
      .withIndex("by_user_and_game", (q) => q.eq("userId", profile.userId).eq("gameId", profile.gameId))
      .unique();

    const profilePatch = {
      playerState: profile.playerState,
      revision: profile.revision,
      dirtyAt: undefined,
      updatedAt: profile.updatedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, profilePatch);
    } else {
      await ctx.db.insert("jgPlayerProfiles", {
        userId: profile.userId,
        gameId: profile.gameId,
        ...profilePatch,
        createdAt: now,
      });
    }
  }

  for (const chunk of plan.chunks) {
    const existing = await ctx.db
      .query("jgWorldChunks")
      .withIndex("by_server_and_chunk", (q) =>
        q.eq("serverId", server._id).eq("chunkKey", chunk.chunkKey),
      )
      .unique();

    const chunkPatch = {
      snapshot: chunk.snapshot,
      dirtyAt: undefined,
      updatedAt: chunk.updatedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, chunkPatch);
    } else {
      await ctx.db.insert("jgWorldChunks", {
        serverId: server._id,
        chunkKey: chunk.chunkKey,
        ...chunkPatch,
      });
    }
  }

  await ctx.db.patch(server._id, {
    serverState: plan.server.serverState,
    sessionPlayers: plan.server.sessionPlayers,
    revision: plan.server.revision,
    dirtyAt: plan.server.dirtyAt,
    updatedAt: plan.server.updatedAt,
    lastSavedAt: plan.server.lastSavedAt,
  });
}

export { shouldAutoSave };

export async function flushServerIfDue(
  ctx: MutationCtx,
  server: Doc<"jgGameServers">,
  now: number,
): Promise<boolean> {
  if (!shouldAutoSave(server.save as SaveConfig, server.dirtyAt, server.lastSavedAt, now)) {
    return false;
  }

  const snapshot = await loadServerSnapshot(ctx, server);
  await persistServerSnapshot(ctx, server, clearDirtyFlags(snapshot), server.save as SaveConfig);
  return true;
}

export type ServerId = Id<"jgGameServers">;
