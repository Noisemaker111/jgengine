const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

export function CastBar({
  fraction,
  label,
  width = 240,
  interrupted = false,
  className,
}: {
  fraction: number;
  label?: string;
  width?: number | string;
  interrupted?: boolean;
  className?: string;
}) {
  const clamped = clampFraction(fraction);
  const fillColor = interrupted ? "var(--jg-danger)" : "var(--jg-accent)";
  return (
    <div className={className} data-jg="cast-bar" style={{ width }}>
      <div
        className="relative overflow-hidden"
        style={{
          height: 10,
          clipPath: slantBar(5),
          background: "linear-gradient(180deg, var(--jg-surface-deep) 0%, var(--jg-surface) 100%)",
          boxShadow: "inset 0 2px 3px rgba(0,0,0,0.8)",
        }}
      >
        <div
          className="absolute inset-0 transition-[width] duration-[50ms] ease-linear"
          style={{
            width: `${clamped * 100}%`,
            background: `linear-gradient(180deg, ${fillColor} 0%, ${interrupted ? "var(--jg-danger)" : "var(--jg-accent-deep)"} 100%)`,
          }}
        />
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `calc(${clamped * 100}% - 3px)`,
            width: 6,
            background: "rgba(255,255,255,0.85)",
            filter: "blur(2px)",
            opacity: clamped > 0 && clamped < 1 ? 1 : 0,
          }}
        />
      </div>
      {label !== undefined && (
        <div
          className="mt-[3px] text-center text-[11px] font-semibold tracking-[0.06em]"
          style={{
            color: interrupted ? "var(--jg-danger)" : "var(--jg-text)",
            textShadow: HUD_TEXT_SHADOW,
          }}
        >
          {interrupted ? "Interrupted" : label}
        </div>
      )}
    </div>
  );
}
