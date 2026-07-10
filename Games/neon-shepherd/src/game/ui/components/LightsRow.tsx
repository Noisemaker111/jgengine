import { CREATURES } from "../../entities/creatures/catalog";
import type { RunState } from "../../session/store";

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LightsRow({ run, elapsed }: { run: RunState; elapsed: number }): React.ReactNode {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-[#101318]/70 px-4 py-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-center gap-[3px]">
        {CREATURES.map((creature) => {
          const alive = run.creatures[creature.id]?.alive ?? true;
          return (
            <span
              key={creature.id}
              className="inline-block h-3 w-3 rounded-full transition-opacity duration-500"
              style={{
                backgroundColor: alive ? creature.tint : "#3a3f47",
                boxShadow: alive ? `0 0 6px ${creature.tint}` : "none",
                opacity: alive ? 1 : 0.35,
              }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[11px] font-medium tracking-wide text-[#eef4f0]/80">
        <span>{Object.values(run.creatures).filter((c) => c.alive).length} lights follow you</span>
        <span aria-hidden className="text-[#eef4f0]/30">
          |
        </span>
        <span>{formatClock(elapsed)}</span>
      </div>
    </div>
  );
}
