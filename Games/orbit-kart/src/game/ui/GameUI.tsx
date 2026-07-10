import { useGame, useGameStore } from "@jgengine/react/hooks";
import { readSnapshot } from "../race/sessionStore";
import { AnnouncerTicker, RaceHud } from "./components/RaceHud";
import { ClusterMinimap } from "./components/ClusterMinimap";
import { ResultsScreen } from "./components/ResultsScreen";
import { StartScreen } from "./components/StartScreen";

export function GameUI() {
  const snapshot = useGameStore(readSnapshot);
  const { commands } = useGame();

  if (snapshot === null) return null;

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-[#f5f3ff]">
      {snapshot.phase === "start" && <StartScreen onStart={() => commands.run("startRace", {})} />}

      {(snapshot.phase === "countdown" || snapshot.phase === "racing") && (
        <>
          <RaceHud snapshot={snapshot} />
          <ClusterMinimap />
          <AnnouncerTicker snapshot={snapshot} />
          {snapshot.phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-7xl font-black text-[#f5f3ff] drop-shadow-[0_0_22px_rgba(127,216,190,0.6)]">
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
