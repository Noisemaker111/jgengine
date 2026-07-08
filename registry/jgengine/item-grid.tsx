import type { ReactNode } from "react";

export type RarityTierName = "common" | "uncommon" | "rare" | "epic" | "legendary";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const rarityColor = (rarity: RarityTierName | undefined) => `var(--jg-rarity-${rarity ?? "common"})`;

export interface ItemGridSlot {
  itemId: string | null;
  count?: number;
  icon?: ReactNode;
  rarity?: RarityTierName;
}

export function ItemGrid({
  slots,
  columns = 5,
  slotSize = 44,
  onSlotClick,
  className,
}: {
  slots: readonly ItemGridSlot[];
  columns?: number;
  slotSize?: number;
  onSlotClick?: (index: number, itemId: string | null) => void;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-1 ${className ?? ""}`}
      data-jg="item-grid"
      style={{ gridTemplateColumns: `repeat(${columns}, ${slotSize}px)` }}
    >
      {slots.map((slot, index) => {
        const occupied = slot.itemId !== null;
        const color = occupied ? rarityColor(slot.rarity) : "var(--jg-edge)";
        return (
          <button
            key={index}
            type="button"
            onClick={onSlotClick === undefined ? undefined : () => onSlotClick(index, slot.itemId)}
            className={`relative p-0 ${onSlotClick === undefined ? "cursor-default" : "cursor-pointer"}`}
            style={{
              width: slotSize,
              height: slotSize,
              clipPath: chamfer(5),
              color: "var(--jg-text)",
              border: occupied ? `1px solid ${color}` : "1px dashed var(--jg-edge)",
              borderColor: occupied ? color : "color-mix(in srgb, var(--jg-edge) 40%, transparent)",
              background: occupied
                ? "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)"
                : "var(--jg-surface-deep)",
              boxShadow: occupied
                ? `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), inset 0 0 8px ${color}33`
                : "inset 0 2px 4px rgba(0,0,0,0.6)",
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center">{slot.icon}</span>
            {occupied && slot.count !== undefined && slot.count > 1 && (
              <span
                className="absolute bottom-0.5 right-[3px] font-mono text-[10px] font-bold"
                style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
              >
                {slot.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
