export const PANEL =
  "rounded-lg border border-amber-900/60 bg-stone-950/92 shadow-[0_8px_32px_rgba(0,0,0,0.6)] text-amber-50";

export const PANEL_TITLE =
  "flex items-center justify-between gap-4 border-b border-amber-900/50 px-4 py-2.5 font-semibold tracking-wide text-amber-200";

export const CLOSE_BUTTON =
  "rounded px-2 py-0.5 text-amber-300/80 hover:bg-amber-900/40 hover:text-amber-100";

export const QUALITY_COLORS: Record<string, string> = {
  poor: "text-stone-400",
  common: "text-stone-100",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-purple-400",
};

export const RESOURCE_COLORS: Record<string, string> = {
  mana: "bg-sky-500",
  rage: "bg-red-600",
  energy: "bg-yellow-400",
};

export function copperLabel(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const rest = copper % 100;
  if (gold > 0) return `${gold}g ${silver}s ${rest}c`;
  if (silver > 0) return `${silver}s ${rest}c`;
  return `${rest}c`;
}
