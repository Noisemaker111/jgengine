export function StaminaBar({ fraction }: { fraction: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const low = pct < 25;
  return (
    <div className="flex w-56 flex-col gap-1 rounded-md border border-[#c9c4b8]/40 bg-black/55 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#c9c4b8]">
        <span>Stamina</span>
        <span className={low ? "text-[#b3573f]" : "text-[#c9c4b8]"}>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${low ? "bg-[#b3573f]" : "bg-[#f2b950]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
