import { createEmptyPlayerRow, createRuntimeSnapshot, type GameRuntimeSnapshot, type RuntimeChunkRow, type RuntimePlayerRow } from "@jgengine/core/runtime/snapshot";
import type { JGMutationCtx, JGDataModel } from "./server";
import type { GenericQueryCtx } from "convex/server";
type JGQueryCtx = GenericQueryCtx<JGDataModel>;
import type { GenericId } from "convex/values";

/**
 * Trusted host hydration for claim/bootstrap work; the caller checks access before invoking it.
 * @capability territory-host-hydration Load an actor profile and bounded claim chunks for a host transaction.
 */
export async function loadTerritoryState(ctx: JGQueryCtx | JGMutationCtx, args: { serverId: string; gameId: string; userId: string; chunkKeys: readonly string[] }): Promise<GameRuntimeSnapshot> {
  const keys = [...new Set(args.chunkKeys)];
  if (keys.length > 64) throw new RangeError("Territory read exceeds 64 chunks");
  const profile = await ctx.db.query("jgPlayerProfiles").withIndex("by_user_and_game", q => q.eq("userId", args.userId).eq("gameId", args.gameId)).unique();
  const chunks: Record<string, RuntimeChunkRow> = {};
  for (const chunkKey of keys) {
    const row = await ctx.db.query("jgWorldChunks").withIndex("by_server_and_chunk", q => q.eq("serverId", args.serverId as GenericId<"jgGameServers">).eq("chunkKey", chunkKey)).unique();
    if (row) chunks[chunkKey] = row.snapshot as RuntimeChunkRow;
  }
  return createRuntimeSnapshot({ serverId: args.serverId, gameId: args.gameId, players: { [args.userId]: (profile?.playerState as RuntimePlayerRow | undefined) ?? createEmptyPlayerRow(args.userId) }, chunks, revision: profile?.revision ?? 0 });
}

/**
 * Persist dirty territory chunks and profiles in the caller's mutation, without a shared-server write.
 * @capability territory-host-persistence Persist dirty ownership chunks and profiles without rewriting the shared server.
 */
export async function persistTerritoryState(ctx: JGMutationCtx, snapshot: GameRuntimeSnapshot, nowMs = Date.now()): Promise<void> {
  for (const userId of snapshot.dirty.players) {
    const playerState = snapshot.players[userId];
    if (!playerState) throw new Error("Dirty territory player was not hydrated");
    const row = await ctx.db.query("jgPlayerProfiles").withIndex("by_user_and_game", q => q.eq("userId", userId).eq("gameId", snapshot.gameId)).unique();
    if (row) await ctx.db.patch(row._id, { playerState, revision: row.revision + 1, updatedAt: nowMs });
    else await ctx.db.insert("jgPlayerProfiles", { userId, gameId: snapshot.gameId, playerState, revision: 1, createdAt: nowMs, updatedAt: nowMs });
  }
  for (const chunkKey of snapshot.dirty.chunks) {
    const chunk = snapshot.chunks[chunkKey];
    const row = await ctx.db.query("jgWorldChunks").withIndex("by_server_and_chunk", q => q.eq("serverId", snapshot.serverId as GenericId<"jgGameServers">).eq("chunkKey", chunkKey)).unique();
    if (!chunk) { if (row) await ctx.db.delete(row._id); continue; }
    if (row) await ctx.db.patch(row._id, { snapshot: chunk, updatedAt: nowMs });
    else await ctx.db.insert("jgWorldChunks", { serverId: snapshot.serverId as GenericId<"jgGameServers">, chunkKey, snapshot: chunk, updatedAt: nowMs });
  }
}
