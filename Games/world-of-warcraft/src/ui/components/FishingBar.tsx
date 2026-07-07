import { useEffect, useState } from "react";
import { SkillCheckBar } from "@jgengine/react/components";
import { usePlayer } from "@jgengine/react/hooks";
import { fishingCheckConfig, fishingSessionStartedAt } from "../../combat/skillCheckSessions";
import { wowPanel } from "../wowStyles";

export function FishingBar() {
  const { userId } = usePlayer();
  const [, tick] = useState(0);
  useEffect(() => {
    let frame: number;
    const step = () => {
      tick((n) => n + 1);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);
  const startedAt = fishingSessionStartedAt(userId);
  if (startedAt === undefined) return null;

  return (
    <div className={[wowPanel, "px-4 py-3"].join(" ")}>
      <div className="mb-2 text-center text-[11px] font-bold uppercase tracking-widest text-cyan-200">
        Reel it in — press Fishing Rod again in the zone!
      </div>
      <SkillCheckBar
        config={fishingCheckConfig}
        startedAt={startedAt}
        className="w-72"
        trackClassName="h-5 w-full overflow-hidden rounded-sm border border-black/60 bg-black/70 shadow-inner"
        zoneClassName="bg-gradient-to-b from-emerald-400/80 to-emerald-600/80"
        markerClassName="w-1.5 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
      />
    </div>
  );
}
