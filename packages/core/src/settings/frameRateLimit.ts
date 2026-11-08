import type { DesktopFrameRate, DesktopPresentMode } from "./desktopShell";
import { SETTING_IDS, type SettingOption, type SettingsStore } from "./settingsModel";

/** Stored value for "render every display refresh" — the browser's vsync-locked rate. */
export const FRAME_RATE_LIMIT_DISPLAY = "display";

/**
 * Stored value for "present without the display's vsync". Only a desktop build (`jgengine desktop`)
 * offers it: a browser always presents on vsync, and WebView2 takes the flags at launch.
 */
export const FRAME_RATE_LIMIT_UNCAPPED = "uncapped";

/**
 * Frame-rate limit choices. Browsers always present on the display's vsync, so the uncapped
 * option runs at the monitor's refresh rate; the numeric caps skip refreshes to save GPU and battery.
 */
export const FRAME_RATE_LIMIT_OPTIONS: readonly SettingOption[] = [
  { value: FRAME_RATE_LIMIT_DISPLAY, label: "V-Sync" },
  { value: "30", label: "30" },
  { value: "60", label: "60" },
  { value: "120", label: "120" },
  { value: "144", label: "144" },
];

/**
 * The frame-rate limit choices for this page: the browser's list, or on a desktop build "Match
 * display (V-Sync)", the caps and "Uncapped". A choice that switches vsync says it applies after a
 * restart, since WebView2 takes the flags only at launch.
 */
export function frameRateLimitOptions(desktop: DesktopFrameRate | null): readonly SettingOption[] {
  if (desktop === null) return FRAME_RATE_LIMIT_OPTIONS;
  const note = (mode: DesktopPresentMode): string => {
    if (desktop.running === mode) return "";
    return desktop.forced ? " (not while --uncapped)" : " (after restart)";
  };
  return [
    { value: FRAME_RATE_LIMIT_DISPLAY, label: `Match display (V-Sync)${note("vsync")}` },
    ...FRAME_RATE_LIMIT_OPTIONS.filter((option) => option.value !== FRAME_RATE_LIMIT_DISPLAY),
    { value: FRAME_RATE_LIMIT_UNCAPPED, label: `Uncapped${note("uncapped")}` },
  ];
}

/** The player's frame-rate cap in frames per second, or 0 for the display rate (or uncapped). */
export function readFrameRateLimit(store: Pick<SettingsStore, "get">): number {
  const raw = store.get(SETTING_IDS.graphicsFrameRateLimit, FRAME_RATE_LIMIT_DISPLAY);
  const fps = Number(raw);
  return Number.isFinite(fps) && fps > 0 ? fps : 0;
}

/**
 * Frame pacing for a capped render loop driven by display refreshes. Returns the new frame
 * anchor when a frame should render at `now`, or `null` to skip this refresh. The anchor keeps
 * the remainder so a 60 cap on a 144 Hz display averages 60 instead of drifting to 48.
 */
export function paceFrame(now: number, anchor: number, fps: number): number | null {
  if (fps <= 0) return now;
  const interval = 1000 / fps;
  const elapsed = now - anchor;
  // Half a millisecond of slack absorbs rAF timestamp jitter so a 60 cap on 60 Hz never skips.
  if (elapsed < interval - 0.5) return null;
  if (elapsed > interval * 4) return now;
  return anchor + Math.max(1, Math.floor((elapsed + 0.5) / interval)) * interval;
}
