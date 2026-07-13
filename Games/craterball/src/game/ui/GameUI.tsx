import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
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
  const layout = useHudLayout({ storageKey: "craterball" });

  if (!snapshot.started) return <StartScreen />;
  if (snapshot.phase === "fulltime") return <EndScreen snapshot={snapshot} />;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-white">
      <HudCanvas layout={layout}>
        <HudPanel id="Scoreboard" anchor="top" interactive={false}>
          <Scoreboard snapshot={snapshot} />
        </HudPanel>

        <HudPanel id="Settings" anchor="top-right" order={-1}>
          <SettingsTrigger className="rounded-lg border border-[#cdb891]/25 bg-[#160f0c]/80 px-3 py-1.5 text-[#ff6b35] shadow-lg shadow-black/40 backdrop-blur-sm transition-colors hover:border-[#cdb891]/40" />
        </HudPanel>

        <HudPanel id="Announcer" anchor="bottom" order={1} interactive={false}>
          <AnnouncerTicker line={snapshot.announcerLine} announcerId={snapshot.announcerId} />
        </HudPanel>

        <HudPanel id="Charges" anchor="bottom-left" interactive={false}>
          <ChargeSlots slots={snapshot.cyanCharges} dodgeFraction={snapshot.dodgeFraction} />
        </HudPanel>

        <HudPanel id="Scars" anchor="bottom-right" interactive={false}>
          <ScarsTicker craterScars={snapshot.craterScars} craterCount={snapshot.craterCount} />
        </HudPanel>
      </HudCanvas>

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
