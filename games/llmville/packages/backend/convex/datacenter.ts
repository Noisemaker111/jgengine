import { v } from "convex/values";
import { updateChunk } from "@jgengine/core/runtime/worldChunks";
import { claimTerritory, createTerritory, territoryChunkKeys, territoryChunkKey } from "@jgengine/core/world/territory";
import { loadTerritoryState, persistTerritoryState } from "@jgengine/convex/territory";
import type { RuntimeChunkRow, RuntimePlayerRow } from "@jgengine/core/runtime/snapshot";
import { TERRITORY_POLICY, type DatacenterClaim } from "@llmville/game/datacenter/claims";
import { type CellCoord } from "@llmville/game/datacenter/grid";
import { MAX_WORLD_CHUNK_QUERY_RADIUS, clampWorldChunkQueryRadius, worldChunkKeysInRadius } from "@llmville/game/datacenter/worldChunks";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { getEditorAccess, getReadAccess } from "./permissions";
import { playerProfileRow } from "./playerProfile";
import { worldServerRow } from "./jgengine/world";
import { helpers } from "./jgengine/runtime";

export const claimChunkKey = (cell: CellCoord) => territoryChunkKey({ x: cell.cx, z: cell.cz }, TERRITORY_POLICY);
export async function ownerDisplayName(ctx: QueryCtx | MutationCtx, externalId: string): Promise<string> {
  const owner = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", externalId)).first();
  return owner?.username?.trim() || owner?.displayName?.trim() || "Player";
}
export async function ownedClaimCount(ctx: QueryCtx | MutationCtx, gameId: Id<"games">): Promise<number> {
  const game = await ctx.db.get(gameId);
  if (!game) return 0;
  const profile = await playerProfileRow(ctx, game.createdBy);
  const legacy = await ctx.db.query("datacenterClaims").withIndex("by_game_id", q => q.eq("gameId", gameId)).take(512);
  return Number((profile?.playerState as RuntimePlayerRow | undefined)?.territoryOwnedCount ?? 0) + legacy.length;
}
export async function ownedClaimChunkKeys(ctx: QueryCtx | MutationCtx, gameId: Id<"games">): Promise<string[]> {
  const game = await ctx.db.get(gameId);
  if (!game) return [];
  const profile = await playerProfileRow(ctx, game.createdBy);
  const legacy = await ctx.db.query("datacenterClaims").withIndex("by_game_id", q => q.eq("gameId", gameId)).take(512);
  return [...new Set([...(profile?.playerState as RuntimePlayerRow | undefined)?.ownedTerritoryChunkKeys ?? [], ...legacy.map(claimChunkKey)])];
}
async function claimsForKeys(ctx: QueryCtx | MutationCtx, keys: readonly string[]): Promise<DatacenterClaim[]> {
  const server = await worldServerRow(ctx), claims = new Map<string, DatacenterClaim>();
  const owners = new Map<string, { gameId: string; name: string; count: number }>();
  for (const chunkKey of keys) {
    const legacy = await ctx.db.query("datacenterClaims").withIndex("by_chunk_key", q => q.eq("chunkKey", chunkKey)).collect();
    for (const row of legacy) claims.set(`${row.cx},${row.cz}`, { cx: row.cx, cz: row.cz, ownerGameId: row.gameId, ownerName: row.ownerName, claimedAt: row.claimedAt, costPaid: row.costPaid });
    if (!server) continue;
    const row = await ctx.db.query("jgWorldChunks").withIndex("by_server_and_chunk", q => q.eq("serverId", server._id).eq("chunkKey", chunkKey)).unique();
    for (const [cellKey, userId] of Object.entries((row?.snapshot as RuntimeChunkRow | undefined)?.territory ?? {})) {
      let owner = owners.get(userId);
      if (!owner) {
        const game = await ctx.db.query("games").withIndex("by_created_by", q => q.eq("createdBy", userId)).order("desc").first();
        owner = { gameId: game?._id ?? userId, name: await ownerDisplayName(ctx, userId), count: game ? await ownedClaimCount(ctx, game._id) : 0 };
        owners.set(userId, owner);
      }
      const [cx, cz] = cellKey.split(",").map(Number);
      const receipt = (row?.snapshot as RuntimeChunkRow | undefined)?.territoryReceipts?.[cellKey];
      claims.set(cellKey, { cx: cx!, cz: cz!, ownerGameId: owner.gameId, ownerName: owner.name, ownerOwnedCellCount: owner.count, ...receipt });
    }
  }
  return [...claims.values()];
}
export async function claimsNear(ctx: QueryCtx | MutationCtx, center: { x: number; z: number }, radius: number): Promise<DatacenterClaim[]> {
  if (!Number.isFinite(center.x) || !Number.isFinite(center.z) || !Number.isFinite(radius)) return [];
  return claimsForKeys(ctx, worldChunkKeysInRadius(center, clampWorldChunkQueryRadius(radius)));
}
export async function claimsInCellSquare(ctx: QueryCtx | MutationCtx, halfSizeCells: number): Promise<DatacenterClaim[]> {
  const min = Math.floor((-halfSizeCells + 0.5) / 64), max = Math.floor((halfSizeCells + 0.5) / 64);
  const overflow = Math.max(0, max - min + 1 - 8), first = min + Math.floor(overflow / 2), last = max - Math.ceil(overflow / 2);
  const keys: string[] = [];
  for (let x = first; x <= last; x++) for (let z = first; z <= last; z++) keys.push(`${x},${z}`);
  return claimsForKeys(ctx, keys);
}
export async function claimsNearOrigin(ctx: QueryCtx | MutationCtx): Promise<DatacenterClaim[]> {
  return claimsNear(ctx, { x: 0, z: 0 }, MAX_WORLD_CHUNK_QUERY_RADIUS);
}
export async function claimsForGame(ctx: QueryCtx | MutationCtx, gameId: Id<"games">): Promise<DatacenterClaim[]> {
  return (await claimsForKeys(ctx, await ownedClaimChunkKeys(ctx, gameId))).filter(claim => claim.ownerGameId === gameId);
}
export async function renameClaimOwner(ctx: MutationCtx, externalId: string, _name: string): Promise<void> {
  await prepareClaims(ctx, externalId, []);
}

async function migrateLegacyRows(ctx: MutationCtx, rows: readonly Doc<"datacenterClaims">[]): Promise<number> {
  if (!rows.length) return 0;
  const server = await helpers.ensureServer(ctx, LLMVILLE_GAME_ID);
  const grouped = new Map<string, Doc<"datacenterClaims">[]>();
  for (const row of rows) grouped.set(row.ownerExternalId, [...grouped.get(row.ownerExternalId) ?? [], row]);
  for (const [userId, owned] of grouped) {
    const cells = owned.map(row => ({ x: row.cx, z: row.cz }));
    const snapshot = await loadTerritoryState(ctx, { serverId: server._id, gameId: LLMVILLE_GAME_ID, userId, chunkKeys: [...new Set(owned.map(claimChunkKey))] });
    const result = claimTerritory(snapshot, userId, cells, { ...TERRITORY_POLICY, gapCells: 0, price: () => 0 });
    if (!result.ok) throw new Error("Legacy territory overlaps another owner; migration stopped without deleting claims");
    let migrated = result.snapshot;
    for (const row of owned) migrated = updateChunk(migrated, claimChunkKey(row), chunk => ({ ...chunk, territoryReceipts: { ...chunk.territoryReceipts, [`${row.cx},${row.cz}`]: { claimedAt: row.claimedAt, costPaid: row.costPaid } } }));
    await persistTerritoryState(ctx, migrated);
    for (const row of owned) await ctx.db.delete(row._id);
  }
  return rows.length;
}
async function prepareClaims(ctx: MutationCtx, userId: string, keys: readonly string[]): Promise<void> {
  const own = await ctx.db.query("datacenterClaims").withIndex("by_owner_external_id", q => q.eq("ownerExternalId", userId)).take(512);
  if (own.length === 512) throw new Error("Territory migration must complete before claiming more land");
  await migrateLegacyRows(ctx, own);
  for (const chunkKey of keys) {
    const nearby = await ctx.db.query("datacenterClaims").withIndex("by_chunk_key", q => q.eq("chunkKey", chunkKey)).take(512);
    if (nearby.length === 512) throw new Error("Territory migration must complete before claiming more land");
    await migrateLegacyRows(ctx, nearby);
  }
}
export async function grantTerritoryCells(ctx: MutationCtx, userId: string, cells: readonly CellCoord[], free = false) {
  const server = await helpers.ensureServer(ctx, LLMVILLE_GAME_ID), converted = cells.map(cell => ({ x: cell.cx, z: cell.cz }));
  const keys = territoryChunkKeys(converted, TERRITORY_POLICY);
  await prepareClaims(ctx, userId, keys);
  const snapshot = await loadTerritoryState(ctx, { serverId: server._id, gameId: LLMVILLE_GAME_ID, userId, chunkKeys: keys });
  const result = claimTerritory(snapshot, userId, converted, free ? { ...TERRITORY_POLICY, price: () => 0, nowMs: Date.now() } : { ...TERRITORY_POLICY, nowMs: Date.now() });
  if (result.ok) await persistTerritoryState(ctx, result.snapshot);
  return result;
}
export async function preparePlacementTerritory(ctx: MutationCtx, userId: string, cells: readonly CellCoord[]) {
  await prepareClaims(ctx, userId, territoryChunkKeys(cells.map(cell => ({ x: cell.cx, z: cell.cz })), TERRITORY_POLICY));
}
export async function releaseClaimsForGame(ctx: MutationCtx, gameId: Id<"games">): Promise<number> {
  const game = await ctx.db.get(gameId), server = await worldServerRow(ctx);
  if (!game || !server) return 0;
  const keys = await ownedClaimChunkKeys(ctx, gameId);
  await prepareClaims(ctx, game.createdBy, keys);
  let removed = 0;
  for (const chunkKey of keys) {
    let snapshot = await loadTerritoryState(ctx, { serverId: server._id, gameId: LLMVILLE_GAME_ID, userId: game.createdBy, chunkKeys: [chunkKey] });
    const territory = createTerritory({ get: () => snapshot, set: next => { snapshot = next; } }, () => TERRITORY_POLICY);
    for (const [key, owner] of Object.entries(snapshot.chunks[chunkKey]?.territory ?? {})) {
      const [x, z] = key.split(",").map(Number);
      if (owner === game.createdBy && territory.release(owner, { x: x!, z: z! })) removed++;
    }
    await persistTerritoryState(ctx, snapshot);
  }
  return removed;
}
const claimValidator = v.object({ cx: v.number(), cz: v.number(), ownerGameId: v.string(), ownerName: v.string(), ownerOwnedCellCount: v.optional(v.number()), claimedAt: v.optional(v.number()), costPaid: v.optional(v.number()) });
export const listClaims = query({ args: { x: v.number(), z: v.number(), radius: v.optional(v.number()) }, returns: v.array(claimValidator), handler: async (ctx, args) => {
  if (!await ctx.auth.getUserIdentity()) return [];
  return claimsNear(ctx, args, args.radius ?? MAX_WORLD_CHUNK_QUERY_RADIUS);
} });
export const myClaims = query({ args: { gameId: v.id("games"), externalId: v.optional(v.string()) }, handler: async (ctx, args) => {
  if (!await getReadAccess(ctx, args.gameId, args.externalId)) return [];
  return (await claimsForGame(ctx, args.gameId)).map(cell => ({ cx: cell.cx, cz: cell.cz, claimedAt: cell.claimedAt ?? 0, costPaid: cell.costPaid ?? 0 }));
} });
export const claimCell = mutation({ args: { gameId: v.id("games"), cx: v.number(), cz: v.number(), externalId: v.optional(v.string()) }, handler: async (ctx, args) => {
  const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
  const result = await grantTerritoryCells(ctx, owned.game.createdBy, [{ cx: args.cx, cz: args.cz }]);
  if (!result.ok) return { claimed: false, reason: result.reason } as const;
  if (result.cost === 0) return { claimed: false, reason: "already_claimed" } as const;
  return { claimed: true, cost: result.cost } as const;
} });
/** One-shot upgrade: invoke until remaining is false, then remove the legacy table in a follow-up deployment. */
export const migrateLegacyClaims = internalMutation({ args: {}, handler: async ctx => {
  const rows = await ctx.db.query("datacenterClaims").take(128);
  const migrated = await migrateLegacyRows(ctx, rows);
  return { migrated, remaining: rows.length === 128 };
} });
