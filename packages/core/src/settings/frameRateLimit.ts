import { SETTING_IDS, type SettingOption, type SettingsStore } from "./settingsModel";

/** Stored value for "render every display refresh" — the browser's vsync-locked rate. */
export const FRAME_RATE_LIMIT_DISPLAY = "display";

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

/** The player's frame-rate cap in frames per second, or 0 for the display rate. */
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
