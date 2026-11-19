import { FRAME_RATE_LIMIT_DISPLAY, FRAME_RATE_LIMIT_UNCAPPED } from "./frameRateLimit";
import { SETTING_IDS, type SettingOption, type SettingsStore } from "./settingsModel";

export type DesktopPresentMode = "vsync" | "uncapped";

export interface DesktopFrameRate {
  /** How this launch presents; WebView2 reads its vsync flags only when it starts. */
  running: DesktopPresentMode;
  saved: DesktopPresentMode;
  forced: boolean;
}

export interface DesktopShell {
  frameRate: DesktopFrameRate;
  fullscreen: boolean;
  steamOverlay: boolean;
}

const presentMode = (value: unknown): DesktopPresentMode | null => (value === "vsync" || value === "uncapped" ? value : null);

export function readDesktopShell(scope: object = globalThis): DesktopShell | null {
  const shell: unknown = Reflect.get(scope, "__JG_DESKTOP__");
  if (typeof shell !== "object" || shell === null) return null;
  const frameRate: unknown = Reflect.get(shell, "frameRate");
  if (typeof frameRate !== "object" || frameRate === null) return null;
  const running = presentMode(Reflect.get(frameRate, "running"));
  const saved = presentMode(Reflect.get(frameRate, "saved"));
  if (running === null || saved === null) return null;
  return {
    frameRate: { running, saved, forced: Reflect.get(frameRate, "forced") === true },
    fullscreen: Reflect.get(shell, "fullscreen") === true,
    steamOverlay: Reflect.get(shell, "steamOverlay") === true,
  };
}

export async function invokeDesktop(command: string, args: Record<string, unknown>, scope: object = globalThis): Promise<boolean> {
  const internals: unknown = Reflect.get(scope, "__TAURI_INTERNALS__");
  const invoke: unknown = typeof internals === "object" && internals !== null ? Reflect.get(internals, "invoke") : undefined;
  if (typeof invoke !== "function") return false;
  await Reflect.apply(invoke, internals, [command, args]);
  return true;
}

export const DISPLAY_MODE_WINDOWED = "windowed";
export const DISPLAY_MODE_FULLSCREEN = "fullscreen";

export const DISPLAY_MODE_OPTIONS: readonly SettingOption[] = [
  { value: DISPLAY_MODE_WINDOWED, label: "Windowed" },
  { value: DISPLAY_MODE_FULLSCREEN, label: "Fullscreen" },
];

export function saveDesktopDisplayMode(value: unknown, scope: object = globalThis): Promise<boolean> {
  return invokeDesktop("set_fullscreen", { fullscreen: value === DISPLAY_MODE_FULLSCREEN }, scope);
}

export function desktopPresentMode(value: unknown): DesktopPresentMode {
  return value === FRAME_RATE_LIMIT_UNCAPPED ? "uncapped" : "vsync";
}

export function saveDesktopFrameRate(value: unknown, scope: object = globalThis): Promise<boolean> {
  return invokeDesktop("set_frame_rate", { mode: desktopPresentMode(value) }, scope);
}

/**
 * Bring the player's stored Frame rate limit and Display mode in line with what the desktop shell
 * launched with: the shell's saved files decide a launch, so a store that disagrees (cleared, or
 * written by an older build) would show a choice the game is not running.
 */
export function syncDesktopSettings(store: SettingsStore, desktop: DesktopShell | null): void {
  if (desktop === null) return;
  const frameRate = store.get<string>(SETTING_IDS.graphicsFrameRateLimit, FRAME_RATE_LIMIT_DISPLAY);
  if (desktopPresentMode(frameRate) !== desktop.frameRate.saved) {
    store.set(SETTING_IDS.graphicsFrameRateLimit, desktop.frameRate.saved === "uncapped" ? FRAME_RATE_LIMIT_UNCAPPED : FRAME_RATE_LIMIT_DISPLAY);
  }
  const displayMode = desktop.fullscreen ? DISPLAY_MODE_FULLSCREEN : DISPLAY_MODE_WINDOWED;
  if (store.get<string>(SETTING_IDS.graphicsDisplayMode, displayMode) !== displayMode) store.set(SETTING_IDS.graphicsDisplayMode, displayMode);
}
