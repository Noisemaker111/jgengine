import type { TelegraphEntry } from "../../rail/controller";

export interface TelegraphTickerProps {
  entries: readonly TelegraphEntry[];
}

export function TelegraphTicker({ entries }: TelegraphTickerProps) {
  const latest = entries[0];
  if (latest === undefined) return null;
  return (
    <div className="pointer-events-none flex w-[min(92vw,520px)] items-center gap-2 rounded-sm border-2 border-[#a98467] bg-[#211d14]/90 px-3 py-1.5 shadow-[0_4px_0_rgba(0,0,0,0.4)]">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#bc4749]" />
      <span key={latest.id} className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-[#f2e8cf]">
        {latest.text}
      </span>
    </div>
  );
}
