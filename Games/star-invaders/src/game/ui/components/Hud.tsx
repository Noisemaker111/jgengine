import { MAX_LIVES } from "../../invaders/constants";
import { CANNON } from "../../invaders/sprites";
import type { StarInvadersSnapshot } from "../../invaders/store";
import { COLORS } from "../palette";
import { PixelIcon } from "./PixelIcon";

function pad(value: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(4, "0");
}

function ScoreColumn({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-400">{label}</span>
      <span className="font-mono text-lg font-bold leading-tight tabular-nums" style={{ color, textShadow: `0 0 8px ${color}80` }}>
        {pad(value)}
      </span>
    </div>
  );
}

export function Hud({ snapshot, compact }: { snapshot: StarInvadersSnapshot; compact: boolean }) {
  const lives = Math.min(snapshot.lives, MAX_LIVES);
  return (
    <div className="flex w-full items-start justify-between gap-3 px-1">
      <div className="flex items-start gap-5">
        <ScoreColumn label="Score" value={snapshot.score} color={COLORS.cannon} />
        <ScoreColumn label="Hi-Score" value={snapshot.best} color={COLORS.squid} />
        {!compact && (
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-400">Wave</span>
            <span className="font-mono text-lg font-bold leading-tight tabular-nums text-fuchsia-300" style={{ textShadow: "0 0 8px rgba(232,121,249,0.5)" }}>
              {snapshot.wave.toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1">
        {compact && (
          <span className="font-mono text-xs font-bold text-fuchsia-300">W{snapshot.wave}</span>
        )}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold tabular-nums text-emerald-300">{snapshot.lives}</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.max(0, lives) }, (_, i) => (
              <PixelIcon key={i} sprite={CANNON} color={COLORS.cannon} px={2} />
            ))}
          </div>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-500">Lives</span>
      </div>
    </div>
  );
}
