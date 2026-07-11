import { actionLabel } from "@jgengine/core/input/actionBindings";

import { litCount } from "../../logic/board";
import { keybinds } from "../../keybinds";
import type { AppSnapshot } from "../../state";
import { ghostButtonClass, labelClass, primaryButtonClass } from "../theme";

export function Brand() {
  return (
    <div className="leading-none">
      <div
        className="text-[19px] font-black uppercase tracking-[0.34em] text-[#ffbb3c]"
        style={{ textShadow: "0 0 14px rgba(255,170,45,0.55)" }}
      >
        Lights Out
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8b7a5b]">
        Kill every light
      </div>
    </div>
  );
}

export function PlayStats({ snapshot }: { snapshot: AppSnapshot }) {
  const title = snapshot.mode === "random" ? "Random" : `Level ${snapshot.levelIndex + 1}`;
  const over = snapshot.presses > snapshot.par;
  return (
    <div className="flex items-stretch gap-4 px-1">
      <div className="flex flex-col justify-center">
        <div className={labelClass}>{snapshot.mode === "random" ? "Seed" : "Stage"}</div>
        <div className="text-[15px] font-bold text-[#ece0c8]">{title}</div>
        {snapshot.mode === "random" ? (
          <div className="text-[10px] font-mono text-[#8b7a5b]">{snapshot.seed}</div>
        ) : null}
      </div>
      <div className="w-px self-stretch bg-[#3a3024]" />
      <div className="flex flex-col justify-center text-center">
        <div className={labelClass}>Presses / Par</div>
        <div className="text-[22px] font-black leading-tight tabular-nums" style={{ color: over ? "#ff8b52" : "#ffcf7a" }}>
          {snapshot.presses}
          <span className="text-[#8b7a5b]"> / {snapshot.par}</span>
        </div>
      </div>
      <div className="w-px self-stretch bg-[#3a3024]" />
      <div className="flex flex-col justify-center text-center">
        <div className={labelClass}>Lit</div>
        <div className="text-[18px] font-bold text-[#e8d7ad] tabular-nums">{litCount(snapshot.board)}</div>
      </div>
      <div className="flex flex-col justify-center text-center">
        <div className={labelClass}>Hints</div>
        <div className="text-[18px] font-bold text-[#7fd0ff] tabular-nums">{snapshot.hintsUsed}</div>
      </div>
    </div>
  );
}

export function Controls({
  snapshot,
  showKeys,
  onHint,
  onUndo,
  onRestart,
  onLevels,
}: {
  snapshot: AppSnapshot;
  showKeys: boolean;
  onHint: () => void;
  onUndo: () => void;
  onRestart: () => void;
  onLevels: () => void;
}) {
  const key = (name: string) => (showKeys ? ` (${actionLabel(keybinds, name)})` : "");
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={primaryButtonClass} onClick={onHint} disabled={snapshot.solved}>
        {`Hint${key("hint")}`}
      </button>
      <button type="button" className={ghostButtonClass} onClick={onUndo} disabled={!snapshot.canUndo}>
        {`Undo${key("undo")}`}
      </button>
      <button type="button" className={ghostButtonClass} onClick={onRestart}>
        {`Restart${key("restart")}`}
      </button>
      <button type="button" className={ghostButtonClass} onClick={onLevels}>
        {`Levels${key("back")}`}
      </button>
    </div>
  );
}

export function Credit() {
  return (
    <div className="max-w-[10rem] text-right text-[10px] leading-tight text-[#8b7a5b]">
      Lights Out — Tiger Electronics (1995)
    </div>
  );
}
