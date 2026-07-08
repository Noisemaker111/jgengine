const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const formatTimer = (totalSeconds: number) => {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, "0")}`;
};

function TimerTick({ color }: { color: string }) {
  return <span aria-hidden className="h-1 w-1 shrink-0 rotate-45" style={{ background: color }} />;
}

export function MatchTimer({
  seconds,
  warningAt = 30,
  criticalAt = 10,
  label,
  size = "md",
  className,
}: {
  seconds: number;
  warningAt?: number;
  criticalAt?: number;
  label?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const isCritical = seconds <= criticalAt;
  const isWarning = seconds <= warningAt;
  const color = isCritical ? "var(--jg-danger)" : isWarning ? "var(--jg-warning)" : "var(--jg-text)";
  const fontSize = size === "lg" ? 36 : 24;
  return (
    <div className={`flex flex-col items-center gap-0.5 ${className ?? ""}`} data-jg="match-timer">
      {label !== undefined && (
        <span
          className="text-[10px] font-bold uppercase tracking-[0.24em]"
          style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
        >
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <TimerTick color={color} />
        <span
          className="font-mono font-extrabold"
          style={{
            fontSize,
            color,
            textShadow: HUD_TEXT_SHADOW,
            animation: isCritical ? "jg-pulse 1s infinite" : "none",
          }}
        >
          {formatTimer(seconds)}
        </span>
        <TimerTick color={color} />
      </div>
    </div>
  );
}

export function CountdownPips({ value, className }: { value: number; className?: string }) {
  if (value <= 0) return null;
  return (
    <div className={`flex items-center justify-center ${className ?? ""}`} data-jg="countdown-pips">
      <span
        key={value}
        className="text-[72px] font-extrabold tracking-[0.1em]"
        style={{
          fontFamily: "var(--jg-font-display)",
          color: "var(--jg-accent)",
          textShadow: "0 2px 4px rgba(0,0,0,0.9), 0 0 30px var(--jg-accent-glow)",
          animation: "jg-pop 0.3s ease-out",
        }}
      >
        {Math.ceil(value)}
      </span>
    </div>
  );
}
