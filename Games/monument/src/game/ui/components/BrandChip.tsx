import type { ReactNode } from "react";

export function BrandChip({ day, hour, minute }: { day: number; hour: number; minute: number }): ReactNode {
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="relative block h-8 w-7 shrink-0 bg-[#171916]">
        <span className="absolute right-1 top-1 h-1.5 w-1.5 bg-[#d7ff43]" />
      </span>
      <div className="flex flex-col">
        <span className="text-[15px] font-extrabold uppercase leading-none tracking-[0.18em] text-[#171916]">
          Monument
        </span>
        <span className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#6d7069]">
          Day {day} · {clock}
        </span>
      </div>
    </div>
  );
}
