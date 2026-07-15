import { useGameStore } from "@jgengine/react/hooks";

import { session } from "../../session";

export function GameOver() {
  const over = useGameStore(() => session.gameOver);
  const day = useGameStore(() => session.day);
  const rating = useGameStore(() => Math.round(session.rating));
  if (!over) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-400/40 bg-slate-900/95 px-10 py-8 text-center shadow-2xl">
        <span className="text-5xl">🎢</span>
        <h2 className="text-2xl font-black text-rose-300">Park Bankrupt</h2>
        <p className="max-w-xs text-sm text-slate-300">
          Loopline ran out of money on day {day} with a rating of {rating}. The gates are closed for good.
        </p>
        <button
          className="mt-1 rounded-lg bg-amber-400 px-5 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-300"
          onClick={() => window.location.reload()}
        >
          Reopen a new park
        </button>
      </div>
    </div>
  );
}
