import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import type { TetrisSnapshot } from "../../tetris/store";
import { PiecePreview } from "./Board";

function label(action: string): string {
  return actionLabel(keybinds, action) ?? "?";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/80">{title}</div>
      {children}
    </div>
  );
}

function Stat({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs uppercase tracking-wide text-slate-400">{name}</span>
      <span className="font-mono text-2xl font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white">
      {children}
    </kbd>
  );
}

function Control({ action, desc }: { action: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-xs text-slate-300">{desc}</span>
      <Key>{label(action)}</Key>
    </div>
  );
}

function CompactLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[9px] font-semibold uppercase tracking-widest text-cyan-300/80">{children}</span>;
}

export function HoldPanel({ snapshot, compact = false }: { snapshot: TetrisSnapshot; compact?: boolean }) {
  if (compact) {
    return (
      <div className={`flex flex-col items-center gap-1 ${snapshot.canHold ? "opacity-100" : "opacity-40"}`}>
        <CompactLabel>{label("hold")}</CompactLabel>
        <PiecePreview type={snapshot.hold} />
      </div>
    );
  }
  return (
    <Panel title={`Hold · ${label("hold")}`}>
      <div className={snapshot.canHold ? "opacity-100" : "opacity-40"}>
        <PiecePreview type={snapshot.hold} />
      </div>
    </Panel>
  );
}

export function NextPanel({
  snapshot,
  compact = false,
  limit,
}: {
  snapshot: TetrisSnapshot;
  compact?: boolean;
  limit?: number;
}) {
  const pieces = limit === undefined ? snapshot.next : snapshot.next.slice(0, limit);
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1">
        <CompactLabel>Next</CompactLabel>
        <div className="flex flex-row gap-2">
          {pieces.map((type, i) => (
            <PiecePreview key={`${type}-${i}`} type={type} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <Panel title="Next">
      <div className="flex flex-col gap-2">
        {pieces.map((type, i) => (
          <PiecePreview key={`${type}-${i}`} type={type} />
        ))}
      </div>
    </Panel>
  );
}

export function StatsPanel({ snapshot, compact = false }: { snapshot: TetrisSnapshot; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] uppercase tracking-wide text-slate-400">Score</span>
          <span className="font-mono text-sm font-bold tabular-nums text-white">{snapshot.score}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] uppercase tracking-wide text-slate-400">Lines</span>
          <span className="font-mono text-xs font-bold tabular-nums text-white">{snapshot.lines}</span>
        </div>
      </div>
    );
  }
  return (
    <Panel title="Stats">
      <div className="flex flex-col gap-2">
        <Stat name="Score" value={snapshot.score} />
        <Stat name="Best" value={snapshot.best} />
        <Stat name="Lines" value={snapshot.lines} />
        <Stat name="Level" value={snapshot.level} />
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xs uppercase tracking-wide text-slate-400">Next level</span>
          <span className="font-mono text-xs text-slate-300">{snapshot.linesToNextLevel} lines</span>
        </div>
        {snapshot.combo > 0 && (
          <div className="rounded bg-amber-500/20 px-2 py-1 text-center text-xs font-bold uppercase tracking-wide text-amber-300">
            Combo x{snapshot.combo}
          </div>
        )}
        {snapshot.backToBack && (
          <div className="rounded bg-fuchsia-500/20 px-2 py-1 text-center text-xs font-bold uppercase tracking-wide text-fuchsia-300">
            Back-to-Back
          </div>
        )}
      </div>
    </Panel>
  );
}

export function ControlsPanel() {
  return (
    <Panel title="Controls">
      <div className="flex flex-col">
        <Control action="shiftLeft" desc="Move left" />
        <Control action="shiftRight" desc="Move right" />
        <Control action="softDrop" desc="Soft drop" />
        <Control action="hardDrop" desc="Hard drop" />
        <Control action="rotateCw" desc="Rotate CW" />
        <Control action="rotateCcw" desc="Rotate CCW" />
        <Control action="hold" desc="Hold" />
        <Control action="restart" desc="Restart" />
      </div>
    </Panel>
  );
}
