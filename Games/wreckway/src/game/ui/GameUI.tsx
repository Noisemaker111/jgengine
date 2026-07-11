import { useGame, useGameStore } from "@jgengine/react/hooks";
import { SettingsTrigger } from "@jgengine/react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { RUN_STORE_KEY, type RunSession, type SessionSnapshot } from "../run/session";
import { CompactorBar } from "./components/CompactorBar";
import { CorridorMinimap } from "./components/CorridorMinimap";
import { CrushedScreen } from "./components/CrushedScreen";
import { KartDiagram } from "./components/KartDiagram";
import { PickupToast } from "./components/PickupToast";
import { PitRadioTicker } from "./components/PitRadioTicker";
import { StartScreen } from "./components/StartScreen";
import { WinScreen } from "./components/WinScreen";

function readSnapshot(ctx: GameContext): SessionSnapshot | null {
  const session = ctx.game.store.get(RUN_STORE_KEY) as RunSession | undefined;
  return session === undefined ? null : session.snapshot();
}

export function GameUI() {
  const snapshot = useGameStore(readSnapshot);
  const { commands } = useGame();

  if (snapshot === null) return null;

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      {snapshot.phase === "start" && <StartScreen onStart={() => commands.run("startRun", {})} />}

      {(snapshot.phase === "running" || snapshot.phase === "won" || snapshot.phase === "crushed") && (
        <>
          <div className="absolute inset-x-0 top-3 flex justify-center px-3">
            <CompactorBar snapshot={snapshot} />
          </div>
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded border border-[#8d99a6]/40 bg-[#1c1a17]/85 text-[#f0c419] transition hover:bg-[#8d99a6]/20" />
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
      {snapshot.phase === "crushed" && <CrushedScreen snapshot={snapshot} onRestart={() => commands.run("restart", {})} />}
    </div>
  );
}
