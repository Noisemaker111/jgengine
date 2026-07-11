import type { ReactNode } from "react";

import type { ModeKey } from "../../codebreaker";
import type { RecordsSnapshot } from "../../records";
import type { GameResult } from "../../state";
import { Btn, KeyHint } from "./widgets";

const MODE_LABEL: Record<ModeKey, string> = {
  "6-dup": "6 colors · repeats",
  "6-uniq": "6 colors · no repeats",
  "8-dup": "8 colors · repeats",
  "8-uniq": "8 colors · no repeats",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] uppercase tracking-wider text-amber-100/50">{label}</span>
      <span className="text-base font-bold tabular-nums text-amber-100">{value}</span>
    </div>
  );
}

export function TitleCard() {
  return (
    <div className="rounded-xl border border-amber-200/10 bg-[#241a12]/85 px-3 py-2 shadow-lg backdrop-blur">
      <div className="text-sm font-black tracking-wide text-amber-100">CODEBREAKER</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/50">crack the hidden code</div>
    </div>
  );
}

export function RecordsPanel({ records, mode }: { records: RecordsSnapshot; mode: ModeKey }) {
  const record = records[mode];
  return (
    <div className="w-52 rounded-xl border border-amber-200/10 bg-[#241a12]/90 p-3 shadow-xl backdrop-blur">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200/70">Records</div>
      <div className="mb-2 text-xs text-amber-100/60">{MODE_LABEL[mode]}</div>
      <div className="flex flex-col gap-1.5">
        <Stat label="Streak" value={record.streak} />
        <Stat label="Best streak" value={record.bestStreak} />
        <Stat label="Fewest" value={record.fewest ?? "—"} />
      </div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-bold text-amber-950">{children}</span>
  );
}

export function ResultBanner({ result, onAgain }: { result: GameResult; onAgain: () => void }) {
  const plural = result.guesses === 1 ? "guess" : "guesses";
  return (
    <div className="cb-rise flex flex-col items-center gap-2 rounded-xl border border-amber-200/15 bg-[#1c140d]/95 px-6 py-4 text-center shadow-2xl backdrop-blur">
      {result.won ? (
        <>
          <div className="text-xl font-black text-emerald-300">Cracked it!</div>
          <div className="text-sm text-amber-100/80">
            Solved in {result.guesses} {plural}
            {result.kind === "ranked" ? ` · streak ${result.streak}` : ""}
          </div>
          {(result.newBestStreak || result.newFewest) && (
            <div className="flex gap-2">
              {result.newBestStreak && <Badge>Best streak!</Badge>}
              {result.newFewest && <Badge>Fewest guesses!</Badge>}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-xl font-black text-red-300">Code locked</div>
          <div className="text-sm text-amber-100/80">Out of guesses — the secret is revealed above</div>
        </>
      )}
      <button
        type="button"
        onClick={onAgain}
        className="mt-1 inline-flex items-center rounded-lg bg-emerald-500/90 px-4 py-1.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400"
      >
        Play again
        <KeyHint action="newGame" />
      </button>
    </div>
  );
}
