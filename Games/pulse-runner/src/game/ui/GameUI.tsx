import { SettingsTrigger } from "@jgengine/react";

import { useRunnerSnapshot } from "../session/engineStore";
import { AccuracyTicker, BeatBar, MovementProgress, PulseMandala, ResonanceFlash, StrikeMarks } from "./components/Hud";
import { LoseScreen, StartScreen, WinScreen } from "./components/Screens";

export function GameUI() {
  const snapshot = useRunnerSnapshot();
  if (snapshot === undefined) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col text-[#f8f4ff]">
      <div className="pointer-events-auto absolute right-4 top-4">
        <SettingsTrigger className="flex h-9 w-9 items-center justify-center rounded-full border border-[#6d5f8d] bg-[#241b3a]/70 text-[#ffd166] backdrop-blur transition-colors hover:bg-[#ffd166]/15" />
      </div>

      {snapshot.phase === "playing" || snapshot.phase === "idle" ? <ResonanceFlash snapshot={snapshot} /> : null}

      <div className="flex justify-center pt-4">
        {snapshot.phase === "playing" ? <MovementProgress snapshot={snapshot} /> : null}
      </div>

      <div className="flex-1" />

      {snapshot.phase === "idle" ? (
        <div className="pointer-events-auto flex flex-1 items-center justify-center px-4">
          <StartScreen />
        </div>
      ) : null}

      {snapshot.phase === "won" ? (
        <div className="pointer-events-auto flex flex-1 items-center justify-center px-4">
          <WinScreen snapshot={snapshot} />
        </div>
      ) : null}

      {snapshot.phase === "lost" ? (
        <div className="pointer-events-auto flex flex-1 items-center justify-center px-4">
          <LoseScreen snapshot={snapshot} />
        </div>
      ) : null}

      {snapshot.phase === "playing" ? (
        <div className="flex flex-col items-center gap-3 pb-6">
          <AccuracyTicker snapshot={snapshot} />
          <div className="flex items-end gap-6">
            <StrikeMarks snapshot={snapshot} />
            <PulseMandala snapshot={snapshot} />
            <div className="flex flex-col items-center gap-2">
              <BeatBar snapshot={snapshot} />
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#6d5f8d]">
                {Math.round(snapshot.accuracy * 100)}% accuracy
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
