import { useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { AnimatedResourceBar } from "./AnimatedResourceBar";

export function PlayerFrame() {
  const { userId } = usePlayer();
  const level = useEntityStat(userId, "level");
  const xp = useEntityStat(userId, "xp");
  const xpPercent = xp === null || xp.max <= 0 ? 0 : (xp.current / xp.max) * 100;

  return (
    <div className="min-w-[16rem] drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-lg font-bold text-amber-50">Hero</span>
        <span className="text-sm font-semibold text-amber-200/90">Lv {level?.current ?? 1}</span>
      </div>
      <div className="space-y-1">
        <AnimatedResourceBar
          instanceId={userId}
          statId="health"
          mode="health"
          fillClassName="bg-gradient-to-r from-red-700 to-red-500"
          label="Health"
          textClassName="text-red-50"
        />
        <AnimatedResourceBar
          instanceId={userId}
          statId="mana"
          mode="mana"
          fillClassName="bg-gradient-to-r from-blue-800 to-blue-500"
          label="Mana"
          textClassName="text-blue-50"
        />
        <div className="relative h-2 overflow-hidden rounded-sm bg-black/60">
          <div
            className="h-full bg-gradient-to-r from-amber-700 to-amber-400 transition-[width] duration-300 ease-out"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}