import { SlotGrid } from "@jgengine/react/components";
import { useDisplayProfile } from "@jgengine/react/display";
import { useStore } from "@jgengine/react/store";
import { itemNameById } from "../../content";
import { weaponById } from "../../items/weapons/catalog";
import { RARITY_COLORS } from "../../palette";
import { selectedSlotStore } from "../../run/stores";
import { WeaponIcon } from "./icons";

export function Hotbar() {
  const selected = useStore(selectedSlotStore);
  const { compact } = useDisplayProfile();
  const slotSize = compact ? "h-11 w-11" : "h-14 w-16";
  const iconSize = compact ? "h-5 w-8" : "h-8 w-12";
  return (
    <SlotGrid
      inventoryId="hotbar"
      className="flex gap-2"
      renderSlot={(slot, index) => {
        const isSelected = index === selected;
        const frame = isSelected
          ? "border-cyan-300 bg-slate-900/90 shadow-[0_0_14px_rgba(56,225,255,0.35)]"
          : "border-slate-600/60 bg-slate-950/70";
        if (slot === null) {
          return (
            <div className={`relative flex ${slotSize} items-center justify-center rounded-md border ${frame}`}>
              <span className="absolute left-1.5 top-0.5 text-xs font-bold text-slate-400">{index + 1}</span>
              <span className="text-lg font-light text-slate-600">—</span>
            </div>
          );
        }
        const weapon = weaponById(slot.itemId);
        const rarityColor = weapon === undefined ? "#b8c0cc" : RARITY_COLORS[weapon.rarity];
        return (
          <div
            title={itemNameById(slot.itemId)}
            className={`relative flex ${slotSize} items-center justify-center rounded-md border ${frame}`}
            style={{ borderBottomColor: rarityColor, borderBottomWidth: 3, color: rarityColor }}
          >
            <span className="absolute left-1.5 top-0.5 text-xs font-bold text-cyan-200/90">{index + 1}</span>
            {weapon === undefined ? (
              <span className="text-sm font-bold text-slate-200">{itemNameById(slot.itemId).slice(0, 2)}</span>
            ) : (
              <WeaponIcon family={weapon.family} className={iconSize} />
            )}
          </div>
        );
      }}
    />
  );
}
