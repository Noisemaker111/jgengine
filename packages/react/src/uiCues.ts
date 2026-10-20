import { useCallback } from "react";

import { uiCueSoundId, type UiCue } from "@jgengine/core/audio/uiCues";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { useOptionalGameContext } from "./provider";

export type { UiCue } from "@jgengine/core/audio/uiCues";

/** Play UI cue `cue` through the game's audio seam (`ui.<cue>` in the shell catalog). No-op outside a game. */
export function playUiCue(ctx: Pick<GameContext, "game"> | null, cue: UiCue): void {
  ctx?.game.audio.play(uiCueSoundId(cue));
}

/**
 * Returns a stable `cue(name)` that plays a UI sound: click, hover, open, close, confirm, deny, notify.
 * The shell ships soft procedural defaults on the "ui" bus (volume in Settings, muted with master);
 * a game replaces one by declaring `audio.sounds["ui.click"]` or `audio.uiCues`. Safe outside a GameProvider.
 *
 * @capability ui-sound-cues play click/hover/open/close/confirm/deny/notify UI sounds from any component
 */
export function useUiCue(): (cue: UiCue) => void {
  const ctx = useOptionalGameContext();
  return useCallback((cue: UiCue) => playUiCue(ctx, cue), [ctx]);
}
