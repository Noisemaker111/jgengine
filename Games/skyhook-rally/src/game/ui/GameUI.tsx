import { SettingsTrigger } from "@jgengine/react";

import { archipelago, courses } from "../../world";
import { AltitudeTick } from "./components/AltitudeTick";
import { ApexCrosshair } from "./components/ApexCrosshair";
import { ArchipelagoMap } from "./components/ArchipelagoMap";
import { CheckpointTimer } from "./components/CheckpointTimer";
import { LoseScreen } from "./components/LoseScreen";
import { MarshalToasts } from "./components/MarshalToasts";
import { ResultsScreen } from "./components/ResultsScreen";
import { StartScreen } from "./components/StartScreen";
import { StreakBadge } from "./components/StreakBadge";
import { useActiveCourse, useSession } from "./selectors";
import { panelClass } from "./theme";
import { useLiveHud } from "./useLiveHud";

function SettingsGear() {
  return (
    <div className="pointer-events-auto fixed right-4 top-4 z-10">
      <SettingsTrigger className={`${panelClass} flex h-9 w-9 items-center justify-center !p-0 text-[#f4efe6]`} />
    </div>
  );
}

export function GameUI() {
  const session = useSession();
  const course = useActiveCourse();
  const live = useLiveHud();

  if (session === undefined) return null;

  if (session.phase === "menu") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <SettingsGear />
        <StartScreen courses={courses} session={session} />
      </div>
    );
  }

  if (session.phase === "finished" && course !== undefined) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <SettingsGear />
        <ResultsScreen course={course} session={session} />
      </div>
    );
  }

  if (session.phase === "lost" && course !== undefined) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <SettingsGear />
        <LoseScreen course={course} />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      <SettingsGear />
      <div className="absolute left-1/2 top-4 -translate-x-1/2">{course !== undefined ? <CheckpointTimer course={course} session={session} now={live.now} /> : null}</div>
      <div className="absolute left-1/2 top-[4.6rem] -translate-x-1/2">
        <StreakBadge streak={session.streak} bestStreak={session.bestStreak} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <ApexCrosshair attached={live.attached} apexOpen={live.apexOpen} />
      </div>
      <div className="absolute right-4 top-16">
        <ArchipelagoMap archipelago={archipelago} course={course} checkpointsHit={session.checkpointsHit} playerPosition={live.position} />
      </div>
      <div className="absolute bottom-4 left-4">
        <AltitudeTick altitude={live.altitude} />
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <MarshalToasts toasts={session.toasts} />
      </div>
    </div>
  );
}
