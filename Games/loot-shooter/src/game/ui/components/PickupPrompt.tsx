import { useNearestWorldItem } from "@jgengine/react/hooks";
import { itemNameById } from "../../content";
import { weaponById } from "../../items/weapons/catalog";
import { RARITY_COLORS } from "../../palette";

export function PickupPrompt() {
  const nearest = useNearestWorldItem(2.6);
  if (nearest === null) return null;
  const weapon = weaponById(nearest.itemId);
  const color = weapon === undefined ? "#b8c0cc" : RARITY_COLORS[weapon.rarity];
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-600/50 bg-slate-950/85 px-3 py-1.5 shadow-lg backdrop-blur-sm">
      <span className="rounded-sm border border-slate-500 bg-slate-800 px-1.5 text-sm font-black text-slate-100">E</span>
      <span className="text-sm font-bold uppercase tracking-wider" style={{ color }}>
        {weapon === undefined ? itemNameById(nearest.itemId) : weapon.name}
      </span>
      {weapon !== undefined ? (
        <span className="text-xs font-semibold uppercase text-slate-400">
          {weapon.rarity} · {weapon.weapon.damage} dmg
        </span>
      ) : null}
    </div>
  );
}
