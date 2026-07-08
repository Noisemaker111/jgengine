export function StreakCallout({
  text,
  tier = 1,
  visible = true,
  className,
}: {
  text: string;
  tier?: number;
  visible?: boolean;
  className?: string;
}) {
  if (!visible) return null;
  const color =
    tier >= 3 ? "var(--jg-danger)" : tier === 2 ? "var(--jg-warning)" : "var(--jg-text)";
  return (
    <span
      key={text}
      className={className}
      data-jg="streak-callout"
      data-tier={tier}
      style={{
        display: "inline-block",
        fontFamily: "var(--jg-font-display)",
        fontStyle: "italic",
        fontWeight: 800,
        fontSize: 22 + tier * 3,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        transform: "skewX(-8deg)",
        color,
        textShadow: `0 2px 6px rgba(0,0,0,0.95), 0 0 18px ${color}`,
        animation:
          tier >= 3
            ? "jg-pop 0.22s ease-out, jg-pulse 0.6s ease-in-out infinite 0.22s"
            : "jg-pop 0.22s ease-out",
      }}
    >
      {text}
    </span>
  );
}
