import { useCallback } from "@jgengine/core/ui/jsx";

import { UI_CUES, uiCueSoundId, type UiCue } from "@jgengine/core/ui/uiCues";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { HudInteractEvent } from "@jgengine/core/hud/hudInteract.view";
import { useOptionalGameContext } from "@jgengine/ui/provider";

export type { UiCue } from "@jgengine/core/ui/uiCues";

export function playUiCue(ctx: Pick<GameContext, "game"> | null, cue: UiCue): void {
  ctx?.game.audio.play(uiCueSoundId(cue));
}

/** @capability ui-sound-cues play click/hover/open/close/confirm/deny/notify UI sounds from any component */
export function useUiCue(): (cue: UiCue) => void {
  const ctx = useOptionalGameContext();
  return useCallback((cue: UiCue) => playUiCue(ctx, cue), [ctx]);
}

/**
 * The UI cue an engine HUD primitive interaction plays, or `null` for none: activating plays the
 * primitive's `cue` when it names a {@link UiCue} (e.g. `cue="confirm"`), else `click`; hovering a
 * button or action slot plays `hover`; panels and windows play `open`/`close`. Press and focus are silent.
 */
export function uiCueForInteraction(event: HudInteractEvent): UiCue | null {
  switch (event.kind) {
    case "activate":
      return event.cue !== undefined && (UI_CUES as readonly string[]).includes(event.cue) ? (event.cue as UiCue) : "click";
    case "hover":
      return event.source === "button" || event.source === "action" ? "hover" : null;
    case "open":
      return "open";
    case "close":
      return "close";
    default:
      return null;
  }
}
