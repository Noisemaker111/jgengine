import type { ReactNode } from "react";
import { useGame } from "@jgengine/react/hooks";
import { WAVE_COUNT } from "../../waves/manifest";
import { useRecords, useRun } from "./useRun";

function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-black/65 via-black/25 to-black/70"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--jg-hud-dock-clearance, 0px))" }}
    >
      {children}
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-8 min-h-12 rounded-md border border-amber-400/70 bg-amber-500/15 px-10 py-3 text-lg font-black uppercase tracking-[0.2em] text-amber-200 shadow-[0_0_18px_rgba(245,166,35,0.25)] transition-colors hover:bg-amber-500/30"
    >
      {label}
    </button>
  );
}

function StatLine({ run }: { run: ReturnType<typeof useRun> }) {
  const accuracy = run.shotsFired === 0 ? 0 : Math.round((run.shotsHit / run.shotsFired) * 100);
  return (
    <div className="mt-4 flex gap-6 text-sm font-semibold uppercase tracking-wider text-slate-300">
      <span>
        Score <span className="text-cyan-200">{run.score}</span>
      </span>
      <span>
        Kills <span className="text-cyan-200">{run.kills}</span>
      </span>
      <span>
        Accuracy <span className="text-cyan-200">{accuracy}%</span>
      </span>
      <span>
        Time <span className="text-cyan-200">{Math.floor(run.elapsed / 60)}:{String(Math.floor(run.elapsed % 60)).padStart(2, "0")}</span>
      </span>
    </div>
  );
}

function RecordsLine() {
  const records = useRecords();
  if (records.score === undefined) return null;
  return (
    <div className="mt-3 flex gap-5 text-xs font-semibold uppercase tracking-widest text-slate-400">
      <span>
        Best score <span className="text-amber-300">{records.score}</span>
      </span>
      {records.wave !== undefined ? (
        <span>
          Best wave <span className="text-amber-300">{records.wave}</span>
        </span>
      ) : null}
      {records.accuracy !== undefined ? (
        <span>
          Best accuracy <span className="text-amber-300">{records.accuracy}%</span>
        </span>
      ) : null}
    </div>
  );
}

export function RunScreens() {
  const run = useRun();
  const { commands } = useGame();
  const start = () => commands.run("run.start", {});
  const endless = () => commands.run("run.endless", {});

  if (run.status === "ready") {
    return (
      <ScreenShell>
        <span className="text-xs font-bold uppercase tracking-[0.5em] text-amber-400">The salvage yard</span>
        <h1 className="mt-2 text-6xl font-black uppercase tracking-[0.15em] text-slate-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          Loot Shooter
        </h1>
        <p className="mt-4 max-w-md text-center text-sm font-medium leading-relaxed text-slate-300">
          {WAVE_COUNT} waves of scav machines are coming for the yard. Drop them, grab whatever
          outguns your kit, and hold the line.
        </p>
        <RecordsLine />
        <ActionButton label="Deploy" onClick={start} />
      </ScreenShell>
    );
  }

  if (run.status === "victory") {
    return (
      <ScreenShell>
        <span className="text-5xl font-black uppercase tracking-[0.2em] text-amber-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
          Yard secured
        </span>
        <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
          All {WAVE_COUNT} waves cleared
        </span>
        <StatLine run={run} />
        <RecordsLine />
        <div className="flex gap-4">
          <ActionButton label="Endless mode" onClick={endless} />
          <ActionButton label="Run it back" onClick={start} />
        </div>
      </ScreenShell>
    );
  }

  if (run.status === "defeat") {
    return (
      <ScreenShell>
        <span className="text-5xl font-black uppercase tracking-[0.2em] text-rose-500 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
          Operative down
        </span>
        <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
          Overrun on wave {run.wave}
          {run.endless ? " — endless" : ""}
        </span>
        <StatLine run={run} />
        <RecordsLine />
        <ActionButton label="Redeploy" onClick={start} />
      </ScreenShell>
    );
  }

  return null;
}
