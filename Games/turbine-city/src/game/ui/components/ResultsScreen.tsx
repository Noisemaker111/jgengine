import type { SessionSnapshot } from "../../race/session";
import { KeybindBadge } from "./KeybindBadge";
import { formatRaceTime, PALETTE } from "./theme";

export function ResultsScreen({ snapshot, onRestart }: { snapshot: SessionSnapshot; onRestart: () => void }) {
  const won = snapshot.outcome === "win";
  const accent = won ? PALETTE.skyTeal : PALETTE.windsockOrange;
  const headline = won ? "FIRST THROUGH THE FINAL RING" : "THE PACER HELD THE CORE";

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-7 px-6 text-center"
      style={{ background: `radial-gradient(circle at center, ${accent}22, #0d1b1c 78%)` }}
    >
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: accent }}>
          {won ? "Aerodrome Champion" : "Debrief"}
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight sm:text-5xl" style={{ color: PALETTE.cloudWhite }}>
          {headline}
        </h1>
      </div>

      <div
        className="grid w-full max-w-md grid-cols-2 gap-4 rounded-lg border px-6 py-5"
        style={{ borderColor: `${PALETTE.citySlate}55`, backgroundColor: "#0f1d1e" }}
      >
        <ResultStat label="Total Time" value={formatRaceTime(snapshot.totalTime)} accent={accent} highlight />
        <ResultStat label="Laminar %" value={`${Math.round(snapshot.laminar.percent * 100)}%`} accent={accent} />
        <ResultStat label="Longest Streak" value={String(snapshot.laminar.best)} accent={accent} />
        <ResultStat label="Verdict" value={won ? "You win" : "You lose"} accent={accent} />
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="group flex items-center gap-3 rounded-full border-2 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] transition"
        style={{ borderColor: accent, color: accent, backgroundColor: `${accent}1a` }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = accent;
          event.currentTarget.style.color = "#0d1b1c";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = `${accent}1a`;
          event.currentTarget.style.color = accent;
        }}
      >
        Fly Again
        <KeybindBadge action="restart" />
      </button>
    </div>
  );
}

function ResultStat({ label, value, accent, highlight = false }: { label: string; value: string; accent: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: `${PALETTE.cloudWhite}77` }}>
        {label}
      </span>
      <span className="font-mono text-2xl font-extrabold" style={{ color: highlight ? accent : PALETTE.cloudWhite }}>
        {value}
      </span>
    </div>
  );
}
