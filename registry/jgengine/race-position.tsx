const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function ordinalSuffix(position: number): string {
  const rounded = Math.floor(position);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (rounded % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function RacePosition({
  position,
  total,
  lap,
  laps,
  className,
}: {
  position: number;
  total?: number;
  lap?: number;
  laps?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-0.5 ${className ?? ""}`} data-jg="race-position">
      <span
        className="font-mono text-[44px] font-extrabold"
        style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
      >
        {position}
        <span
          className="align-super text-base font-extrabold"
          style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-accent)" }}
        >
          {ordinalSuffix(position)}
        </span>
        {total !== undefined && (
          <span className="font-mono text-base" style={{ color: "var(--jg-text-dim)" }}>
            {" "}
            / {total}
          </span>
        )}
      </span>
      {lap !== undefined && (
        <span
          className="text-[10px] font-bold uppercase tracking-[0.24em]"
          style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
        >
          Lap {lap}
          {laps !== undefined ? `/${laps}` : ""}
        </span>
      )}
    </div>
  );
}
