import type { BubbleSnapshot } from "../../bubble/store";

const BRASS = "#e9c46a";

export function Overlays({ snap, onRestart }: { snap: BubbleSnapshot; onRestart: () => void }) {
  if (snap.status !== "gameover" && snap.status !== "victory") return null;
  const won = snap.status === "victory";
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 px-6 text-center"
      style={{ background: "rgba(3,20,18,0.82)", backdropFilter: "blur(4px)" }}
    >
      <h1
        className="text-4xl font-black tracking-tight sm:text-5xl"
        style={{ color: won ? "#7bf0c4" : "#ff8f7d", textShadow: "0 3px 22px rgba(0,0,0,0.6)" }}
      >
        {won ? "Run Complete!" : "Deadline Breached"}
      </h1>

      <div className="flex flex-col items-center gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: BRASS }}>
          Final Score
        </span>
        <span className="text-5xl font-black tabular-nums" style={{ color: "#f4fbf7" }}>
          {snap.score.toLocaleString()}
        </span>
        {snap.newBest ? (
          <span className="mt-1 rounded-full px-3 py-0.5 text-sm font-bold" style={{ color: "#03201d", background: BRASS }}>
            New Best!
          </span>
        ) : (
          <span className="text-sm" style={{ color: "#9fc7bc" }}>
            Best {snap.best.toLocaleString()}
          </span>
        )}
        <span className="mt-1 text-sm" style={{ color: "#cfe8e0" }}>
          Reached Level {won ? snap.totalLevels : snap.level} / {snap.totalLevels} · Furthest {snap.bestLevel}
        </span>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="rounded-xl px-7 py-2.5 text-lg font-black uppercase tracking-widest transition-transform hover:scale-105"
        style={{ background: BRASS, color: "#03201d", boxShadow: "0 8px 24px rgba(233,196,106,0.35)" }}
      >
        Play Again
        <span className="ml-2 rounded bg-black/25 px-1.5 font-mono text-xs">R</span>
      </button>
    </div>
  );
}
