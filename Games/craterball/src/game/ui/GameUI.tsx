import { useMatchSnapshot } from "../match/hooks";
import { AnnouncerTicker } from "./components/AnnouncerTicker";
import { ChargeSlots } from "./components/ChargeSlots";
import { EndScreen } from "./components/EndScreen";
import { GoalSplash } from "./components/GoalSplash";
import { KickoffOverlay } from "./components/KickoffOverlay";
import { ScarsTicker } from "./components/ScarsTicker";
import { Scoreboard } from "./components/Scoreboard";
import { StartScreen } from "./components/StartScreen";

export function GameUI() {
  const snapshot = useMatchSnapshot();

  if (!snapshot.started) return <StartScreen />;
  if (snapshot.phase === "fulltime") return <EndScreen snapshot={snapshot} />;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-white">
      <div className="absolute inset-x-0 top-3 flex justify-center px-3 sm:top-4">
        <Scoreboard snapshot={snapshot} />
      </div>

      <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4">
        <ChargeSlots slots={snapshot.cyanCharges} dodgeFraction={snapshot.dodgeFraction} />
      </div>

      <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4">
        <ScarsTicker craterScars={snapshot.craterScars} craterCount={snapshot.craterCount} />
      </div>

      <div className="absolute inset-x-0 bottom-24 flex justify-center px-3 sm:bottom-28">
        <AnnouncerTicker line={snapshot.announcerLine} announcerId={snapshot.announcerId} />
      </div>

      {snapshot.phase === "kickoff" ? (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <KickoffOverlay kickoffTimer={snapshot.kickoffTimer} kickoffCount={snapshot.kickoffCount} />
        </div>
      ) : null}

      {snapshot.phase === "goal" && snapshot.lastGoalTeam !== null ? (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <GoalSplash team={snapshot.lastGoalTeam} announcerId={snapshot.announcerId} />
        </div>
      ) : null}
    </div>
  );
}
