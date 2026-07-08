import type { CSSProperties } from "react";

export interface CombatFloatEntry {
  id: string;
  text: string;
  kind?: "damage" | "crit" | "heal" | "info" | "error";
  x?: number;
  y?: number;
}

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function jitterFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash % 21) + 21) % 21;
}

function combatFloatStyle(kind: NonNullable<CombatFloatEntry["kind"]>): CSSProperties {
  switch (kind) {
    case "crit":
      return {
        fontFamily: "var(--jg-font-numeric)",
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: "0.04em",
        color: "var(--jg-warning)",
      };
    case "heal":
      return {
        fontFamily: "var(--jg-font-numeric)",
        fontSize: 18,
        fontWeight: 800,
        color: "var(--jg-success)",
      };
    case "error":
      return {
        fontFamily: "var(--jg-font-body)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--jg-danger)",
      };
    case "info":
      return {
        fontFamily: "var(--jg-font-body)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--jg-text-dim)",
      };
    case "damage":
    default:
      return {
        fontFamily: "var(--jg-font-numeric)",
        fontSize: 18,
        fontWeight: 800,
        color: "var(--jg-text)",
      };
  }
}

export function CombatFloat({
  entry,
  durationMs = 1100,
  className,
}: {
  entry: CombatFloatEntry;
  durationMs?: number;
  className?: string;
}) {
  const kind = entry.kind ?? "damage";
  const x = entry.x ?? 50 + jitterFromId(entry.id) - 10;
  const y = entry.y ?? 50;
  const animation =
    kind === "crit"
      ? `jg-float-up ${durationMs}ms ease-out forwards, jg-pop 220ms ease-out forwards`
      : `jg-float-up ${durationMs}ms ease-out forwards`;
  return (
    <span
      className={className}
      data-jg="combat-float"
      data-kind={kind}
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        whiteSpace: "nowrap",
        textShadow: HUD_TEXT_SHADOW,
        animation,
        animationFillMode: "forwards",
        ...combatFloatStyle(kind),
      }}
    >
      {entry.text}
    </span>
  );
}

export function CombatFloatLayer({
  entries,
  durationMs = 1100,
  className,
}: {
  entries: readonly CombatFloatEntry[];
  durationMs?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      data-jg="combat-float-layer"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      {entries.map((entry) => (
        <CombatFloat key={entry.id} entry={entry} durationMs={durationMs} />
      ))}
    </div>
  );
}
