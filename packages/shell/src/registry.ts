import type { ComponentType, ReactNode } from "react";
import type { PlayableGameContract, ProbeReadings, WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { HudTheme } from "@jgengine/core/hud/hudTheme.view";
import type { UiKit } from "@jgengine/core/ui/kit/uiKit.view";
import type { UiKitName } from "@jgengine/core/ui/kit/uiKits.view";
import type { ViewmodelProps } from "@jgengine/core/camera/GameFirstPersonCamera.draw";

export type RenderEntity = (entity: SceneEntity) => ReactNode;
export type RenderObject = (object: SceneObject) => ReactNode;

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
  hudTheme?: HudTheme | false;
  /**
   * The game's UI kit: a complete visual language (shapes, type, motion, sound) for every kit part and
   * engine screen — a built-in name (`ink`, `paper`, `parchment`, `terminal`, `holo`, `broadcast`,
   * `arcade`, `signal`) or `customizeKit(UI_KITS.ink, { ... })`. Its cue sounds replace the default UI sounds.
   */
  uiKit?: UiKitName | UiKit;
};

export type GameRegistry = Record<string, () => Promise<PlayableGame>>;

export function resolveGameLoader(
  registry: GameRegistry,
  gameId: string,
  fallbackGameId?: string,
): (() => Promise<PlayableGame>) | undefined {
  return registry[gameId] ?? (fallbackGameId === undefined ? undefined : registry[fallbackGameId]);
}
