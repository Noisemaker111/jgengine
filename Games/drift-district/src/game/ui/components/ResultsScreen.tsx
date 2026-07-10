import type { SessionSnapshot } from "../../race/session";
import { KeybindBadge } from "./KeybindBadge";
import { formatRaceTime } from "./theme";

export function ResultsScreen({ snapshot, onRestart }: { snapshot: SessionSnapshot; onRestart: () => void }) {
  const won = snapshot.outcome === "win";
  const accent = won ? "#29d9e0" : "#ff2d78";
  const headline = snapshot.dnf ? "DNF — DIDN'T MAKE THE LINE" : won ? "FIRST THROUGH THE LINE" : "OUTRUN";

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-7 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.2),rgba(8,8,13,0.96)_75%)] px-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <span
          className="text-xs font-bold uppercase tracking-[0.5em]"
          style={{ color: accent }}
        >
          {won ? "District Champion" : "Race Over"}
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight text-[#e8e6f0] sm:text-5xl">{headline}</h1>
      </div>

      <div className="grid w-full max-w-sm grid-cols-2 gap-4 rounded-lg border border-[#e8e6f0]/15 bg-[#15151d]/90 px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <ResultStat label="Total Time" value={formatRaceTime(snapshot.totalTime)} accent />
        <ResultStat label="Best Lap" value={formatRaceTime(snapshot.bestLapTime)} />
        <ResultStat label="Style Score" value={String(snapshot.styleScore)} />
        <ResultStat label="Districts Shifted" value={String(snapshot.triggeredGates.length)} />
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="group flex items-center gap-3 rounded-full border-2 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] transition hover:text-[#15151d]"
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

function ResultStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#e8e6f0]/50">{label}</span>
      <span
        className="font-mono text-2xl font-extrabold"
        style={{ color: accent ? "#ffb347" : "#e8e6f0" }}
      >
        {value}
      </span>
    </div>
  );
}
