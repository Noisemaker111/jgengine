import type { SessionSnapshot } from "../../race/session";
import { formatRaceTime, ordinal, PALETTE } from "../../theme";
import { KeybindBadge } from "./KeybindBadge";

function ResultStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#f5f3ff]/50">{label}</span>
      <span className="font-mono text-2xl font-extrabold" style={{ color: accent ? PALETTE.boostTangerine : PALETTE.starlight }}>
        {value}
      </span>
    </div>
  );
}

export function ResultsScreen({ snapshot, onRestart }: { snapshot: SessionSnapshot; onRestart: () => void }) {
  const won = snapshot.outcome === "win";
  const accent = won ? PALETTE.boostTangerine : PALETTE.planetMint;
  const headline = snapshot.timedOut
    ? "TELEMETRY DARK — TIMEOUT"
    : won
      ? "LAP OF THE CENTURY"
      : `${ordinal(snapshot.playerPosition)} PLACE — SIGNAL LOST`;

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-7 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.15),rgba(5,4,15,0.97)_75%)] px-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: accent }}>
          {won ? "Grand Prix Champion" : "Race Over"}
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight text-[#f5f3ff] sm:text-5xl">{headline}</h1>
      </div>

      <div className="grid w-full max-w-md grid-cols-2 gap-4 rounded-lg border border-[#f5f3ff]/15 bg-[#0a0820]/90 px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <ResultStat label="Finish Position" value={ordinal(snapshot.playerPosition)} accent />
        <ResultStat label="Total Time" value={formatRaceTime(snapshot.totalTime)} />
        <ResultStat label="Best Lap" value={formatRaceTime(snapshot.bestLapTime)} />
        <ResultStat label="Cleanest Slings" value={String(snapshot.cleanSlingCount)} />
      </div>

      <div className="w-full max-w-md rounded-lg border border-[#f5f3ff]/15 bg-[#0a0820]/90 px-6 py-4 text-left shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.3em] text-[#f5f3ff]/50">Podium</span>
        <ol className="flex flex-col gap-1.5">
          {snapshot.standings.map((entry) => (
            <li key={entry.racerId} className="flex items-center justify-between text-sm">
              <span className="font-bold text-[#f5f3ff]/90">
                {ordinal(entry.position)} — {entry.name}
              </span>
              <span className="text-xs uppercase tracking-widest text-[#f5f3ff]/50">{entry.finished ? "Finished" : "DNF"}</span>
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="group flex items-center gap-3 rounded-full border-2 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] transition hover:text-[#05040f]"
        style={{ borderColor: accent, color: accent, backgroundColor: `${accent}1a` }}
        onMouseEnter={(event) => (event.currentTarget.style.backgroundColor = accent)}
        onMouseLeave={(event) => (event.currentTarget.style.backgroundColor = `${accent}1a`)}
      >
        Race Again
        <KeybindBadge action="restart" />
      </button>
    </div>
  );
}
