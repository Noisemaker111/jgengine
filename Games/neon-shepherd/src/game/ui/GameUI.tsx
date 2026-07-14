import { SettingsTrigger } from "@jgengine/react";
import { useGame, useGameClock, usePlayer, useSceneEntities } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { PARK_Z, ROAD_Z } from "../constants";
import type { TierId } from "../difficulty/tiers";
import { nearestRoadIndex, nextRoadAhead } from "../session/runState";
import { aliveCount, runStore } from "../session/store";
import { BreathBar } from "./components/BreathBar";
import { CaretakerToast } from "./components/CaretakerToast";
import { CorridorMap } from "./components/CorridorMap";
import { LightsRow } from "./components/LightsRow";
import { LoseScreen } from "./components/LoseScreen";
import { StartScreen } from "./components/StartScreen";
import { WhistleRing } from "./components/WhistleRing";
import { WinScreen } from "./components/WinScreen";

export function GameUI(): React.ReactNode {
  const { userId } = usePlayer();
  const { commands } = useGame();
  const entities = useSceneEntities();
  const clock = useGameClock();
  const run = useStore(runStore);

  const playerEntity = entities.find((entity) => entity.id === userId);
  const shepherd =
    playerEntity !== undefined ? { x: playerEntity.position[0], z: playerEntity.position[2] } : { x: 0, z: PARK_Z };
  const elapsed = run.playStartedAt === null ? 0 : (run.finishedAt ?? clock.now - run.playStartedAt);
  const saved = aliveCount(run);
  const roadIndex = nextRoadAhead(shepherd.z, ROAD_Z) ?? nearestRoadIndex(shepherd.z, ROAD_Z);

  const selectTier = (tier: TierId) => commands.run("selectTier", { tier });
  const start = () => commands.run("start", { tier: run.tier });
  const restart = () => commands.run("restart", {});
  const toggleMap = () => commands.run("toggleMap", {});

  if (run.phase === "start") {
    return <StartScreen tier={run.tier} onSelectTier={selectTier} onStart={start} />;
  }
  if (run.phase === "won") {
    return <WinScreen saved={saved} medal={run.medal} elapsed={run.finishedAt ?? 0} onRestart={restart} />;
  }
  if (run.phase === "lost") {
    return <LoseScreen saved={saved} roadIndex={run.lostAtRoadIndex} onRestart={restart} />;
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <LightsRow run={run} elapsed={elapsed} />
          <BreathBar roadIndex={roadIndex} tier={run.tier} t={elapsed} />
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1">
          <SettingsTrigger className="flex h-8 w-8 items-center justify-center rounded-full border border-[#7ef9c8]/20 bg-[#101318]/70 text-[#f5c56b] backdrop-blur-sm transition-colors hover:bg-[#101318]" />
          <CorridorMap run={run} shepherd={shepherd} size={run.mapOpen ? 240 : 132} />
          <button
            type="button"
            onClick={toggleMap}
            className="rounded bg-[#101318]/70 px-2 py-1 text-[10px] font-semibold text-[#f5c56b] transition-colors hover:bg-[#101318]"
          >
            M · map
          </button>
        </div>
      </div>

      <div className="pointer-events-auto flex justify-center">
        <CaretakerToast toasts={run.toasts} />
      </div>

      <div className="flex items-end justify-between">
        <div className="pointer-events-auto">
          <WhistleRing whistle={run.whistle} now={elapsed} holding={run.hold.holding} />
        </div>
        <button
          type="button"
          onClick={restart}
          className="pointer-events-auto rounded bg-[#101318]/70 px-2 py-1 text-[10px] font-semibold text-[#eef4f0]/70 transition-colors hover:bg-[#101318]"
        >
          R · restart
        </button>
      </div>
    </div>
  );
}
