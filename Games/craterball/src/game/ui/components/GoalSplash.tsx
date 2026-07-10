import { useEffect, useRef } from "react";
import { cameraShake } from "@jgengine/shell/camera";
import type { Team } from "../../arena/geometry";

const TEAM_LABEL: Record<Team, string> = { cyan: "CYAN", magenta: "MAGENTA" };
const TEAM_COLOR: Record<Team, string> = { cyan: "#3bc7c4", magenta: "#d94a8c" };

export function GoalSplash({ team, announcerId }: { team: Team; announcerId: number }) {
  const shaken = useRef<number | null>(null);
  useEffect(() => {
    if (shaken.current === announcerId) return;
    shaken.current = announcerId;
    cameraShake(0.65, 2.2);
  }, [announcerId]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-5xl font-black uppercase tracking-wide drop-shadow-[0_0_22px_rgba(0,0,0,0.6)] sm:text-6xl"
        style={{ color: TEAM_COLOR[team] }}
      >
        GOOOAL
      </span>
      <span className="text-lg font-bold uppercase tracking-[0.4em] text-white/90">for {TEAM_LABEL[team]}</span>
    </div>
  );
}
