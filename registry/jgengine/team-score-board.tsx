const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export interface TeamScore {
  name?: string;
  score: number;
  color?: string;
}

export function TeamScoreBoard({
  left,
  right,
  roundLabel,
  className,
}: {
  left: TeamScore;
  right: TeamScore;
  roundLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${className ?? ""}`} data-jg="team-score-board">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-0.5">
          <span
            className="font-mono text-[26px] font-extrabold"
            style={{ color: left.color ?? "var(--jg-friendly)", textShadow: HUD_TEXT_SHADOW }}
          >
            {left.score}
          </span>
          {left.name !== undefined && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.24em]"
              style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
            >
              {left.name}
            </span>
          )}
        </div>
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rotate-45"
          style={{ background: "var(--jg-accent)", boxShadow: "0 0 8px var(--jg-accent-glow)" }}
        />
        <div className="flex flex-col items-center gap-0.5">
          <span
            className="font-mono text-[26px] font-extrabold"
            style={{ color: right.color ?? "var(--jg-hostile)", textShadow: HUD_TEXT_SHADOW }}
          >
            {right.score}
          </span>
          {right.name !== undefined && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.24em]"
              style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
            >
              {right.name}
            </span>
          )}
        </div>
      </div>
      {roundLabel !== undefined && (
        <span
          className="text-[10px] font-bold uppercase tracking-[0.24em]"
          style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
        >
          {roundLabel}
        </span>
      )}
    </div>
  );
}
