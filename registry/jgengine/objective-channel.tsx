const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) => `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

export function ObjectiveChannel({
  progress,
  label,
  contested = false,
  owner = "none",
  width = 200,
  className,
}: {
  progress: number;
  label?: string;
  contested?: boolean;
  owner?: "friendly" | "hostile" | "none";
  width?: number | string;
  className?: string;
}) {
  const clamped = clampFraction(progress);
  const fillVar = owner === "friendly" ? "--jg-friendly" : owner === "hostile" ? "--jg-hostile" : "--jg-accent";
  return (
    <div className={className} data-jg="objective-channel" data-owner={owner} style={{ width }}>
      <div className="mb-0.5 flex items-baseline justify-between">
        {label !== undefined ? (
          <span
            className="text-[10px] font-bold uppercase tracking-[0.24em]"
            style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
          >
            {label}
          </span>
        ) : (
          <span />
        )}
        <span
          className="font-mono text-xs font-bold"
          style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
        >
          {Math.round(clamped * 100)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="relative overflow-hidden"
        style={{
          height: 9,
          clipPath: slantBar(6),
          background: "linear-gradient(180deg, var(--jg-surface-deep) 0%, var(--jg-surface) 100%)",
          boxShadow: "inset 0 2px 3px rgba(0,0,0,0.8)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            width: `${clamped * 100}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, var(${fillVar}) 67%, transparent) 0%, var(${fillVar}) 100%)`,
            boxShadow: `0 0 8px color-mix(in srgb, var(${fillVar}) 60%, transparent)`,
            transition: "width 0.16s ease-out",
            animation: contested ? "jg-pulse 1s infinite" : "none",
          }}
        />
      </div>
    </div>
  );
}
