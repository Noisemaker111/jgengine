import { type CSSProperties, type ReactNode } from "react";

import { IconTreatment, type IconSchool } from "./iconTreatment";
import type { GameIconName } from "./gameIcons";

/**
 * Atomic, purpose-named slot grids (#1033): one component per category — `EquipmentSlots`,
 * `WeaponSlots`, `ArmorSlots`, `PotionSlots` — for paperdoll / equip layouts where each grid holds a
 * single gear category. A full multi-category backpack that binds to a live inventory with
 * drag/swap/stack/split is a different, supported shape: reach for `<InventoryGrid>` (`inventoryGrid.tsx`)
 * there, and use these atomic grids for the equip slots around it. Each renders a grid of painted
 * {@link IconTreatment} tiles (glyph + gradient + count badge) for filled slots and a themed placeholder
 * for empty ones, all reading the shared `--jg-slot-*` / `--jg-accent` HudTheme tokens (#1034).
 * Composition stays the game's; the engine ships the grid.
 *
 * @capability hud-slots atomic themed equipment/weapon/armor/potion slot grids with painted icons
 */

/** One slot's content — a `GameIcon` glyph (or custom node), school tint, count, keycap, active flag. */
export interface SlotItem {
  icon?: GameIconName;
  glyph?: ReactNode;
  school?: IconSchool;
  count?: number;
  keycap?: string;
  active?: boolean;
  /** Accessible label / tooltip. */
  label?: string;
}

/** Props shared by every atomic slot grid. */
export interface SlotGridProps {
  /** Slots in order; `null` (or a slot with no icon/glyph) renders an empty placeholder. */
  items: readonly (SlotItem | null)[];
  /** Tile size in px. Default 44. */
  size?: number;
  /** Grid columns; default = one row (all slots). */
  columns?: number;
  /** Gap between tiles in px. Default 6. */
  gap?: number;
  className?: string;
  style?: CSSProperties;
}

function EmptySlot({ size }: { size: number }) {
  return (
    <div
      data-slot-empty=""
      style={{
        width: size,
        height: size,
        borderRadius: "var(--jg-slot-radius, 9px)",
        background: "var(--jg-slot-bg, rgba(12,14,20,0.5))",
        border: "var(--jg-slot-border, 1px solid rgba(255,255,255,0.1))",
        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.45)",
        boxSizing: "border-box",
      }}
    />
  );
}

function SlotGrid({ category, items, size = 44, columns, gap = 6, className, style }: SlotGridProps & { category: string }) {
  const cols = columns ?? items.length;
  return (
    <div
      data-slots={category}
      className={className}
      style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, cols)}, ${size}px)`, gap, ...style }}
    >
      {items.map((item, index) => {
        const filled = item !== null && (item.icon !== undefined || item.glyph !== undefined);
        return filled ? (
          <IconTreatment
            key={index}
            {...(item!.icon === undefined ? {} : { icon: item!.icon })}
            {...(item!.glyph === undefined ? {} : { glyph: item!.glyph })}
            school={item!.school ?? "neutral"}
            size={size}
            {...(item!.count === undefined ? {} : { count: item!.count })}
            {...(item!.keycap === undefined ? {} : { keycap: item!.keycap })}
            active={item!.active ?? false}
          />
        ) : (
          <EmptySlot key={index} size={size} />
        );
      })}
    </div>
  );
}

/** Worn-gear slots (head/chest/hands/…): one atomic grid, painted icons, themed from tokens. */
export function EquipmentSlots(props: SlotGridProps) {
  return <SlotGrid category="equipment" {...props} />;
}
/** Weapon loadout slots. */
export function WeaponSlots(props: SlotGridProps) {
  return <SlotGrid category="weapon" {...props} />;
}
/** Armor piece slots. */
export function ArmorSlots(props: SlotGridProps) {
  return <SlotGrid category="armor" {...props} />;
}
/** Consumable (health/shield potion) slots. */
export function PotionSlots(props: SlotGridProps) {
  return <SlotGrid category="potion" {...props} />;
}
