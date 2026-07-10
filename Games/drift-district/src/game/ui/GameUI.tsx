import { useGame, useGameStore } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { SESSION_STORE_KEY, type RaceSession, type SessionSnapshot } from "../race/session";
import { DriftMeterHud } from "./components/DriftMeterHud";
import { Minimap } from "./components/Minimap";
import { RaceHud } from "./components/RaceHud";
import { RaceToastLayer } from "./components/RaceToast";
import { ResultsScreen } from "./components/ResultsScreen";
import { StartScreen } from "./components/StartScreen";

function readSnapshot(ctx: GameContext): SessionSnapshot | null {
  const session = ctx.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined;
  return session === undefined ? null : session.snapshot();
}

export function GameUI() {
  const snapshot = useGameStore(readSnapshot);
  const { commands } = useGame();

  if (snapshot === null) return null;

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-[#e8e6f0]">
      {snapshot.phase === "start" && (
        <StartScreen onStart={() => commands.run("confirm", {})} />
      )}

      {(snapshot.phase === "countdown" || snapshot.phase === "racing") && (
        <>
          <RaceHud snapshot={snapshot} />
          <Minimap snapshot={snapshot} />
          <DriftMeterHud snapshot={snapshot} />
          <RaceToastLayer toast={snapshot.toast} />
          {snapshot.phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-7xl font-black text-[#e8e6f0] drop-shadow-[0_0_20px_rgba(255,45,120,0.6)]">
                {Math.ceil(snapshot.countdown) || "SEND IT"}
              </span>
            </div>
          )}
        </>
      )}

      {snapshot.phase === "finished" && (
        <ResultsScreen snapshot={snapshot} onRestart={() => commands.run("restart", {})} />
      )}
    </div>
  );
}
