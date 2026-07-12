import { useCurrency, useEntityStat, usePlayer } from "@jgengine/react/hooks";

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-[10px] font-black uppercase tracking-widest text-black/70">{label}</span>
      <div className="h-3 w-36 -skew-x-12 border-2 border-black bg-[#12141a]">
        <div className="h-full" style={{ width: `${fraction * 100}%`, background: color }} />
      </div>
      <span className="text-xs font-black tabular-nums">{Math.round(value)}</span>
    </div>
  );
}

export function StatusPanel() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const armor = useEntityStat(userId, "armor");
  const cash = useCurrency("cash");
  return (
    <div className="flex flex-col gap-1 rounded-sm border-2 border-black bg-[#f4e8c8] px-3 py-2 text-[#1b1e26] shadow-[4px_4px_0_#000]">
      <Bar label="HP" value={health?.current ?? 0} max={health?.max ?? 100} color="#3fbf5a" />
      <Bar label="AR" value={armor?.current ?? 0} max={armor?.max ?? 100} color="#4fa5e8" />
      <div className="mt-0.5 -skew-x-6 self-start border-2 border-black bg-[#2f8f4e] px-2 py-0.5 text-sm font-black text-[#eaffdd]">
        ${cash.toLocaleString()}
      </div>
    </div>
  );
}
