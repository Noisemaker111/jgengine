import { SLOW_BALL_SECONDS, WIDE_PADDLE_SECONDS } from "../../breakout/constants";
import { POWERUPS } from "../../breakout/powerups";
import type { BrickBreakerSnapshot } from "../../breakout/store";

function TimerChip({ def, remaining, total }: { def: { glyph: string; name: string; color: string }; remaining: number; total: number }) {
  const pct = Math.max(0, Math.min(1, remaining / total));
  return (
    <div className="flex min-w-[128px] items-center gap-2 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-black text-black"
        style={{ background: def.color, boxShadow: `0 0 10px ${def.color}` }}
      >
        {def.glyph}
      </span>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">{def.name}</span>
          <span className="font-mono text-[11px] font-bold" style={{ color: def.color }}>
            {remaining.toFixed(1)}s
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${pct * 100}%`, background: def.color }} />
        </div>
      </div>
    </div>
  );
}

export function PowerupBar({ snapshot }: { snapshot: BrickBreakerSnapshot }) {
  const active = snapshot.wideMs > 0 || snapshot.slowMs > 0;
  return (
    <div className="flex min-h-[44px] w-full items-center justify-center gap-3">
      {snapshot.wideMs > 0 && <TimerChip def={POWERUPS.wide} remaining={snapshot.wideMs} total={WIDE_PADDLE_SECONDS} />}
      {snapshot.slowMs > 0 && <TimerChip def={POWERUPS.slow} remaining={snapshot.slowMs} total={SLOW_BALL_SECONDS} />}
      {!active && (
        <span className="text-[11px] uppercase tracking-[0.25em] text-slate-600">No active power-ups</span>
      )}
    </div>
  );
}
