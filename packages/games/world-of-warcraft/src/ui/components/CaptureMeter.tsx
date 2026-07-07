import { captureChance } from "@jgengine/core/scene/captureCheck";
import { CaptureOdds } from "@jgengine/react/components";
import { useEntityStat, usePlayer, useTarget } from "@jgengine/react/hooks";
import { wowPanel } from "../wowStyles";

const CAPTURE_ORB_CATCH_POWER = 1.4;

export function CaptureMeter() {
  const { userId } = usePlayer();
  const targetId = useTarget(userId);
  const health = useEntityStat(targetId ?? "", "health");
  if (targetId === null || health === null) return null;

  const chance = captureChance({
    hpFraction: health.max <= 0 ? 0 : health.current / health.max,
    catchPower: CAPTURE_ORB_CATCH_POWER,
  });

  return (
    <div className={[wowPanel, "px-3 py-2"].join(" ")}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-violet-300">Capture Odds</div>
      <CaptureOdds
        chance={chance}
        className="relative isolate h-4 w-44 overflow-hidden rounded-sm border border-black/60 bg-black/70 text-center text-[10px] leading-4 text-violet-50 shadow-inner"
        fillClassName="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-fuchsia-500"
      />
    </div>
  );
}
