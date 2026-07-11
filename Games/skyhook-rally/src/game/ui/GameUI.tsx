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
import { useLiveHud } from "./useLiveHud";

export function GameUI() {
  const session = useSession();
  const course = useActiveCourse();
  const live = useLiveHud();

  if (session === undefined) return null;

  if (session.phase === "menu") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <StartScreen courses={courses} session={session} />
      </div>
    );
  }

  if (session.phase === "finished" && course !== undefined) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <ResultsScreen course={course} session={session} />
      </div>
    );
  }

  if (session.phase === "lost" && course !== undefined) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <LoseScreen course={course} />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-4 -translate-x-1/2">{course !== undefined ? <CheckpointTimer course={course} session={session} now={live.now} /> : null}</div>
      <div className="absolute left-1/2 top-[4.6rem] -translate-x-1/2">
        <StreakBadge streak={session.streak} bestStreak={session.bestStreak} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <ApexCrosshair attached={live.attached} apexOpen={live.apexOpen} />
      </div>
      <div className="absolute right-4 top-4">
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
