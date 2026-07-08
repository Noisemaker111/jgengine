const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

export function ComboCounter({
  count,
  label = "COMBO",
  decayFraction,
  className,
}: {
  count: number;
  label?: string;
  decayFraction?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      data-jg="combo-counter"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
    >
      <span
        key={count}
        style={{
          fontFamily: "var(--jg-font-numeric)",
          fontSize: 40,
          fontWeight: 800,
          color: "var(--jg-accent)",
          textShadow: `${HUD_TEXT_SHADOW}, 0 0 16px var(--jg-accent-glow)`,
          animation: "jg-pop 0.22s ease-out",
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontFamily: "var(--jg-font-display)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--jg-text-dim)",
          textShadow: HUD_TEXT_SHADOW,
        }}
      >
        {label}
      </span>
      {decayFraction !== undefined && (
        <div
          style={{
            width: 90,
            height: 3,
            clipPath: slantBar(3),
            background: "var(--jg-surface-deep)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${clampFraction(decayFraction) * 100}%`,
              height: "100%",
              background: "var(--jg-accent)",
              boxShadow: "0 0 6px var(--jg-accent-glow)",
              transition: "width 0.1s linear",
            }}
          />
        </div>
      )}
    </div>
  );
}
