import { useEntityStat, usePlayer } from "@jgengine/react/hooks";

export function HealthFrame() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const level = useEntityStat(userId, "level");
  const current = Math.round(health?.current ?? 0);
  const max = Math.round(health?.max ?? 0);
  const percent = health === null || health.max <= 0 ? 0 : (health.current / health.max) * 100;

  return (
    <div className="min-w-[15rem] rounded-md border border-cyan-400/30 bg-slate-950/80 p-3 shadow-lg backdrop-blur-sm">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-bold uppercase tracking-wider text-cyan-100">Operative</span>
        <span className="text-sm font-semibold text-cyan-300/90">Lv {level?.current ?? 1}</span>
      </div>
      <div className="relative h-5 overflow-hidden rounded border border-black/60 bg-black/70">
        <div
          className="h-full bg-gradient-to-r from-rose-600 to-red-400 transition-[width] duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
          {current} / {max}
        </span>
      </div>
    </div>
  );
}
