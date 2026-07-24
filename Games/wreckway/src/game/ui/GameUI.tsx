import { SettingsTrigger } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { fieldkitVars } from "@/components/ui/jg-theme";

import { runSessionStore, type RunSession, type SessionSnapshot } from "../run/session";
import { CompactorBar } from "./components/CompactorBar";
import { CorridorMinimap } from "./components/CorridorMinimap";
import { CrushedScreen } from "./components/CrushedScreen";
import { KartDiagram } from "./components/KartDiagram";
import { PickupToast } from "./components/PickupToast";
import { PitRadioTicker } from "./components/PitRadioTicker";
import { StartScreen } from "./components/StartScreen";
import { WinScreen } from "./components/WinScreen";

function toSnapshot(session: RunSession | undefined): SessionSnapshot | null {
  return session === undefined ? null : session.snapshot();
}

export function GameUI() {
  const snapshot = useStore(runSessionStore, toSnapshot);
  const { commands } = useGame();

  if (snapshot === null) return null;

  return (
    <div style={{ ...fieldkitVars, display: "contents" }} className="font-sans">
      <div className="pointer-events-none absolute inset-0 font-sans">
        {snapshot.phase === "start" && <StartScreen onStart={() => commands.run("startRun", {})} />}

        {(snapshot.phase === "running" || snapshot.phase === "won" || snapshot.phase === "crushed") && (
          <>
            <div className="absolute inset-x-0 top-3 flex justify-center px-3">
              <CompactorBar snapshot={snapshot} />
            </div>
            <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
              {/* Default SettingsTrigger skin (Phase 2.3) — no re-authored 8×8 className. */}
              <SettingsTrigger />
              <CorridorMinimap snapshot={snapshot} />
              <KartDiagram snapshot={snapshot} />
            </div>
            <div className="absolute left-3 top-3">
              <PitRadioTicker ticker={snapshot.ticker} />
            </div>
            <div className="absolute inset-x-0 bottom-24 flex justify-center px-3">
              <PickupToast toast={snapshot.toast} />
            </div>
          </>
        )}

        {snapshot.phase === "won" && <WinScreen snapshot={snapshot} onRestart={() => commands.run("restart", {})} />}
        {snapshot.phase === "crushed" && (
          <CrushedScreen snapshot={snapshot} onRestart={() => commands.run("restart", {})} />
        )}
      </div>
    </div>
  );
}
