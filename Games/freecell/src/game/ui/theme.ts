import type { CSSProperties } from "react";

// Card geometry as CSS custom properties so cascades fan and everything scales
// with one clamp. 8 columns of --card-w must fit the narrowest phone.
export const CARD_VARS = {
  "--card-w": "clamp(2.4rem, 8.2vw, 4.25rem)",
  "--card-h": "calc(var(--card-w) * 1.4)",
  "--fan": "calc(var(--card-w) * 0.42)",
} as unknown as CSSProperties;

export const feltPanel =
  "rounded-2xl border border-slate-300/25 bg-[linear-gradient(160deg,#123262_0%,#0c2247_55%,#081a38_100%)] p-[calc(var(--card-w)*0.35)] shadow-[0_18px_48px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(226,232,240,0.14)] ring-1 ring-inset ring-sky-200/10";

export const chromePanel =
  "rounded-xl border border-slate-300/20 bg-slate-950/75 p-3 text-slate-200 shadow-lg backdrop-blur-md";

export const btn =
  "pointer-events-auto inline-flex items-center gap-1 rounded-md border border-slate-300/25 bg-slate-800/70 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-sky-300/60 hover:bg-slate-700/80 disabled:cursor-default disabled:opacity-35 disabled:hover:border-slate-300/25 disabled:hover:bg-slate-800/70";

export const btnActive =
  "pointer-events-auto inline-flex items-center gap-1 rounded-md border border-sky-300/70 bg-sky-500/25 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-100 shadow-[0_0_12px_-2px_rgba(56,189,248,0.6)] transition";

export const keyBadge =
  "rounded bg-slate-900/80 px-1 text-[10px] font-bold leading-4 text-slate-400 ring-1 ring-inset ring-slate-300/20";

export const statLabel = "text-[10px] font-semibold uppercase tracking-widest text-slate-400";
export const statValue = "font-mono text-base font-bold tabular-nums text-slate-100";

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
