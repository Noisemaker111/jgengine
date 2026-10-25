import { markPlayerDirty } from "@jgengine/core/runtime/snapshot";
import type { GameRuntimeSnapshot, RuntimeInventorySlot } from "@jgengine/core/runtime/snapshot";

export const STOCK_ID = {
  hardware: "hardware",
  cooling: "cooling",
  build: "build",
} as const;

export type StockId = (typeof STOCK_ID)[keyof typeof STOCK_ID];

export function countsToSlots(counts: Record<string, number | undefined>): { item: string; count: number }[] {
  return Object.entries(counts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([item, count]) => ({ item, count: count ?? 0 }));
}

export function slotsToCounts(slots: readonly { item: string; count: number }[] | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const slot of slots ?? []) counts[slot.item] = (counts[slot.item] ?? 0) + slot.count;
  return counts;
}

export function readSnapshotStock(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  stock: StockId,
): Record<string, number> {
  return slotsToCounts(snapshot.players[userId]?.inventories[stock]);
}

export function writeSnapshotStock(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  stock: StockId,
  counts: Record<string, number | undefined>,
): GameRuntimeSnapshot {
  const player = snapshot.players[userId];
  if (player === undefined) return snapshot;
  const slots: RuntimeInventorySlot[] = countsToSlots(counts);
  return markPlayerDirty(
    {
      ...snapshot,
      players: {
        ...snapshot.players,
        [userId]: { ...player, inventories: { ...player.inventories, [stock]: slots } },
      },
    },
    userId,
  );
}
