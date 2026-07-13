import { useEffect, useRef, useState } from "react";

import { SettingsTrigger } from "@jgengine/react";
import { useGameContext } from "@jgengine/react/provider";

import { freshRunState } from "../run/runState";
import { RUN_STORE_KEY, type DeathInfo } from "../run/types";
import { useRunState } from "../run/useRunState";
import { DeathFlash } from "./components/DeathFlash";
import { GhostCensus } from "./components/GhostCensus";
import { LapHud } from "./components/LapHud";
import { PaceBar } from "./components/PaceBar";
import { PhaseDial } from "./components/PhaseDial";
import { ResultsScreen } from "./components/ResultsScreen";
import { StartScreen } from "./components/StartScreen";

const DEATH_FLASH_MS = 1300;

export function GameUI() {
  const ctx = useGameContext();
  const run = useRunState();
  const [showFlash, setShowFlash] = useState(false);
  const lastDeathRef = useRef<DeathInfo | null>(null);

  useEffect(() => {
    if (run === undefined) return undefined;
    if (run.phase === "ended" && run.death !== null && run.death !== lastDeathRef.current) {
      lastDeathRef.current = run.death;
      setShowFlash(true);
      const timeout = window.setTimeout(() => setShowFlash(false), DEATH_FLASH_MS);
      return () => window.clearTimeout(timeout);
    }
    if (run.phase !== "ended") lastDeathRef.current = null;
    return undefined;
  }, [run?.phase, run?.death]);

  if (run === undefined) return null;

  const beginRun = () => ctx.game.commands.run("startRun", {});
  const resetToStart = () => ctx.game.store.set(RUN_STORE_KEY, freshRunState(run ?? null, "start", ctx.time.now()));

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col text-[#f5f2fa]">
      {run.phase === "start" ? (
        <StartScreen bestLaps={run.bestLapsSurvived} onStart={beginRun} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="pointer-events-auto">
              <LapHud run={run} />
            </div>
            <div className="pointer-events-auto ml-auto flex flex-col items-end gap-2">
              <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-[#6247aa]/50 bg-[#12101f]/80 text-base text-[#f5f2fa]/70 shadow-[0_0_18px_rgba(18,16,31,0.8)] transition hover:bg-[#1c1830]/80 hover:text-[#f5f2fa]" />
              <PhaseDial run={run} />
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-end gap-3 p-4">
            <div className="pointer-events-auto">
              <GhostCensus ghosts={run.ghosts} now={run.now} player={run.position} />
            </div>
            <div className="pointer-events-auto">
              <PaceBar run={run} />
            </div>
          </div>
          {run.phase === "ended" ? (
            showFlash && run.death !== null ? (
              <DeathFlash death={run.death} />
            ) : (
              <div className="pointer-events-auto absolute inset-0">
                <ResultsScreen tape={run.tape} death={run.death} onRestart={resetToStart} />
              </div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
