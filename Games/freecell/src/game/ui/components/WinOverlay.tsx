import { freecellStore, type FreeCellSnapshot } from "../../freecell/store";
import { btn, btnActive, formatTime } from "../theme";

const CONFETTI = ["#7dd3fc", "#f9d371", "#f472b6", "#a7f3d0", "#c4b5fd", "#fca5a5"];

export function WinOverlay({ snapshot }: { snapshot: FreeCellSnapshot }) {
  if (!snapshot.won) return null;
  const { stats } = snapshot;
  const isFastest = stats.fastestWinMs !== null && Math.round(snapshot.elapsedMs) <= stats.fastestWinMs;
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(80%_80%_at_50%_30%,rgba(12,34,71,0.82),rgba(3,8,20,0.94))] backdrop-blur-sm"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--jg-hud-dock-clearance, 0px))" }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className="absolute top-[-10%] h-2 w-2 rounded-sm"
            style={{
              left: `${(i * 97) % 100}%`,
              background: CONFETTI[i % CONFETTI.length],
              animation: `freecell-fall ${2.4 + ((i * 7) % 20) / 10}s linear ${(i % 10) / 8}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`@keyframes freecell-fall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(120vh) rotate(540deg);opacity:0.2}}`}</style>

      <div className="relative flex flex-col items-center gap-1">
        <div className="text-4xl font-black uppercase tracking-[0.35em] text-sky-200 drop-shadow-[0_2px_10px_rgba(56,189,248,0.5)]">
          You win
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">
          Deal #{snapshot.dealNumber}
        </div>
      </div>

      <div className="relative flex items-center gap-6 rounded-xl border border-slate-300/20 bg-slate-950/70 px-6 py-3">
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Time</span>
          <span className="font-mono text-xl font-bold text-slate-100">{formatTime(snapshot.elapsedMs)}</span>
          {isFastest && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Best!</span>
          )}
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Moves</span>
          <span className="font-mono text-xl font-bold text-slate-100">{snapshot.moves}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Streak</span>
          <span className="font-mono text-xl font-bold text-emerald-300">{stats.currentStreak}</span>
        </div>
      </div>

      <div className="relative flex gap-3">
        <button type="button" className={btnActive} onClick={() => freecellStore.randomDeal()}>
          New game
        </button>
        <button type="button" className={btn} onClick={() => freecellStore.newDeal(snapshot.dealNumber + 1)}>
          Next deal #{snapshot.dealNumber + 1}
        </button>
      </div>
    </div>
  );
}
