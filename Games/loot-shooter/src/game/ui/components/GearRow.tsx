import { useInventory } from "@jgengine/react/hooks";
import { GrenadeIcon, MedkitIcon } from "./icons";

function countOf(slots: readonly ({ itemId: string; count: number } | null)[], ids: readonly string[]): number {
  return slots.reduce((sum, slot) => (slot !== null && ids.includes(slot.itemId) ? sum + slot.count : sum), 0);
}

export function GearRow() {
  const backpack = useInventory("backpack");
  const grenades = countOf(backpack, ["frag_grenade"]);
  const medkits = countOf(backpack, ["medkit_small", "medkit_large"]);

  return (
    <div className="flex gap-2">
      <div
        className={`relative flex h-11 w-13 items-center justify-center gap-1 rounded-md border px-2 ${
          grenades > 0 ? "border-amber-400/50 bg-slate-950/70 text-amber-300" : "border-slate-700/50 bg-slate-950/50 text-slate-600"
        }`}
      >
        <GrenadeIcon className="h-6 w-6" />
        <span className="text-sm font-black tabular-nums">{grenades}</span>
        <span className="absolute -top-2 left-1.5 rounded-sm bg-slate-800 px-1 text-[11px] font-bold text-slate-200">G</span>
      </div>
      <div
        className={`relative flex h-11 w-13 items-center justify-center gap-1 rounded-md border px-2 ${
          medkits > 0 ? "border-emerald-400/50 bg-slate-950/70 text-emerald-300" : "border-slate-700/50 bg-slate-950/50 text-slate-600"
        }`}
      >
        <MedkitIcon className="h-6 w-6" />
        <span className="text-sm font-black tabular-nums">{medkits}</span>
        <span className="absolute -top-2 left-1.5 rounded-sm bg-slate-800 px-1 text-[11px] font-bold text-slate-200">Q</span>
      </div>
    </div>
  );
}
