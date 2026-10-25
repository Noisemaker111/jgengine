/** Flat tray behind Store tab buttons. */
export const TABLET_SEGMENTED_TAB_TRAY_CLASS =
  "flex min-w-0 flex-1 flex-row overflow-visible rounded-2xl bg-black/40 p-1";

export function tabletTabButtonClass(active: boolean, allowed: boolean, highlighted: boolean): string {
  return [
    "relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl transition-all duration-300",
    active
      ? "bg-emerald-500 py-2 text-white shadow-lg shadow-emerald-500/20"
      : "scale-[0.97] bg-transparent py-1.5 text-white/60 hover:bg-white/10 hover:text-white",
    !allowed ? "pointer-events-none opacity-30" : "",
    highlighted ? "ring-1 ring-brand-teal/70" : "",
  ]
    .filter((segment) => segment.length > 0)
    .join(" ");
}

export const TABLET_STORE_TABS_SHELL_CLASS =
  "overflow-visible border-b border-white/5 bg-zinc-950/90 px-3 pb-2.5 pt-6";

export const TABLET_STORE_TAB_LABEL_CLASS =
  "whitespace-nowrap px-0.5 font-game font-bold uppercase tracking-tighter text-[10px]";

export const TABLET_STORE_TAB_LABEL_ACTIVE_CLASS = "text-[11px]";