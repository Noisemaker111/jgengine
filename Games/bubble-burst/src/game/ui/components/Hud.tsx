import { type ReactNode } from "react";

import type { BubbleSnapshot } from "../../bubble/store";
import { BubbleMark } from "./BubbleMark";

const BRASS = "#e9c46a";
const MINT = "#dff3ec";
const DANGER = "#ff7a6b";
const PANEL: React.CSSProperties = {
  background: "rgba(4,32,29,0.74)",
  border: "1px solid rgba(233,196,106,0.30)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
  backdropFilter: "blur(3px)",
};

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${className ?? ""}`} style={PANEL}>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: BRASS }}>
      {children}
    </span>
  );
}

export function LevelPanel({ snap }: { snap: BubbleSnapshot }) {
  return (
    <Panel>
      <div className="flex flex-col gap-0.5">
        <Label>
          Level {snap.level}/{snap.totalLevels}
        </Label>
        <span className="text-sm font-black tracking-tight" style={{ color: MINT }}>
          {snap.levelName}
        </span>
      </div>
    </Panel>
  );
}

export function ScorePanel({ snap }: { snap: BubbleSnapshot }) {
  return (
    <Panel>
      <div className="flex flex-col items-end gap-0.5">
        <Label>Score</Label>
        <span className="text-2xl font-black leading-none tabular-nums" style={{ color: MINT }}>
          {snap.score.toLocaleString()}
        </span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: BRASS }}>
          Best {snap.best.toLocaleString()}
        </span>
      </div>
    </Panel>
  );
}

export function CompressorPanel({ snap }: { snap: BubbleSnapshot }) {
  const alert = snap.danger || snap.shotsUntilDrop === 1;
  return (
    <Panel>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label>Compressor</Label>
          <span
            className={`text-[11px] font-bold tabular-nums ${alert ? "animate-pulse" : ""}`}
            style={{ color: alert ? DANGER : MINT }}
          >
            Drop in {snap.shotsUntilDrop}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: snap.cycleLength }).map((_, i) => {
            const filled = i < snap.shotsIntoCycle;
            const last = i === snap.cycleLength - 1;
            return (
              <span
                key={i}
                className={`h-2.5 flex-1 rounded-full ${alert && last ? "animate-pulse" : ""}`}
                style={{
                  minWidth: 12,
                  background: filled ? (alert ? DANGER : BRASS) : "rgba(255,255,255,0.12)",
                  boxShadow: filled ? `0 0 6px ${alert ? "rgba(255,90,80,0.7)" : "rgba(233,196,106,0.55)"}` : "none",
                }}
              />
            );
          })}
        </div>
        {snap.danger ? (
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: DANGER }}>
            Deadline near
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

export function NextPanel({ snap, onSwap }: { snap: BubbleSnapshot; onSwap: () => void }) {
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <Label>Loaded</Label>
          <BubbleMark id={snap.current} size={34} />
        </div>
        <span className="text-lg" style={{ color: BRASS }}>
          →
        </span>
        <div className="flex flex-col items-center gap-0.5">
          <Label>Next</Label>
          <BubbleMark id={snap.next} size={26} />
        </div>
        <button
          type="button"
          onClick={onSwap}
          className="pointer-events-auto ml-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors"
          style={{ background: "rgba(233,196,106,0.16)", color: BRASS, border: "1px solid rgba(233,196,106,0.4)" }}
        >
          Swap
          <span className="ml-1 rounded bg-black/30 px-1 font-mono text-[10px]">X</span>
        </button>
      </div>
    </Panel>
  );
}

export function Banner({ snap }: { snap: BubbleSnapshot }) {
  if (snap.bannerText === null) return null;
  const fade = Math.min(1, snap.bannerMs / 0.6);
  return (
    <div className="pointer-events-none absolute left-1/2 top-[14%] z-30 -translate-x-1/2" style={{ opacity: fade }}>
      <span
        className="rounded-full px-5 py-2 text-lg font-black tracking-wide"
        style={{
          color: "#fff7e6",
          background: "rgba(4,32,29,0.82)",
          border: "1px solid rgba(233,196,106,0.5)",
          textShadow: "0 2px 12px rgba(0,0,0,0.7)",
          boxShadow: "0 8px 26px rgba(0,0,0,0.5)",
        }}
      >
        {snap.bannerText}
      </span>
    </div>
  );
}
