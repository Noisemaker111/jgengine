import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { countsToSlots, patchPlayerState, readPlayerState, slotsToCounts } from "./playerProfile";

import { STOCK_ID, type StockId } from "@llmville/game/inventory/stock";

export { STOCK_ID };
export type { StockId };

export async function readStockForOwner(ctx: QueryCtx, ownerExternalId: string, stock: StockId): Promise<Record<string, number>> {
  return slotsToCounts((await readPlayerState(ctx, ownerExternalId)).inventories[stock]);
}

export async function readStock(ctx: QueryCtx, game: Doc<"games">, stock: StockId): Promise<Record<string, number>> {
  return readStockForOwner(ctx, game.createdBy, stock);
}

export async function writeStock(ctx: MutationCtx, ownerExternalId: string, stock: StockId, counts: Record<string, number | undefined>): Promise<void> {
  await patchPlayerState(ctx, ownerExternalId, (state) => ({
    ...state,
    inventories: { ...state.inventories, [stock]: countsToSlots(counts) },
  }));
}

export async function seedOwnerStock(ctx: MutationCtx, ownerExternalId: string, stocks: Record<StockId, Record<string, number | undefined>>): Promise<void> {
  await patchPlayerState(ctx, ownerExternalId, (state) => ({
    ...state,
    inventories: {
      ...state.inventories,
      [STOCK_ID.hardware]: countsToSlots(stocks.hardware),
      [STOCK_ID.cooling]: countsToSlots(stocks.cooling),
      [STOCK_ID.build]: countsToSlots(stocks.build),
    },
  }));
}
