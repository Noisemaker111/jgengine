import { useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { FERRALON } from "../../palette";

function Bar({ percent, from, to, label }: { percent: number; from: string; to: string; label: string }) {
  return (
    <div className="relative h-5 skew-x-[-12deg] overflow-hidden border-2 border-black/80 bg-black/70 shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
      <div
        className="h-full transition-[width] duration-150 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: `linear-gradient(90deg, ${from}, ${to})` }}
      />
      <span className="absolute inset-0 flex skew-x-[12deg] items-center justify-center text-[11px] font-black tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
        {label}
      </span>
    </div>
  );
}

export function VitalsPlate() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const shield = useEntityStat(userId, "shield");
  const level = useEntityStat(userId, "level");
  const xp = useEntityStat(userId, "xp");
  const skillPoints = useEntityStat(userId, "skillPoints");
  const healthPercent = health === null || health.max <= 0 ? 0 : (health.current / health.max) * 100;
  const shieldPercent = shield === null || shield.max <= 0 ? 0 : (shield.current / shield.max) * 100;
  const xpPercent = xp === null || xp.max <= 0 ? 0 : (xp.current / xp.max) * 100;

  return (
    <div className="min-w-[17rem]">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="flex h-9 w-9 skew-x-[-6deg] items-center justify-center border-2 border-black/80 text-lg font-black text-black"
          style={{ background: FERRALON.hudAmber }}
        >
          {level?.current ?? 1}
        </span>
        <span className="text-xs font-black uppercase tracking-[0.25em] text-amber-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          Reclaimer
        </span>
        {(skillPoints?.current ?? 0) > 0 ? (
          <span className="animate-pulse text-[10px] font-bold uppercase tracking-wider text-lime-300">
            [K] +{Math.round(skillPoints?.current ?? 0)} skill pts
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Bar
          percent={shieldPercent}
          from="#1c5f8c"
          to={FERRALON.hudShield}
          label={`${Math.round(shield?.current ?? 0)} / ${Math.round(shield?.max ?? 0)}`}
        />
        <Bar
          percent={healthPercent}
          from="#7a1810"
          to={FERRALON.hudRed}
          label={`${Math.round(health?.current ?? 0)} / ${Math.round(health?.max ?? 0)}`}
        />
        <div className="h-1.5 skew-x-[-12deg] overflow-hidden border border-black/70 bg-black/60">
          <div className="h-full" style={{ width: `${xpPercent}%`, background: FERRALON.hudXp }} />
        </div>
      </div>
    </div>
  );
}
