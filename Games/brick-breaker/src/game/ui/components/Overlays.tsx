import type { BrickBreakerSnapshot } from "../../breakout/store";

function PlayAgainButton({ onRestart, label }: { onRestart: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onRestart}
      className="pointer-events-auto mt-5 min-h-12 border-2 border-cyan-300 bg-cyan-300 px-7 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#050414] shadow-[0_0_28px_rgba(34,211,238,0.35)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fuchsia-300 active:translate-y-0 active:scale-[0.97]"
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
  const launchHint = coarsePointer ? "Tap to launch" : "Space / click to launch";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {snapshot.bannerText !== null && (
        <div className="absolute inset-x-0 top-[16%] flex justify-center" style={{ opacity: Math.min(1, snapshot.bannerMs / 0.6) }}>
          <div className="relative w-full border-y border-fuchsia-300/45 bg-[#050414]/88 px-6 py-4 text-center shadow-[0_0_35px_rgba(232,121,249,0.18)]">
            <div className="absolute inset-x-[10%] top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
            <div className="text-xl font-black uppercase tracking-[0.28em] text-fuchsia-300 drop-shadow-[0_0_12px_rgba(232,121,249,0.65)] sm:text-2xl">
              {snapshot.bannerText}
            </div>
          </div>
        </div>
      )}

      {snapshot.message !== null && snapshot.bannerText === null && (
        <div className="absolute inset-x-0 top-[10%] flex justify-center">
          <div className="text-base font-black uppercase tracking-[0.22em] text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)] sm:text-lg">
            {snapshot.message}
          </div>
        </div>
      )}

      {snapshot.status === "serve" && !snapshot.paused && snapshot.bannerText === null && (
        <div className="absolute inset-x-0 bottom-[12%] flex justify-center">
          <div className="animate-pulse border-y border-cyan-300/35 bg-[#050414]/75 px-6 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-200">
            {launchHint}
          </div>
        </div>
      )}

      {snapshot.paused && snapshot.status !== "gameover" && snapshot.status !== "victory" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#03020c]/78 backdrop-blur-[2px]">
          <div className="relative border-y-2 border-cyan-300/60 px-12 py-7 text-center">
            <div className="absolute -left-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border border-fuchsia-300 bg-[#050414]" />
            <div className="absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border border-fuchsia-300 bg-[#050414]" />
            <div className="text-4xl font-black uppercase tracking-[0.32em] text-cyan-300 drop-shadow-[0_0_16px_rgba(34,211,238,0.55)]">Paused</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.28em] text-slate-400">Press P to return</div>
          </div>
        </div>
      )}

      {snapshot.status === "gameover" && (
        <ResultOverlay
          eyebrow="Signal lost"
          title="Game Over"
          accent="rose"
          score={snapshot.score}
          detail={`Best ${snapshot.best.toLocaleString()} · Level ${snapshot.level}`}
          newBest={snapshot.newBest}
          onRestart={onRestart}
        />
      )}

      {snapshot.status === "victory" && (
        <ResultOverlay
          eyebrow="Cabinet cleared"
          title="Perfect Break"
          accent="emerald"
          score={snapshot.score}
          detail={`Best ${snapshot.best.toLocaleString()} · Combo x${snapshot.maxCombo}`}
          newBest={snapshot.newBest}
          onRestart={onRestart}
        />
      )}
    </div>
  );
}

function ResultOverlay({
  eyebrow,
  title,
  accent,
  score,
  detail,
  newBest,
  onRestart,
}: {
  eyebrow: string;
  title: string;
  accent: "rose" | "emerald";
  score: number;
  detail: string;
  newBest: boolean;
  onRestart: () => void;
}) {
  const titleClass = accent === "emerald" ? "text-emerald-300" : "text-rose-400";
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#020108]/88 px-5 backdrop-blur-[2px]">
      <div className="relative w-full max-w-xl border-y border-violet-400/45 py-8 text-center">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
        <div className="text-[9px] font-black uppercase tracking-[0.42em] text-slate-500">{eyebrow}</div>
        <div className={`mt-3 text-4xl font-black uppercase leading-none tracking-[0.16em] drop-shadow-[0_0_18px_currentColor] sm:text-6xl ${titleClass}`}>
          {title}
        </div>
        <div className="mt-6 font-mono text-3xl text-white">{score.toLocaleString()}</div>
        <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-slate-400">{detail}</div>
        {newBest && <div className="mt-3 text-[10px] font-black uppercase tracking-[0.34em] text-amber-300">New cabinet record</div>}
        <PlayAgainButton onRestart={onRestart} label="Insert credit" />
      </div>
    </div>
  );
}
