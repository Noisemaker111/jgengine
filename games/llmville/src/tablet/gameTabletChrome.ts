import { TABLET_APP_ID, type TabletAppId } from "@/tablet/tabletIds";

/** Fixed viewport slot for the physical tablet frame (centered toward player-right on desktop). */
export const GAME_TABLET_VIEWPORT_CLASS =
  "fixed bottom-0 left-1/2 h-[min(780px,85dvh)] w-[min(580px,calc(100vw-1.5rem))] -translate-x-1/2 pointer-events-none overflow-hidden lg:left-[min(72%,calc(100%-302px))]";

export const GAME_TABLET_TOUCH_VIEWPORT_CLASS =
  "fixed inset-x-0 bottom-0 h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-0.25rem))] w-full pointer-events-none overflow-hidden";

/** Dev/workbench: tablet positioned inside a monitor or phone frame (not viewport-fixed). */
export const GAME_TABLET_EMBEDDED_VIEWPORT_CLASS =
  "absolute bottom-0 left-[72%] h-[78%] w-[min(580px,55%)] -translate-x-1/2 pointer-events-none overflow-hidden";

export const GAME_TABLET_EMBEDDED_TOUCH_VIEWPORT_CLASS =
  "absolute inset-x-0 bottom-0 h-[92%] w-full pointer-events-none overflow-hidden";

function gameTabletBottomFlush(collapsed: boolean): boolean {
  return collapsed;
}

/** Top corners only — bottom stays square flush with the screen in every state. */
export function gameTabletCornerRadiusClass(isTouch: boolean): string {
  return isTouch ? "rounded-t-[1.75rem] rounded-b-none" : "rounded-t-4xl rounded-b-none";
}

export function gameTabletViewportClass(
  isTouch: boolean,
  _collapsed: boolean,
  embedded = false,
): string {
  const base = embedded
    ? isTouch
      ? GAME_TABLET_EMBEDDED_TOUCH_VIEWPORT_CLASS
      : GAME_TABLET_EMBEDDED_VIEWPORT_CLASS
    : isTouch
      ? GAME_TABLET_TOUCH_VIEWPORT_CLASS
      : GAME_TABLET_VIEWPORT_CLASS;
  return `${base} ${gameTabletCornerRadiusClass(isTouch)}`;
}

/** Outer shell: size, slide animation, pointer-events when the tablet is interactable. */
export function gameTabletShellMotionClass(interactable: boolean): string {
  return [
    "relative h-full w-full transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1)",
    interactable ? "pointer-events-auto" : "pointer-events-none",
  ].join(" ");
}

/** Bezel only — box-shadow was painting a rectangular halo clipped at the top corners. */
export function gameTabletFrameClass(isTouch: boolean, collapsed: boolean): string {
  const bottomFlush = gameTabletBottomFlush(collapsed);
  const radius = gameTabletCornerRadiusClass(isTouch);
  const border = isTouch
    ? bottomFlush
      ? "border-4 border-b-0"
      : "border-4"
    : bottomFlush
      ? "border-[6px] border-b-0"
      : "border-[6px]";
  return [
    "relative flex h-full w-full flex-col overflow-hidden border-[#1a1a1e] bg-brand-ink transition-[border-radius] duration-700 cubic-bezier(0.16, 1, 0.3, 1)",
    radius,
    border,
  ].join(" ");
}

export const GAME_TABLET_NOTCH_BAR_CLASS =
  "absolute top-0 left-1/2 z-50 flex h-7 w-28 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-b-2xl bg-[#1a1a1e] active:cursor-grabbing max-sm:h-10 max-sm:w-40";

export const GAME_TABLET_NOTCH_GRIP_CLASS =
  "h-1 w-10 rounded-full bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]";

export const GAME_TABLET_NOTCH_DOT_CLASS =
  "sr-only";

export const GAME_TABLET_STATUS_ROW_CLASS =
  "relative flex w-full shrink-0 min-h-[2.5rem] items-center justify-between pt-3 pb-1 px-10 z-40";

export const GAME_TABLET_CLOCK_ROW_CLASS =
  "text-xs font-bold tracking-widest text-white/90 flex items-center gap-2";

export const GAME_TABLET_STATUS_ICONS_ROW_CLASS = "flex items-center gap-3 text-white";

export const GAME_TABLET_BATTERY_SHELL_CLASS =
  "w-6 h-3 border border-white/60 rounded-sm relative p-px";

export const GAME_TABLET_BATTERY_FILL_CLASS = "h-full w-5 bg-white rounded-[0.5px]";

/** Main scroll stack under the status row (home grid + app sheet). */
export const GAME_TABLET_BODY_CLASS = "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-brand-ink";

/** Cellular signal bars SVG path (20×20). */
export const GAME_TABLET_STATUS_SIGNAL_PATH =
  "M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z";

/** Wi-Fi glyph SVG path (20×20). */
export const GAME_TABLET_STATUS_WIFI_PATH =
  "M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7a1 1 0 011.414-1.414L10 14.586l6.293-6.293a1 1 0 011.414 0z";

const GAME_TABLET_APP_LAYER_BASE_CLASS =
  "absolute inset-0 z-40 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] translate-y-0";

export function tabletAppLayerBgClass(isModelsTheme: boolean): string {
  return `${GAME_TABLET_APP_LAYER_BASE_CLASS} ${isModelsTheme ? "bg-brand-ink" : "bg-brand-ink"}`;
}

export function tabletAppHeaderRowClass(
  activeTabletApp: TabletAppId | null,
  isModelsTheme: boolean,
): string {
  const store = activeTabletApp === TABLET_APP_ID.store;
  const bg = store
    ? "bg-brand-ink"
    : `${isModelsTheme ? "bg-brand-ink/95" : "bg-brand-ink/95"} backdrop-blur-xl`;
  const border = store ? "" : "border-b border-white/10";
  return ["relative flex min-h-[3rem] items-center px-6 py-2.5", bg, border]
    .filter((segment) => segment.length > 0)
    .join(" ");
}

export const GAME_TABLET_SPEND_PULSE_CLASS =
  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-game font-black text-lg uppercase tracking-[0.2em] text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.8)] pointer-events-none animate-spend-float";

export const GAME_TABLET_BACK_BUTTON_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:text-white active:bg-white/20";

export const GAME_TABLET_BACK_CHEVRON_PATH = "M15 6l-6 6 6 6";

export function gameTabletAppTitleClass(isModelsTheme: boolean): string {
  return `m-0 text-xl font-bold leading-none text-white tracking-tight ${isModelsTheme ? "uppercase" : ""}`.trim();
}

export function tabletAppScrollAreaClass(isModelsTheme: boolean): string {
  const parts = [
    "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 scrollbar-none overscroll-contain",
  ];
  if (isModelsTheme) {
    parts.push("border-r border-white/10 shadow-[inset_-2px_0_12px_rgba(255,255,255,0.04)]");
  }
  return parts.join(" ");
}

export const GAME_TABLET_HOME_GRID_CLASS =
  "grid min-h-0 flex-1 grid-cols-3 sm:grid-cols-4 content-start gap-x-3 gap-y-5 overflow-y-auto overscroll-contain px-4 pb-8 pt-5 scrollbar-none";

export function tabletHomeAppButtonClass(allowed: boolean): string {
  return [
    "flex flex-col items-center gap-2.5 group relative",
    !allowed ? "opacity-35 pointer-events-none" : "",
  ]
    .filter((segment) => segment.length > 0)
    .join(" ");
}

export const GAME_TABLET_APP_ICON_TILE_CLASS =
  "relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/15 shadow-md transition-transform group-hover:-translate-y-1 group-active:scale-95";

export const GAME_TABLET_APP_ICON_GRADIENT_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/[0.22] via-transparent to-black/[0.38]";

export const GAME_TABLET_APP_ICON_HIGHLIGHT_CLASS =
  "pointer-events-none absolute inset-x-0 top-0 h-[46%] rounded-t-lg bg-gradient-to-b from-white/40 to-transparent opacity-80";

export const GAME_TABLET_APP_ICON_SVG_CLASS =
  "relative z-10 h-8 w-8 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:scale-[1.04]";

export const GAME_TABLET_APP_LABEL_CLASS =
  "text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] transition-[color,filter] duration-200 group-hover:drop-shadow-[0_2px_4px_rgba(0,0,0,0.75)]";

export const GAME_TABLET_SCAN_LINE_CLASS = "game-scanning-line opacity-5";
