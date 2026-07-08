const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

export function XpBar({
  fraction,
  level,
  width = "100%",
  ticks = 10,
  className,
}: {
  fraction: number;
  level?: number;
  width?: number | string;
  ticks?: number;
  className?: string;
}) {
  const clamped = clampFraction(fraction);
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`} data-jg="xp-bar" style={{ width }}>
      {level !== undefined && (
        <span
          className="flex-shrink-0 font-mono text-[11px] font-bold"
          style={{ color: "var(--jg-xp)", textShadow: HUD_TEXT_SHADOW }}
        >
          Lv {level}
        </span>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="relative flex-1 overflow-hidden"
        style={{
          height: 5,
          background: "var(--jg-surface-deep)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)",
        }}
      >
        <div
          className="absolute inset-0 transition-[width] duration-300 ease-out"
          style={{
            width: `${clamped * 100}%`,
            background: "linear-gradient(90deg, var(--jg-xp-deep) 0%, var(--jg-xp) 100%)",
            boxShadow: "0 0 6px color-mix(in srgb, var(--jg-xp) 60%, transparent)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / ticks}% - 1px), rgba(0,0,0,0.7) calc(${100 / ticks}% - 1px), rgba(0,0,0,0.7) ${100 / ticks}%)`,
          }}
        />
      </div>
    </div>
  );
}
