/**
 * Editor shell design tokens as Tailwind class constants. One place owns the layered dark theme
 * (app < panel < control elevation), text scale, and interaction states so every shell component
 * reads identically. Class strings are complete literals so the host app's Tailwind scan keeps them.
 */

export const APP_BG = "bg-[#0b0d10]";
export const PANEL_BG = "bg-[#111318]";
export const CONTROL_BG = "bg-[#191d24]";
export const FLOAT_BG = "bg-[#14171d]";
export const BORDER = "border-white/[0.07]";

export const TEXT = "text-[12px] text-neutral-300";
export const TEXT_MUTED = "text-[11px] text-neutral-500";
export const MICRO_LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500";

export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-0";

/** Base interactive control: compact, subtle border, hover elevation. */
export const CONTROL =
  `rounded-[5px] border border-white/[0.07] bg-[#191d24] text-neutral-300 transition-colors hover:bg-[#1f242d] hover:text-neutral-100 ${FOCUS_RING}`;

export const CONTROL_ACTIVE =
  "border-cyan-400/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/20";

export const INPUT_CLS =
  `rounded-[5px] border border-white/[0.08] bg-black/40 text-[12px] text-neutral-200 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400/50 focus:bg-black/60 ${FOCUS_RING}`;

export const NUMERIC = "tabular-nums";

export const AXIS_COLORS: Record<"x" | "y" | "z", { text: string; bar: string }> = {
  x: { text: "text-[#f87171]", bar: "bg-[#f87171]" },
  y: { text: "text-[#4ade80]", bar: "bg-[#4ade80]" },
  z: { text: "text-[#60a5fa]", bar: "bg-[#60a5fa]" },
};
