const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function AccentRule({ width = 120 }: { width?: number | string }) {
  return (
    <span
      className="block h-0.5"
      style={{
        width,
        background:
          "linear-gradient(90deg, transparent 0%, var(--jg-accent) 18%, var(--jg-accent) 82%, transparent 100%)",
        boxShadow: "0 0 8px var(--jg-accent-glow)",
      }}
    />
  );
}

export function WaveIndicator({
  wave,
  totalWaves,
  remaining,
  remainingLabel = "hostiles",
  className,
}: {
  wave: number;
  totalWaves?: number;
  remaining?: number;
  remainingLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className ?? ""}`} data-jg="wave-indicator">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.24em]"
        style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
      >
        Wave
      </span>
      <AccentRule width={80} />
      <span
        className="font-mono text-[30px] font-extrabold"
        style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
      >
        {wave}
        {totalWaves !== undefined && (
          <span className="text-sm" style={{ color: "var(--jg-text-dim)" }}>
            {" "}
            / {totalWaves}
          </span>
        )}
      </span>
      {remaining !== undefined && (
        <span className="flex items-baseline gap-1">
          <span
            className="font-mono text-[13px] font-bold"
            style={{ color: "var(--jg-danger)", textShadow: HUD_TEXT_SHADOW }}
          >
            {remaining}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-text-dim)" }}
          >
            {remainingLabel}
          </span>
        </span>
      )}
    </div>
  );
}
