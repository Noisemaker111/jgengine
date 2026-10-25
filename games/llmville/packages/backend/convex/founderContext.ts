import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getFounderMultipliers, type FounderMultipliers } from "@llmville/game/user/founder";

export async function getFounderMultipliersForGameId(
  ctx: MutationCtx | QueryCtx,
  gameId: Id<"games">,
): Promise<FounderMultipliers> {
  const game = await ctx.db.get(gameId);
  return getFounderMultipliersForGameDoc(ctx, game);
}

export async function getFounderMultipliersForGameDoc(
  ctx: MutationCtx | QueryCtx,
  game: Doc<"games"> | null,
): Promise<FounderMultipliers> {
  if (!game?.createdBy) {
    return getFounderMultipliers(undefined);
  }
  const u = await ctx.db
    .query("users")
    .withIndex("by_external_id", (q) => q.eq("externalId", game.createdBy))
    .unique();
  return getFounderMultipliers(u?.avatarId);
}
