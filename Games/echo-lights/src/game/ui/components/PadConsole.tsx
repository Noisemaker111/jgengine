import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { PADS, type PadIndex } from "../../echo/catalog";
import type { RunState } from "../../echo/run";

const PAD_PLACEMENTS: readonly { top?: string; left?: string; right?: string; bottom?: string }[] = [
  { top: "0", left: "0" },
  { top: "0", right: "0" },
  { bottom: "0", left: "0" },
  { bottom: "0", right: "0" },
];

const BADGE_PLACEMENTS: readonly { top?: string; left?: string; right?: string; bottom?: string }[] = [
  { top: "18%", left: "18%" },
  { top: "18%", right: "18%" },
  { bottom: "18%", left: "18%" },
  { bottom: "18%", right: "18%" },
];

function padBackground(base: string, deep: string, lit: boolean, litColor: string): string {
  if (lit) {
    return `radial-gradient(140% 140% at 50% 50%, ${litColor} 0%, ${base} 78%)`;
  }
  return `radial-gradient(130% 130% at 50% 40%, ${base} 0%, ${deep} 82%)`;
}

function hubLabel(run: RunState): { text: string; tone: string; pulse: boolean } {
  switch (run.phase) {
    case "watch":
      return { text: "WATCH", tone: "#f2b53d", pulse: true };
    case "recall":
      return { text: "YOUR TURN", tone: "#5fe38a", pulse: false };
    case "advance":
      return { text: "GOOD!", tone: "#5fe38a", pulse: false };
    case "replay":
      return { text: "MISS — AGAIN", tone: "#ff6b74", pulse: true };
    case "over":
      return { text: "GAME OVER", tone: "#ff6b74", pulse: false };
    default:
      return { text: "", tone: "#f2b53d", pulse: false };
  }
}

export function PadConsole({
  run,
  onPad,
  onStart,
}: {
  run: RunState;
  onPad: (pad: PadIndex) => void;
  onStart: () => void;
}) {
  const yourTurn = run.phase === "recall";
  const hub = hubLabel(run);

  return (
    <div
      className="el-console"
      data-turn={yourTurn ? "true" : "false"}
      data-over={run.phase === "over" ? "true" : "false"}
      style={{ width: "min(64vmin, 27rem)", aspectRatio: "1 / 1" }}
    >
      {PADS.map((pad, index) => {
        const lit = run.litPad === index;
        const miss = lit && run.litKind === "miss";
        const keyLabel = actionLabel(keybinds, pad.action);
        return (
          <button
            key={pad.id}
            type="button"
            aria-label={`${pad.label} pad${keyLabel === null ? "" : ` (key ${keyLabel})`}`}
            className="el-pad"
            data-lit={lit ? "true" : "false"}
            onPointerDown={() => onPad(index as PadIndex)}
            style={{
              ...PAD_PLACEMENTS[index],
              borderRadius: pad.corner,
              background: padBackground(pad.base, pad.baseDeep, lit, pad.lit),
              boxShadow: lit
                ? `0 0 44px 12px ${miss ? "rgba(255, 64, 64, 0.65)" : pad.glow}, inset 0 0 34px rgba(255,255,255,0.42)`
                : "inset 0 -6px 18px rgba(0,0,0,0.45), inset 0 4px 10px rgba(255,255,255,0.12)",
            }}
          >
            {keyLabel === null ? null : (
              <span className="el-pad-key" style={BADGE_PLACEMENTS[index]}>
                {keyLabel}
              </span>
            )}
          </button>
        );
      })}

      <div className="el-hub">
        {run.phase === "idle" ? (
          <button type="button" className="el-start" onClick={onStart}>
            START
          </button>
        ) : (
          <>
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#8a6f4d]">Round</span>
            <span className="text-3xl font-black leading-none tabular-nums text-[#f3dfae]">
              {run.phase === "over" ? run.completed : run.sequence.length}
            </span>
            <span
              className={`mt-1 text-[10px] font-black tracking-[0.16em] ${hub.pulse ? "el-pulse" : ""}`}
              style={{ color: hub.tone }}
            >
              {hub.text}
            </span>
            {yourTurn ? (
              <span className="text-[9px] font-semibold tabular-nums text-[#8a6f4d]">
                {run.inputIndex}/{run.sequence.length}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
