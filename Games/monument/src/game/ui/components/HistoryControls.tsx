import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { HAIRLINE, PANEL } from "../theme";
import { Kbd } from "./Kbd";

export function HistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}): ReactNode {
  const undoKey = actionLabel(keybinds, "undo") ?? "";
  const redoKey = actionLabel(keybinds, "redo") ?? "";
  return (
    <div className={`flex items-stretch ${PANEL}`}>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${
          canUndo ? "text-[#171916] hover:bg-[rgba(20,22,18,0.08)]" : "cursor-not-allowed text-[#a7a99f]"
        }`}
      >
        <span className="text-[13px] leading-none">↶</span>
        Undo
        <Kbd label={undoKey} active={canUndo} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        className={`flex items-center gap-1.5 border-l px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${HAIRLINE} ${
          canRedo ? "text-[#171916] hover:bg-[rgba(20,22,18,0.08)]" : "cursor-not-allowed text-[#a7a99f]"
        }`}
      >
        Redo
        <span className="text-[13px] leading-none">↷</span>
        <Kbd label={redoKey} active={canRedo} />
      </button>
    </div>
  );
}
