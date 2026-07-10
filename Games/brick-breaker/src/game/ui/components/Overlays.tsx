import type { BrickBreakerSnapshot } from "../../breakout/store";

function PlayAgainButton({ onRestart, label }: { onRestart: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onRestart}
      className="pointer-events-auto mt-2 rounded-lg border border-cyan-400/60 bg-cyan-500/20 px-6 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.35)] transition hover:bg-cyan-500/40"
    >
      {label}
    </button>
  );
}

export function Overlays({
  snapshot,
  onRestart,
  coarsePointer,
}: {
  snapshot: BrickBreakerSnapshot;
  onRestart: () => void;
  coarsePointer: boolean;
}) {
  const launchHint = coarsePointer ? "Tap to launch" : "Press SPACE or click to launch";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {snapshot.bannerText !== null && (
        <div
          className="absolute inset-x-0 top-[18%] flex justify-center"
          style={{ opacity: Math.min(1, snapshot.bannerMs / 0.6) }}
        >
          <div className="rounded-xl border border-fuchsia-400/40 bg-black/70 px-8 py-3 text-center backdrop-blur-sm">
            <div className="text-xl font-black uppercase tracking-[0.25em] text-fuchsia-300 drop-shadow-[0_0_12px_rgba(232,121,249,0.6)]">
              {snapshot.bannerText}
            </div>
          </div>
        </div>
      )}

      {snapshot.message !== null && snapshot.bannerText === null && (
        <div className="absolute inset-x-0 top-[10%] flex justify-center">
          <div className="text-lg font-black uppercase tracking-[0.2em] text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
            {snapshot.message}
          </div>
        </div>
      )}

      {snapshot.status === "serve" && !snapshot.paused && snapshot.bannerText === null && (
        <div className="absolute inset-x-0 bottom-[16%] flex animate-pulse justify-center">
          <div className="rounded-full border border-cyan-400/40 bg-black/50 px-5 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200">
            {launchHint}
          </div>
        </div>
      )}

      {snapshot.paused && snapshot.status !== "gameover" && snapshot.status !== "victory" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm">
          <div className="text-4xl font-black uppercase tracking-[0.3em] text-cyan-300">Paused</div>
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Press P to resume</div>
        </div>
      )}

      {snapshot.status === "gameover" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 backdrop-blur-sm">
          <div className="text-4xl font-black uppercase tracking-[0.25em] text-rose-400 drop-shadow-[0_0_16px_rgba(244,63,94,0.5)]">
            Game Over
          </div>
          <div className="font-mono text-lg text-slate-100">Score {snapshot.score.toLocaleString()}</div>
          <div className="font-mono text-sm text-slate-400">
            Best {snapshot.best.toLocaleString()} · Reached Level {snapshot.level}
          </div>
          {snapshot.newBest && (
            <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
              New Best!
            </div>
          )}
          <PlayAgainButton onRestart={onRestart} label="Play Again" />
        </div>
      )}

      {snapshot.status === "victory" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 backdrop-blur-sm">
          <div className="text-3xl font-black uppercase tracking-[0.2em] text-emerald-300 drop-shadow-[0_0_16px_rgba(52,211,153,0.5)]">
            Victory!
          </div>
          <div className="text-sm uppercase tracking-[0.2em] text-slate-300">All {snapshot.totalLevels} levels cleared</div>
          <div className="font-mono text-lg text-slate-100">Score {snapshot.score.toLocaleString()}</div>
          <div className="font-mono text-sm text-slate-400">Best {snapshot.best.toLocaleString()} · Max Combo x{snapshot.maxCombo}</div>
          {snapshot.newBest && (
            <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">New Best!</div>
          )}
          <PlayAgainButton onRestart={onRestart} label="Play Again" />
        </div>
      )}
    </div>
  );
}
