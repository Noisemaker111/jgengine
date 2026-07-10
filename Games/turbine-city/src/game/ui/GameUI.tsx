import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import { SESSION_STORE_KEY, type RaceSession, type SessionSnapshot } from "../race/session";
import { BuffetVignette } from "./components/BuffetVignette";
import { CenteringHud } from "./components/CenteringHud";
import { ControllerToastLayer } from "./components/ControllerToast";
import { CountdownOverlay } from "./components/CountdownOverlay";
import { FanBoard } from "./components/FanBoard";
import { FlightDeck } from "./components/FlightDeck";
import { Minimap } from "./components/Minimap";
import { RaceHud } from "./components/RaceHud";
import { ResultsScreen } from "./components/ResultsScreen";
import { RingPointer } from "./components/RingPointer";
import { StartScreen } from "./components/StartScreen";

function readSnapshot(ctx: GameContext): SessionSnapshot | null {
  const session = ctx.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined;
  return session === undefined ? null : session.snapshot();
}

export function GameUI() {
  const snapshot = useGameStore(readSnapshot);
  const { commands } = useGame();

  if (snapshot === null) return null;

  const racingHud = snapshot.phase === "racing" || snapshot.phase === "countdown";

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      {snapshot.phase === "start" && <StartScreen snapshot={snapshot} onStart={() => commands.run("start", {})} />}

      {racingHud && (
        <>
          <BuffetVignette snapshot={snapshot} />
          <RaceHud snapshot={snapshot} />
          <Minimap snapshot={snapshot} />
          <FanBoard snapshot={snapshot} />
          <FlightDeck snapshot={snapshot} />
          {snapshot.phase === "racing" && <CenteringHud snapshot={snapshot} />}
          {snapshot.phase === "racing" && <RingPointer snapshot={snapshot} />}
          <CountdownOverlay snapshot={snapshot} />
          <ControllerToastLayer toast={snapshot.toast} />
        </>
      )}

      {snapshot.phase === "finished" && <ResultsScreen snapshot={snapshot} onRestart={() => commands.run("restart", {})} />}
    </div>
  );
}
