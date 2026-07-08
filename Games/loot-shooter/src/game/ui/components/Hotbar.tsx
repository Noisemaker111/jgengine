import { SlotGrid } from "@jgengine/react/components";
import { itemNameById } from "../../content";
import { GunIcon } from "./GunIcon";

export function Hotbar() {
  return (
    <SlotGrid
      inventoryId="hotbar"
      className="flex gap-2"
      renderSlot={(slot, index) => {
        const keyLabel = String(index + 1);
        if (slot === null) {
          return (
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-slate-600/50 bg-slate-900/60 text-slate-600">
              <span className="text-xl font-light">+</span>
            </div>
          );
        }
        return (
          <div
            title={itemNameById(slot.itemId)}
            className="relative flex h-14 w-14 items-center justify-center rounded-md border border-cyan-400/40 bg-slate-900/85 shadow-md"
          >
            <span className="absolute left-1 top-0.5 text-xs font-bold text-cyan-200/80">{keyLabel}</span>
            <GunIcon className="h-8 w-8 text-cyan-200" />
          </div>
        );
      }}
    />
  );
}
