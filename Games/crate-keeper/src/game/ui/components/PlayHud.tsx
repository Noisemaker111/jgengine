import { SettingsTrigger } from "@jgengine/react";

import type { ActiveView } from "../../store";

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn";
}) {
  const valueColor = tone === "good" ? "#8fd18a" : tone === "warn" ? "#e8b45a" : "#f4e6cf";
  return (
    <div className="flex flex-col items-center rounded-lg bg-black/25 px-3 py-1.5 ring-1 ring-amber-900/40">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/50">{label}</span>
      <span className="text-lg font-bold tabular-nums leading-tight" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

export function PlayHud({ active, onMenu }: { active: ActiveView; onMenu: () => void }) {
  const overPar = active.moves > active.par;
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={onMenu}
          className="flex items-center gap-1.5 rounded-lg bg-black/25 px-3 py-2 text-sm font-semibold text-amber-100/80 ring-1 ring-amber-900/40 transition hover:bg-black/40 hover:text-amber-50"
        >
          <span aria-hidden>‹</span> Levels
        </button>
        <div className="min-w-0 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/60">
            Level {active.index + 1} / 20
          </div>
          <div className="truncate text-lg font-bold text-amber-50">{active.name}</div>
        </div>
        <SettingsTrigger className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/25 px-2 py-2 text-amber-100/80 ring-1 ring-amber-900/40 transition hover:bg-black/40" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Stat label="Moves" value={String(active.moves)} tone={overPar ? "warn" : "default"} />
        <Stat label="Par" value={String(active.par)} tone="good" />
        <Stat label="Pushes" value={String(active.pushes)} />
        <Stat label="Best" value={active.bestMoves === null ? "—" : String(active.bestMoves)} />
      </div>
    </div>
  );
}
