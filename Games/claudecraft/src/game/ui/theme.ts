export const PANEL = "wcc-panel";

export const PANEL_TITLE =
  "wcc-title flex items-center justify-between gap-4 border-b border-[#463a1c] px-4 py-2.5 text-[15px]";

export const CLOSE_BUTTON =
  "rounded-[3px] border border-[#463a1c] bg-[#1a1410] px-2 py-0.5 text-[#c9b27a] hover:text-[#ffd100]";

export const BUTTON = "wcc-btn px-3 py-1 text-xs font-semibold";

export const QUALITY_COLORS: Record<string, string> = {
  poor: "text-stone-400",
  common: "text-stone-100",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-purple-400",
};

export const RESOURCE_COLORS: Record<string, string> = {
  mana: "bg-[#2b7bd4]",
  rage: "bg-[#c0392b]",
  energy: "bg-[#e4c531]",
};

export function copperLabel(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const rest = copper % 100;
  if (gold > 0) return `${gold}g ${silver}s ${rest}c`;
  if (silver > 0) return `${silver}s ${rest}c`;
  return `${rest}c`;
}
