import { useCallback, useEffect, type ReactNode } from "react";

import { NOTICE_TONE_CUES, uiCueSoundId } from "@jgengine/core/audio/uiCues";
import type { NoticePresentationConfig } from "@jgengine/core/game/playableGame";
import { attachRefusalNotices } from "@jgengine/core/game/notices";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { HudInteractProvider, type HudInteractEvent } from "@jgengine/react/hudInteract";
import { NoticeStack } from "@jgengine/react/notices";
import { playUiCue, uiCueForInteraction } from "@jgengine/react/uiCues";

/**
 * Wire `ctx.game.notices` for the player: refused commands with a `message` become deny notices, each new
 * notice plays its tone's UI cue unless pushed `silent`, and the default stack renders it. Returns the detach function.
 * @internal
 */
export function attachShellNotices(ctx: GameContext, config: NoticePresentationConfig = {}): () => void {
  const notices = ctx.game.notices;
  notices.retune(config);
  const detachRefusals = config.refusals === false
    ? () => undefined
    : attachRefusalNotices(ctx.game.events, notices, { localUserId: () => ctx.player.userId });
  const detachCues = config.cues === false
    ? () => undefined
    : notices.onPush((notice) => {
        if (notice.silent !== true) ctx.game.audio.play(uiCueSoundId(NOTICE_TONE_CUES[notice.tone]));
      });
  return () => {
    detachRefusals();
    detachCues();
  };
}

/** The shell-mounted notice feed, rendered inside the HUD theme root; `playable.notices: false` removes it. @internal */
export function ShellNotices({
  ctx,
  config,
  scale,
}: {
  ctx: GameContext;
  config: NoticePresentationConfig | false | undefined;
  scale: number;
}) {
  const enabled = config !== false;
  const settings = config === false ? undefined : config;
  useEffect(() => (enabled ? attachShellNotices(ctx, settings) : undefined), [ctx, enabled, settings]);
  if (!enabled || settings?.hidden === true) return null;
  return (
    <NoticeStack
      feed={ctx.game.notices}
      placement={settings?.placement ?? "top"}
      offset={settings?.offset}
      avoidHud={settings?.avoidHud ?? true}
      zIndex={settings?.zIndex ?? 85}
      scale={scale}
    />
  );
}

/**
 * Plays the UI cue for every engine HUD primitive interaction below it (button activate/hover, panel
 * open/close), so `HudButton`, `HudSurface`, windows and action slots sound without per-button wiring.
 * Off with `audio.hudCues: false` (notice sounds are separate: `notices.cues`); `audio.uiCues` silences individual cues.
 * @internal
 */
export function ShellUiCues({ ctx, enabled, children }: { ctx: GameContext; enabled: boolean; children?: ReactNode }) {
  const onInteract = useCallback(
    (event: HudInteractEvent) => {
      const cue = uiCueForInteraction(event);
      if (cue !== null) playUiCue(ctx, cue);
    },
    [ctx],
  );
  if (!enabled) return <>{children}</>;
  return <HudInteractProvider onInteract={onInteract}>{children}</HudInteractProvider>;
}
