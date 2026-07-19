import { useEntityStat, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { iconForItemId } from "@jgengine/react/gameIcons";
import { IconTreatment, schoolForItem } from "@jgengine/react/iconTreatment";
import { hudThemeVars, resolveHudTheme } from "@jgengine/react/hudTheme";
import { slotStore } from "../../commands";
import { AMMO_STAT_IDS, weaponById } from "../../items/weapons/catalog";
import { ITEM_LABELS } from "../../content";

export function Hotbar() {
  const { userId } = usePlayer();
  const slots = useInventory("hotbar");
  const selected = useStore(slotStore, (v) => v ?? 0);
  const ammo9 = useEntityStat(userId, "ammo_9mm");
  const ammoShell = useEntityStat(userId, "ammo_shell");

  // #1034: one prop themes the painted slot icons below. A shipped game would author its own
  // HudTheme (see tower-guard's fieldkitVars); the "sandbox-slot" preset matches Vice Isle's
  // chunky black-bordered look and is a fine scaffold default.
  return (
    <div className="flex items-end gap-2" style={hudThemeVars(resolveHudTheme("sandbox-slot"))}>
      {[0, 1, 2, 3].map((index) => {
        const slot = slots[index];
        const itemId = slot?.itemId ?? null;
        const weapon = itemId !== null ? weaponById(itemId) : undefined;
        const ammoStat = weapon !== undefined && weapon.ammo !== "none" ? AMMO_STAT_IDS[weapon.ammo] : null;
        const ammoValue = ammoStat === "ammo_9mm" ? ammo9?.current : ammoStat === "ammo_shell" ? ammoShell?.current : null;
        const active = index === selected;
        return (
          <div
            key={index}
            className={`w-24 -skew-x-6 border-2 border-black px-2 py-1 shadow-[3px_3px_0_#000] ${
              active ? "bg-[#ffb020] text-black" : "bg-[#12141a]/85 text-[#cfd6de]"
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-black">
              <span>{index + 1}</span>
              {ammoValue !== null && ammoValue !== undefined ? <span className="tabular-nums">{ammoValue}</span> : null}
            </div>
            <div className="my-1 flex justify-center">
              {itemId !== null ? (
                <IconTreatment icon={iconForItemId(itemId) ?? "gun"} school={schoolForItem(itemId)} size={34} />
              ) : (
                <div className="h-[34px]" />
              )}
            </div>
            <div className="truncate text-[11px] font-black uppercase leading-tight">
              {itemId !== null ? (ITEM_LABELS[itemId] ?? itemId) : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
