import { useGame, useGameStore } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { SESSION_STORE_KEY, type RaceSession, type SessionSnapshot } from "../race/session";
import { PALETTE } from "./theme";
import { CornerBanner } from "./components/CornerBanner";
import { MemoryMap } from "./components/MemoryMap";
import { RaceHud } from "./components/RaceHud";
import { RadioTicker } from "./components/RadioTicker";
import { ResultsScreen } from "./components/ResultsScreen";
import { SinkFlares } from "./components/SinkFlares";
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
    <div className="pointer-events-none absolute inset-0 font-sans" style={{ color: PALETTE.snowWhite }}>
      {snapshot.phase === "start" && <StartScreen onStart={() => commands.run("confirm", {})} />}

      {(snapshot.phase === "countdown" || snapshot.phase === "racing") && (
        <>
          <RaceHud snapshot={snapshot} />
          <SinkFlares sinkCount={snapshot.sinkCount} maxSinks={snapshot.maxSinks} />
          <MemoryMap snapshot={snapshot} />
          <CornerBanner banner={snapshot.banner} />
          <RadioTicker lines={snapshot.radioLog} />
          {snapshot.phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-7xl font-black drop-shadow-[0_0_20px_rgba(168,218,220,0.6)]"
                style={{ color: PALETTE.snowWhite }}
              >
                {Math.ceil(snapshot.countdown) || "GO"}
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
