const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

export function ChargeMeter({
  fraction,
  ready = false,
  tiers = [],
  label,
  width = 180,
  className,
}: {
  fraction: number;
  ready?: boolean;
  tiers?: readonly number[];
  label?: string;
  width?: number | string;
  className?: string;
}) {
  const clamped = clampFraction(fraction);
  return (
    <div className={className} data-jg="charge-meter" data-ready={ready} style={{ width }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="relative overflow-hidden"
        style={{
          height: 12,
          clipPath: slantBar(8),
          background: "linear-gradient(180deg, var(--jg-surface-deep) 0%, var(--jg-surface) 100%)",
          boxShadow: "inset 0 2px 3px rgba(0,0,0,0.8)",
          animation: ready ? "jg-ready-glow 1.1s ease-in-out infinite" : "none",
        }}
      >
        <div
          className="absolute inset-0 transition-[width] duration-[180ms] ease-out"
          style={{
            width: `${clamped * 100}%`,
            background: "linear-gradient(90deg, var(--jg-accent-deep) 0%, var(--jg-accent) 100%)",
            boxShadow: "0 0 10px var(--jg-accent-glow)",
          }}
        />
        {tiers.map((tier) => (
          <span
            key={tier}
            className="absolute top-0 bottom-0"
            style={{
              left: `${clampFraction(tier) * 100}%`,
              width: 2,
              background: "rgba(255,255,255,0.55)",
            }}
          />
        ))}
      </div>
      {label !== undefined && (
        <div
          className="mt-[3px] text-[9px] font-bold uppercase tracking-[0.24em]"
          style={{
            color: ready ? "var(--jg-accent)" : "var(--jg-text-dim)",
            textShadow: HUD_TEXT_SHADOW,
            fontFamily: "var(--jg-font-display)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
