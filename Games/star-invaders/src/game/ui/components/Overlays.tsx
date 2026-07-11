import { CRAB, OCTOPUS, SAUCER, SQUID } from "../../invaders/sprites";
import type { StarInvadersSnapshot } from "../../invaders/store";
import { COLORS } from "../palette";
import { PixelIcon } from "./PixelIcon";

function ScoreRow({ sprite, color, points }: { sprite: readonly string[]; color: string; points: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-8 justify-center">
        <PixelIcon sprite={sprite} color={color} px={2} />
      </span>
      <span className="text-slate-500">=</span>
      <span className="font-mono text-sm font-bold tabular-nums" style={{ color }}>
        {points}
      </span>
    </div>
  );
}

function StartScreen({ onStart, coarsePointer }: { onStart: () => void; coarsePointer: boolean }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/78 backdrop-blur-[1px]">
      <div className="text-center">
        <div
          className="text-3xl font-black uppercase tracking-[0.35em] text-emerald-300 sm:text-4xl"
          style={{ textShadow: "0 0 16px rgba(84,255,159,0.6)" }}
        >
          Star
        </div>
        <div
          className="text-3xl font-black uppercase tracking-[0.35em] text-cyan-300 sm:text-4xl"
          style={{ textShadow: "0 0 16px rgba(95,242,255,0.6)" }}
        >
          Invaders
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-6 py-3">
        <span className="mb-1 text-center text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">Score Advance Table</span>
        <ScoreRow sprite={SAUCER} color={COLORS.saucer} points="? MYSTERY" />
        <ScoreRow sprite={SQUID[0]} color={COLORS.squid} points="30 PTS" />
        <ScoreRow sprite={CRAB[0]} color={COLORS.crab} points="20 PTS" />
        <ScoreRow sprite={OCTOPUS[0]} color={COLORS.octopus} points="10 PTS" />
      </div>

      <button
        type="button"
        onClick={onStart}
        className="rounded-lg border border-emerald-400/60 bg-emerald-500/15 px-7 py-2.5 text-sm font-bold uppercase tracking-[0.25em] text-emerald-100 shadow-[0_0_20px_rgba(84,255,159,0.3)] transition hover:bg-emerald-500/30"
      >
        {coarsePointer ? "Tap to Start" : "Press Space"}
      </button>
      {!coarsePointer && (
        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">← → / A D move · Space fire</div>
      )}
    </div>
  );
}

export function Overlays({
  snapshot,
  onRestart,
  onStart,
  coarsePointer,
}: {
  snapshot: StarInvadersSnapshot;
  onRestart: () => void;
  onStart: () => void;
  coarsePointer: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {snapshot.bannerText !== null && (
        <div className="absolute inset-x-0 top-[20%] flex justify-center">
          <div
            className="text-2xl font-black uppercase tracking-[0.3em] text-cyan-300"
            style={{ textShadow: "0 0 14px rgba(95,242,255,0.7)" }}
          >
            {snapshot.bannerText}
          </div>
        </div>
      )}

      {snapshot.message !== null && snapshot.bannerText === null && (
        <div className="absolute inset-x-0 top-[8%] flex justify-center">
          <div className="text-sm font-black uppercase tracking-[0.25em] text-amber-300" style={{ textShadow: "0 0 10px rgba(251,191,36,0.6)" }}>
            {snapshot.message}
          </div>
        </div>
      )}

      {snapshot.status === "start" && <StartScreen onStart={onStart} coarsePointer={coarsePointer} />}

      {snapshot.paused && snapshot.status === "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm">
          <div className="text-3xl font-black uppercase tracking-[0.35em] text-cyan-300">Paused</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Press P to resume</div>
        </div>
      )}

      {snapshot.status === "gameover" && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/82 backdrop-blur-sm">
          <div
            className="text-3xl font-black uppercase tracking-[0.3em] text-rose-400"
            style={{ textShadow: "0 0 16px rgba(244,63,94,0.55)" }}
          >
            Game Over
          </div>
          <div className="font-mono text-lg text-slate-100">Score {snapshot.score.toLocaleString()}</div>
          <div className="font-mono text-sm text-slate-400">
            Hi-Score {snapshot.best.toLocaleString()} · Reached Wave {snapshot.wave}
          </div>
          {snapshot.newBest && (
            <div
              className="text-xs font-black uppercase tracking-[0.3em] text-amber-300"
              style={{ textShadow: "0 0 10px rgba(251,191,36,0.6)" }}
            >
              New Hi-Score!
            </div>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="mt-2 rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-6 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.3)] transition hover:bg-cyan-500/35"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
