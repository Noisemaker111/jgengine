import type { ReactNode } from "react";
import { useInventory } from "@jgengine/react/hooks";
import type { InventorySlot } from "@jgengine/core/inventory/inventoryModel";

import { ItemGrid, type ItemGridSlot } from "@/components/ui/item-grid";

export function InventorySlotGrid({
  inventoryId,
  columns,
  slotSize,
  resolveIcon,
  resolveRarity,
  onSlotClick,
  className,
}: {
  inventoryId: string;
  columns?: number;
  slotSize?: number;
  resolveIcon?: (itemId: string) => ReactNode;
  resolveRarity?: (itemId: string) => ItemGridSlot["rarity"];
  onSlotClick?: (index: number, itemId: string | null) => void;
  className?: string;
}) {
  const slots: readonly InventorySlot[] = useInventory(inventoryId);
  const gridSlots: ItemGridSlot[] = slots.map((slot) =>
    slot === null
      ? { itemId: null }
      : {
          itemId: slot.itemId,
          count: slot.count,
          icon: resolveIcon?.(slot.itemId),
          rarity: resolveRarity?.(slot.itemId),
        },
  );
  return (
    <ItemGrid slots={gridSlots} columns={columns} slotSize={slotSize} onSlotClick={onSlotClick} className={className} />
  );
}
