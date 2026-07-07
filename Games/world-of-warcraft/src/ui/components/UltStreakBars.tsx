import { useEventMeter, usePlayer } from "@jgengine/react/hooks";
import { streakMeterFor, ultMeterFor } from "../../combat/playerKits";
import { wowBarTrack } from "../wowStyles";

const STREAK_TIER_LABEL: Record<string, string> = {
  D: "D Rank",
  C: "C Rank",
  B: "B Rank",
  S: "S Rank",
};

const STREAK_TIER_COLOR: Record<string, string> = {
  D: "text-stone-200",
  C: "text-sky-300",
  B: "text-violet-300",
  S: "text-amber-300",
};

export function UltStreakBars() {
  const { userId } = usePlayer();
  const ult = useEventMeter(ultMeterFor(userId));
  const streak = useEventMeter(streakMeterFor(userId));
  const ultPercent = Math.round(ult.fraction * 100);
  const streakTier = streak.tier;

  return (
    <div className="flex w-64 flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-amber-200/90">
          <span>Ultimate</span>
          <span className={ult.ready ? "text-amber-300" : "text-stone-400"}>
            {ult.ready ? "READY" : `${ultPercent}%`}
          </span>
        </div>
        <div
          className={[
            wowBarTrack,
            "h-4",
            ult.ready ? "border-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.7)]" : "",
          ].join(" ")}
        >
          <div
            className={[
              "absolute inset-y-0 left-0 h-full transition-[width] duration-200 ease-out",
              ult.ready
                ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 animate-pulse"
                : "bg-gradient-to-r from-fuchsia-600 via-purple-500 to-indigo-500",
            ].join(" ")}
            style={{ width: `${ult.ready ? 100 : ultPercent}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-stone-300">
          <span>Combo Streak</span>
          <span className={streakTier !== null ? STREAK_TIER_COLOR[streakTier] : "text-stone-500"}>
            {streakTier !== null ? STREAK_TIER_LABEL[streakTier] : "—"}
          </span>
        </div>
        <div className={[wowBarTrack, "h-4"].join(" ")}>
          <div
            className="absolute inset-y-0 left-0 h-full bg-gradient-to-r from-rose-600 via-orange-500 to-amber-400 transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(streak.fraction * 100)}%` }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {Math.round(streak.value)} kill streak
          </div>
        </div>
      </div>
    </div>
  );
}
