import { useSyncExternalStore } from "react";
import { HOTBAR_ITEMS } from "../blocks";
import { colorFromId } from "../colors";
import { getSelectedSlot, selectSlot, subscribeSelection } from "../selection";
import { CubeIcon, PickaxeIcon } from "./icons";

export function Hotbar() {
  const selected = useSyncExternalStore(subscribeSelection, getSelectedSlot, getSelectedSlot);
  const active = HOTBAR_ITEMS[selected];

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      <div className="rounded bg-black/45 px-3 py-1 text-sm font-medium tracking-wide text-white/90 shadow">
        {active?.label}
        <span className="ml-2 text-white/55">{selected === 0 ? "Mine" : "Build"}</span>
      </div>
      <div className="flex gap-1.5">
        {HOTBAR_ITEMS.map((item, index) => {
          const isSelected = index === selected;
          return (
            <div
              key={item.id}
              onPointerDown={() => selectSlot(index)}
              className={`relative h-12 w-12 rounded-md p-1.5 ring-2 transition pointer-events-auto ${
                isSelected ? "bg-black/60 ring-amber-300" : "bg-black/35 ring-white/10"
              }`}
            >
              {item.kind === "tool" ? <PickaxeIcon /> : <CubeIcon color={colorFromId(item.id)} />}
              <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-white/70">
                {index + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
