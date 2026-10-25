import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";

export type PlayerState = {
  userId: string;
  inventories: Record<string, { item: string; count: number; slot?: number }[]>;
  economy: Record<string, number>;
  unlocks: string[];
};

export async function playerProfileRow(ctx: QueryCtx, ownerExternalId: string): Promise<Doc<"jgPlayerProfiles"> | null> {
  return ctx.db
    .query("jgPlayerProfiles")
    .withIndex("by_user_and_game", (q) => q.eq("userId", ownerExternalId).eq("gameId", LLMVILLE_GAME_ID))
    .unique();
}

export function playerStateOf(profile: Doc<"jgPlayerProfiles"> | null, ownerExternalId: string): PlayerState {
  const stored = (profile?.playerState ?? {}) as Partial<PlayerState> & Record<string, unknown>;
  return {
    ...stored,
    userId: ownerExternalId,
    inventories: stored.inventories ?? {},
    economy: stored.economy ?? {},
    unlocks: stored.unlocks ?? [],
  };
}

export async function readPlayerState(ctx: QueryCtx, ownerExternalId: string): Promise<PlayerState> {
  return playerStateOf(await playerProfileRow(ctx, ownerExternalId), ownerExternalId);
}

export async function patchPlayerState(
  ctx: MutationCtx,
  ownerExternalId: string,
  mutate: (state: PlayerState) => PlayerState,
): Promise<void> {
  const now = Date.now();
  const profile = await playerProfileRow(ctx, ownerExternalId);
  const playerState = mutate(playerStateOf(profile, ownerExternalId));
  if (profile === null) {
    await ctx.db.insert("jgPlayerProfiles", { userId: ownerExternalId, gameId: LLMVILLE_GAME_ID, playerState, revision: 0, dirtyAt: now, createdAt: now, updatedAt: now });
    return;
  }
  await ctx.db.patch(profile._id, { playerState, dirtyAt: now, updatedAt: now });
}

export { countsToSlots, slotsToCounts } from "@llmville/game/inventory/stock";
