import type { ComponentType, ReactNode } from "react";
import type { PlayableGameContract, ProbeReadings, WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { HudTheme } from "@jgengine/core/hud/hudTheme.view";
import type { UiKit } from "@jgengine/core/ui/kit/uiKit.view";
import type { UiKitName } from "@jgengine/core/ui/kit/uiKits.view";
import type { GameHealthConfig } from "@jgengine/core/health/runtimeHealth";
import type { CrashReport } from "@jgengine/core/health/crashSeam";
import type { ViewmodelProps } from "@jgengine/core/camera/GameFirstPersonCamera.draw";

export type RenderEntity = (entity: SceneEntity) => ReactNode;
export type RenderObject = (object: SceneObject) => ReactNode;

/** Props the game's own error screen receives when the UI or the tick fails. `report` is the scrubbed report the reporter got, or null when the seam dropped it as a duplicate. */
export type GameErrorScreenProps = { report: CrashReport | null; phase: string; retry: () => void };

/** Crash, telemetry and auto-quality config plus the game's own recoverable error screen. */
export interface GameHealth extends GameHealthConfig {
  /** Rendered over the game when a UI render or the tick fails, so the player sees the game's own screen and can retry. Unset keeps the engine's diagnostic overlay only. */
  errorScreen?: ComponentType<GameErrorScreenProps>;
}

/**
 * The concrete React-bound playable a shell `defineGame` returns and `GameHost` mounts — the one PlayableGame games
 * handle. `TProbe` is what the game's `capture.probe` returns, so a proof flow over `typeof game` names only real probes.
 */
export type PlayableGame<TProbe extends ProbeReadings = ProbeReadings> = PlayableGameContract<
  ComponentType,
  ComponentType,
  RenderEntity,
  RenderObject,
  ComponentType<ViewmodelProps>,
  ComponentType<WorldOverlayProps>,
  TProbe
> & {
  /** HUD theme the shell applies at the `GameUI` root. Unset uses `defaultHudTheme`; `false` opts out of the default theme and the engine's generic HUD control styling. A theme the game sets inside `GameUI` still wins. */
  hudTheme?: HudTheme | false | undefined;
  /**
   * The game's UI kit: a complete visual language (shapes, type, motion, sound) for every kit part and
   * engine screen — a built-in name (`ink`, `paper`, `parchment`, `terminal`, `holo`, `broadcast`,
   * `arcade`, `signal`) or `customizeKit(UI_KITS.ink, { ... })`. Its cue sounds replace the default UI sounds.
   */
  uiKit?: UiKitName | UiKit | undefined;
  /** Runtime health: injected crash reporter and telemetry sink, auto quality thresholds, the game's error screen. Every part is off unless set. */
  health?: GameHealth | undefined;
};

export type GameRegistry = Record<string, () => Promise<PlayableGame>>;

export function resolveGameLoader(
  registry: GameRegistry,
  gameId: string,
  fallbackGameId?: string,
): (() => Promise<PlayableGame>) | undefined {
  return registry[gameId] ?? (fallbackGameId === undefined ? undefined : registry[fallbackGameId]);
}
