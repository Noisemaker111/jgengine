import type { VitalTone } from "@/components/ui/vital-bar";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

const TONES: Record<VitalTone, { fill: string; deep: string }> = {
  health: { fill: "var(--jg-health)", deep: "var(--jg-health-deep)" },
  mana: { fill: "var(--jg-mana)", deep: "var(--jg-mana-deep)" },
  stamina: { fill: "var(--jg-stamina)", deep: "var(--jg-stamina-deep)" },
  xp: { fill: "var(--jg-xp)", deep: "var(--jg-xp-deep)" },
  shield: { fill: "var(--jg-shield)", deep: "var(--jg-shield-deep)" },
};

export function ResourceOrb({
  fraction,
  tone = "health",
  size = 84,
  label,
  className,
}: {
  fraction: number;
  tone?: VitalTone;
  size?: number;
  label?: string;
  className?: string;
}) {
  const colors = TONES[tone];
  const clamped = clampFraction(fraction);
  return (
    <div
      className={`flex flex-col items-center gap-1 ${className ?? ""}`}
      data-jg="resource-orb"
      data-tone={tone}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="relative overflow-hidden rounded-full"
        style={{
          width: size,
          height: size,
          background: "radial-gradient(circle at 32% 28%, var(--jg-surface) 0%, var(--jg-surface-deep) 70%)",
          border: "2px solid var(--jg-edge-bright)",
          boxShadow: `inset 0 0 ${size / 5}px rgba(0,0,0,0.85), 0 4px 12px rgba(0,0,0,0.6)`,
        }}
      >
        <div
          className="absolute bottom-0 transition-[height] duration-200 ease-out"
          style={{
            left: "-25%",
            right: "-25%",
            height: `${clamped * 100}%`,
            background: `radial-gradient(circle at 50% 0%, ${colors.fill} 0%, ${colors.deep} 80%)`,
            borderRadius: "45% 45% 0 0 / 18% 18% 0 0",
            boxShadow: `0 -2px 10px color-mix(in srgb, ${colors.fill} 40%, transparent)`,
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            top: "9%",
            left: "18%",
            width: "34%",
            height: "20%",
            background: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)",
            transform: "rotate(-18deg)",
          }}
        />
        <span
          className="absolute inset-0 flex items-center justify-center font-mono font-bold"
          style={{
            fontSize: size / 4.6,
            color: "var(--jg-text)",
            textShadow: HUD_TEXT_SHADOW,
          }}
        >
          {Math.round(clamped * 100)}
        </span>
      </div>
      {label !== undefined && (
        <span
          className="text-[9px] font-bold uppercase tracking-[0.24em]"
          style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW, fontFamily: "var(--jg-font-display)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
