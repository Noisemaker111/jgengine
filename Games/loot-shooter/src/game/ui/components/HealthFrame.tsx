import { useDisplayProfile } from "@jgengine/react/display";
import { useEntityStat, usePlayer } from "@jgengine/react/hooks";

export function HealthFrame() {
  const { compact } = useDisplayProfile();
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const level = useEntityStat(userId, "level");
  const xp = useEntityStat(userId, "xp");
  const current = Math.round(health?.current ?? 0);
  const max = Math.round(health?.max ?? 0);
  const percent = health === null || health.max <= 0 ? 0 : (health.current / health.max) * 100;
  const xpPercent = xp === null || xp.max <= 0 ? 0 : (xp.current / xp.max) * 100;
  const low = percent <= 30;

  return (
    <div className={compact ? "min-w-[10rem] max-w-[11rem]" : "min-w-[16rem]"}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-black uppercase tracking-[0.2em] text-cyan-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          Operative
        </span>
        <span className="text-sm font-bold text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          LV {level?.current ?? 1}
        </span>
      </div>
      <div className="relative h-6 skew-x-[-8deg] overflow-hidden rounded-sm border border-black/70 bg-black/70 shadow-lg">
        <div
          className={`h-full transition-[width] duration-200 ease-out ${
            low ? "animate-pulse bg-gradient-to-r from-rose-700 to-rose-500" : "bg-gradient-to-r from-emerald-600 to-lime-400"
          }`}
          style={{ width: `${percent}%` }}
        />
        <span className="absolute inset-0 flex skew-x-[8deg] items-center justify-center text-sm font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
          {current} / {max}
        </span>
      </div>
      <div className="mt-1 h-1.5 skew-x-[-8deg] overflow-hidden rounded-sm bg-black/60">
        <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${xpPercent}%` }} />
      </div>
    </div>
  );
}
