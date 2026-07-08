const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

export function BreakMeter({
  fraction,
  broken = false,
  width = 150,
  className,
}: {
  fraction: number;
  broken?: boolean;
  width?: number | string;
  className?: string;
}) {
  const clamped = clampFraction(fraction);
  const rampColor = broken
    ? "var(--jg-danger)"
    : clamped > 0.66
      ? "var(--jg-danger)"
      : clamped > 0.33
        ? "var(--jg-warning)"
        : "var(--jg-text-dim)";
  return (
    <div
      className={className}
      data-jg="break-meter"
      data-broken={broken}
      style={{
        width,
        animation: broken ? "jg-shake 0.35s ease-in-out" : "none",
      }}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="relative overflow-hidden"
        style={{
          height: 7,
          clipPath: "polygon(0 50%, 4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%)",
          background: "var(--jg-surface-deep)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.85)",
        }}
      >
        <div
          className="absolute inset-0 transition-[width] duration-[120ms] ease-out"
          style={{
            width: `${(broken ? 1 : clamped) * 100}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${rampColor} 73%, transparent) 0%, ${rampColor} 100%)`,
            boxShadow: broken ? "0 0 8px var(--jg-danger)" : "none",
            animation: broken ? "jg-pulse 0.5s ease-in-out infinite" : "none",
          }}
        />
      </div>
    </div>
  );
}
