import { useGame } from "@jgengine/react/hooks";
import type { ResultsSnapshot } from "../../race/tick";

function formatSec(sec: number | null): string {
  if (sec === null) return "—";
  return `${sec.toFixed(1)}s`;
}

function ordinal(position: number): string {
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return `${position}th`;
}

export function ResultsScreen({ results }: { results: ResultsSnapshot }) {
  const { commands } = useGame();
  const won = results.outcome === "win";
  return (
    <div className="w-full max-w-md rounded-sm border border-[#f2c14e]/40 bg-[#14505c] p-6 text-[#e6f2ef] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      <p className="text-xs uppercase tracking-[0.35em] text-[#f2c14e]">Race Committee</p>
      <h1 className={`mt-1 text-3xl font-black tracking-tight ${won ? "text-[#f2c14e]" : "text-[#c74a34]"}`}>
        {won ? "Line Honours" : "Fleet's Home"}
      </h1>
      <p className="mt-1 text-sm text-[#e6f2ef]/80">
        {won ? "You crossed the line first, skipper." : "You're pinching against the flow, skipper."}
      </p>

      <div className="mt-4 flex flex-col gap-1.5 border-t border-[#e6f2ef]/15 pt-4">
        {results.placings.map((row) => (
          <div
            key={row.racerId}
            className={`flex items-center justify-between rounded-sm px-2.5 py-1.5 text-sm ${
              row.isPlayer ? "bg-[#f2c14e]/15 text-[#f2c14e]" : "text-[#e6f2ef]/85"
            }`}
          >
            <span className="font-bold">{ordinal(row.position)}</span>
            <span className="flex-1 px-2">{row.name}</span>
            <span className="tabular-nums">{row.finished ? formatSec(row.finishTime) : "DNF"}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#e6f2ef]/15 pt-4 text-sm">
        <div className="rounded-sm bg-[#0e2a30] p-2.5 text-center">
          <p className="text-[#e6f2ef]/60">Best Lap</p>
          <p className="text-lg font-bold text-[#f2c14e]">{formatSec(results.bestLapSec)}</p>
        </div>
        <div className="rounded-sm bg-[#0e2a30] p-2.5 text-center">
          <p className="text-[#e6f2ef]/60">Riding the Push</p>
          <p className="text-lg font-bold text-[#f2c14e]">{results.surfPercent.toFixed(0)}%</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => commands.run("restartRace", undefined)}
        className="mt-6 w-full rounded-sm bg-[#c74a34] py-3 text-base font-bold uppercase tracking-wide text-[#e6f2ef] transition hover:bg-[#c74a34]/85 active:scale-[0.99]"
      >
        Restart &middot; R
      </button>
    </div>
  );
}
