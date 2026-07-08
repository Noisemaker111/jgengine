import { type VitalValue } from "@/components/ui/vital-bar";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

function vitalFraction(value: VitalValue): number {
  const min = value.min ?? 0;
  const range = value.max - min;
  if (range <= 0) return 0;
  return clampFraction((value.current - min) / range);
}

function Finial({ flip }: { flip?: boolean }) {
  return (
    <span
      aria-hidden
      className="flex-shrink-0"
      style={{
        width: 10,
        height: 10,
        transform: `rotate(45deg) ${flip === true ? "scale(-1)" : ""}`,
        background: "linear-gradient(135deg, var(--jg-accent) 0%, var(--jg-accent-deep) 100%)",
        boxShadow: "0 0 6px var(--jg-accent-glow)",
      }}
    />
  );
}

export function BossBar({
  name,
  value,
  subLabel,
  phases = [],
  width = 460,
  className,
}: {
  name: string;
  value: VitalValue;
  subLabel?: string;
  phases?: readonly number[];
  width?: number | string;
  className?: string;
}) {
  const fraction = vitalFraction(value);
  return (
    <div
      className={`flex flex-col items-center gap-1 ${className ?? ""}`}
      data-jg="boss-bar"
      style={{ width }}
    >
      <span
        className="text-[17px] font-bold uppercase tracking-[0.3em]"
        style={{
          color: "var(--jg-text)",
          textShadow: "0 2px 4px rgba(0,0,0,0.95), 0 0 14px var(--jg-accent-glow)",
          fontFamily: "var(--jg-font-display)",
        }}
      >
        {name}
      </span>
      <div className="flex w-full items-center gap-1.5">
        <Finial />
        <div
          role="progressbar"
          aria-valuemin={value.min ?? 0}
          aria-valuemax={value.max}
          aria-valuenow={value.current}
          className="relative flex-1 overflow-hidden"
          style={{
            height: 13,
            background: "linear-gradient(180deg, var(--jg-surface-deep) 0%, var(--jg-surface) 100%)",
            border: "1px solid var(--jg-edge)",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.85)",
          }}
        >
          <div
            className="absolute inset-0 transition-[width] duration-[250ms] ease-out"
            style={{
              width: `${fraction * 100}%`,
              background: "linear-gradient(180deg, var(--jg-hostile) 0%, #5c1410 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          />
          {phases.map((phase) => (
            <span
              key={phase}
              className="absolute top-0 bottom-0"
              style={{
                left: `${clampFraction(phase) * 100}%`,
                width: 2,
                background: "var(--jg-accent)",
                boxShadow: "0 0 4px var(--jg-accent-glow)",
              }}
            />
          ))}
        </div>
        <Finial flip />
      </div>
      {subLabel !== undefined && (
        <span
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
        >
          {subLabel}
        </span>
      )}
    </div>
  );
}
