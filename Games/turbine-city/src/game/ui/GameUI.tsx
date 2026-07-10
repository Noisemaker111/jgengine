import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import { SESSION_STORE_KEY, type RaceSession, type SessionSnapshot } from "../race/session";
import { BuffetVignette } from "./components/BuffetVignette";
import { CenteringHud } from "./components/CenteringHud";
import { ControllerToastLayer } from "./components/ControllerToast";
import { Minimap } from "./components/Minimap";
import { RaceHud } from "./components/RaceHud";
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
    <div className="pointer-events-none absolute inset-0 font-sans">
      {snapshot.phase === "start" && <StartScreen onStart={() => commands.run("start", {})} />}

      {snapshot.phase === "racing" && (
        <>
          <BuffetVignette snapshot={snapshot} />
          <RaceHud snapshot={snapshot} />
          <Minimap snapshot={snapshot} />
          <CenteringHud snapshot={snapshot} />
          <ControllerToastLayer toast={snapshot.toast} />
        </>
      )}

      {snapshot.phase === "finished" && <ResultsScreen snapshot={snapshot} onRestart={() => commands.run("restart", {})} />}
    </div>
  );
}
