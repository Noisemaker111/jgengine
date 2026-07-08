const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const padScore = (value: number, digits = 6) =>
  String(Math.max(0, Math.floor(value))).padStart(digits, "0");

export function ScoreReadout({
  value,
  digits = 6,
  label = "Score",
  size = "md",
  className,
}: {
  value: number;
  digits?: number;
  label?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const padded = padScore(value, digits);
  const firstSignificant = padded.search(/[1-9]/);
  const splitAt = firstSignificant === -1 ? padded.length : firstSignificant;
  const leading = padded.slice(0, splitAt);
  const significant = padded.slice(splitAt);
  const fontSize = size === "lg" ? 32 : 22;
  return (
    <div className={`flex flex-col items-start gap-0.5 ${className ?? ""}`} data-jg="score-readout">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.24em]"
        style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
      >
        {label}
      </span>
      <span
        key={value}
        className="font-mono font-extrabold tracking-[0.02em]"
        style={{
          fontSize,
          textShadow: `${HUD_TEXT_SHADOW}, 0 0 10px var(--jg-accent-glow)`,
          animation: "jg-pop 0.18s ease-out",
        }}
      >
        {leading.length > 0 && <span style={{ color: "var(--jg-text-dim)" }}>{leading}</span>}
        <span style={{ color: "var(--jg-text)" }}>{significant}</span>
      </span>
    </div>
  );
}
