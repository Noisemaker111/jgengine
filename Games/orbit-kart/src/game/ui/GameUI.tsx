import { useGame, useGameStore } from "@jgengine/react/hooks";
import { SettingsTrigger } from "@jgengine/react";
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
          <SettingsTrigger className="pointer-events-auto absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-[#f5f3ff]/20 bg-[#0a0820]/90 text-[#f5f3ff] shadow-[0_0_30px_rgba(0,0,0,0.55)] backdrop-blur transition hover:bg-[#f5f3ff]/15 sm:right-4 sm:top-4" />
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
