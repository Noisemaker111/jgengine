import type { BrickBreakerSnapshot } from "../../breakout/store";

function StatChip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-sm">
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</span>
      <span className="font-mono text-base font-bold leading-tight" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

export function Hud({ snapshot, compact }: { snapshot: BrickBreakerSnapshot; compact: boolean }) {
  const hearts = Math.min(snapshot.lives, 6);
  return (
    <div className="flex w-full items-center justify-between gap-2 px-1">
      {!compact && (
        <div className="text-lg font-black uppercase tracking-[0.3em] text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
          Brick Breaker
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <StatChip label="Score" value={snapshot.score.toLocaleString()} accent="#67e8f9" />
        <StatChip label="Best" value={snapshot.best.toLocaleString()} accent="#fbbf24" />
        <StatChip label="Level" value={`${snapshot.level}/${snapshot.totalLevels}`} accent="#e879f9" />
        <div className="flex flex-col items-center rounded-md border border-white/10 bg-white/5 px-3 py-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Lives</span>
          <span className="text-base leading-tight tracking-tight">
            {hearts > 0 ? (
              <span className="text-pink-400 drop-shadow-[0_0_6px_rgba(244,114,182,0.6)]">{"♥".repeat(hearts)}</span>
            ) : (
              <span className="text-slate-600">{"♡"}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
