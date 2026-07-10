import type { DeathInfo, LapRecord } from "../../run/types";
import { ghostColor, LOOP_TEAL, TAPE_MAGENTA } from "../../track/palette";

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

function deathHeadline(death: DeathInfo | null): string {
  if (death === null) return "REWIND. AGAIN.";
  if (death.reason === "gate") return "MISSED THE OVER/UNDER — WIPED OUT";
  if (death.ghostLap !== null) return `LAP ${death.ghostLap} CAUGHT YOU`;
  return "YOUR OWN TAPE CAUGHT YOU";
}

export function ResultsScreen({ tape, death, onRestart }: { tape: readonly LapRecord[]; death: DeathInfo | null; onRestart: () => void }) {
  return (
    <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-5 bg-[#12101f]/94 px-6 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.5em] text-[#e83d84]">The Tape Thickens</p>
      <h2 className="text-3xl font-black uppercase tracking-widest text-[#f5f2fa]">{deathHeadline(death)}</h2>
      <p className="text-sm uppercase tracking-[0.3em] text-[#f5f2fa]/70">
        Laps survived: <span className="text-[#12b3a8]">{tape.length}</span>
      </p>
      <div className="max-h-56 w-full max-w-sm overflow-y-auto rounded-lg border border-[#6247aa]/50 bg-[#1c1830]/70 p-3">
        {tape.length === 0 ? (
          <p className="py-4 text-sm text-[#f5f2fa]/60">No laps recorded. Rewind and try again.</p>
        ) : (
          <ul className="space-y-1 text-left text-sm">
            {tape.map((lap) => (
              <li key={lap.lapIndex} className="flex items-center justify-between gap-3 rounded px-2 py-1" style={{ background: "rgba(98,71,170,0.15)" }}>
                <span className="flex items-center gap-2 text-[#f5f2fa]/85">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ghostColor(lap.lapIndex) }} />
                  Lap {lap.lapIndex}
                </span>
                <span className="font-mono text-[#f5f2fa]/90">{formatSeconds(lap.duration)}</span>
                <span className="text-[10px] uppercase tracking-widest text-[#f5f2fa]/50">
                  {lap.laneA === "branch" ? "A-branch " : ""}
                  {lap.laneB === "branch" ? "B-branch" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={onRestart}
        className="rounded-md px-8 py-3 text-lg font-black uppercase tracking-widest text-[#12101f] shadow-[0_0_25px_rgba(232,61,132,0.55)] transition hover:brightness-110"
        style={{ background: `linear-gradient(90deg, ${TAPE_MAGENTA}, ${LOOP_TEAL})` }}
      >
        Restart — Clear the Track
      </button>
    </div>
  );
}
