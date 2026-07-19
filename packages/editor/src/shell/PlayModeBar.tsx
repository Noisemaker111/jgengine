import { useMemo } from "react";

import type { RuntimePlayControl } from "@jgengine/core/editor/index";

import type { EditorHostApi } from "../session";
import { useStoreSelector } from "../useStoreSelector";
import { Icon } from "./icons";
import { BORDER, FOCUS_RING } from "./theme";
import { IconButton, ToolbarDivider } from "./ui";

/**
 * Subscribe to the host runtime play-control (pause / pending steps) as an external store.
 * Shared by the play-mode chrome pieces so none of them hand-rolls a `setState` mirror.
 * @internal
 */
export function usePlayControl(api: EditorHostApi): RuntimePlayControl {
  const store = useMemo(
    () => ({ getState: api.getPlayControl, subscribe: api.subscribePlayControl }),
    [api],
  );
  return useStoreSelector(store, (play) => play);
}

/**
 * Slim shell chrome for Play mode — same app-bar language as edit mode so switching modes
 * does not feel like an app swap. Pause / Resume / Step drive the existing runtime play
 * controls (`runtime_pause` / `runtime_resume` / `runtime_step`); Exit returns to edit.
 * @internal
 */
export function PlayModeBar({
  gameId,
  api,
  onExit,
}: {
  gameId: string;
  api: EditorHostApi;
  onExit: () => void;
}) {
  const play = usePlayControl(api);

  const pause = () => {
    api.handle({ method: "runtime_pause" });
  };
  const resume = () => {
    api.handle({ method: "runtime_resume" });
  };
  const step = () => {
    api.handle({ method: "runtime_step", frames: 1 });
  };

  return (
    <header
      className={`pointer-events-auto relative z-[60] flex h-12 shrink-0 items-center gap-2 border-b ${BORDER} bg-[#111318] px-2.5`}
      role="banner"
      aria-label="Play mode"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br from-emerald-500/30 to-cyan-500/25 text-[11px] font-bold tracking-wide text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
          aria-hidden="true"
        >
          JG
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold text-neutral-100">{gameId}</div>
          <div className="text-[10px] text-neutral-500">Play mode</div>
        </div>
        <span
          className={`ml-1 hidden items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] sm:flex ${
            play.paused
              ? "bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/25"
              : "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/25"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${play.paused ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
          {play.paused ? "Paused" : "Playing"}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <IconButton
          icon={play.paused ? "play" : "pause"}
          label={play.paused ? "Resume simulation" : "Pause simulation"}
          onClick={() => (play.paused ? resume() : pause())}
          active={play.paused}
        />
        <IconButton
          icon="step"
          label="Step one frame (pause required)"
          onClick={step}
          disabled={!play.paused}
        />
        <ToolbarDivider />
        <button
          type="button"
          onClick={onExit}
          title="Return to the editor (F2+E)"
          className={`flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.07] bg-[#191d24] px-3 text-[12px] font-medium text-neutral-200 transition-colors hover:bg-[#1f242d] ${FOCUS_RING}`}
        >
          <Icon name="panel" size={12} />
          Editor
        </button>
      </div>
    </header>
  );
}
