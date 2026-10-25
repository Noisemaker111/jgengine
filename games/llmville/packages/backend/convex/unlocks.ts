import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ResearchUnlocks } from "@llmville/game/research/researchUnlocks";
import type { ModelCatalogEntryRow } from "@llmville/game/schema/rowShapes";
import { patchPlayerState, readPlayerState } from "./playerProfile";

const RESEARCH_PREFIX = "research:";
const MODEL_PREFIX = "model:";

export const researchUnlockId = (itemId: string) => `${RESEARCH_PREFIX}${itemId}`;
export const modelUnlockId = (baseModelId: string) => `${MODEL_PREFIX}${baseModelId}`;

function recordFrom<T>(unlocks: readonly string[], prefix: string, entry: T): Record<string, T> {
  const result: Record<string, T> = {};
  for (const unlock of unlocks) {
    if (unlock.startsWith(prefix)) result[unlock.slice(prefix.length)] = entry;
  }
  return result;
}

export async function readResearchUnlocksForOwner(ctx: QueryCtx, ownerExternalId: string): Promise<ResearchUnlocks> {
  const state = await readPlayerState(ctx, ownerExternalId);
  return recordFrom(state.unlocks, RESEARCH_PREFIX, { isUnlocked: true });
}

export async function readResearchUnlocks(ctx: QueryCtx, game: Doc<"games">): Promise<ResearchUnlocks> {
  return readResearchUnlocksForOwner(ctx, game.createdBy);
}

export async function readModelCatalog(ctx: QueryCtx, game: Doc<"games">): Promise<Record<string, ModelCatalogEntryRow>> {
  const state = await readPlayerState(ctx, game.createdBy);
  return recordFrom(state.unlocks, MODEL_PREFIX, { isUnlocked: true });
}

export async function grantUnlock(ctx: MutationCtx, ownerExternalId: string, unlockId: string): Promise<void> {
  await patchPlayerState(ctx, ownerExternalId, (state) =>
    state.unlocks.includes(unlockId) ? state : { ...state, unlocks: [...state.unlocks, unlockId] },
  );
}

export async function seedOwnerUnlocks(ctx: MutationCtx, ownerExternalId: string, research: ResearchUnlocks): Promise<void> {
  const unlocks = Object.entries(research)
    .filter(([, entry]) => entry?.isUnlocked === true)
    .map(([itemId]) => researchUnlockId(itemId));
  await patchPlayerState(ctx, ownerExternalId, (state) => ({ ...state, unlocks }));
}
