import type { ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return String(Math.floor(value));
  const units: readonly { value: number; suffix: string }[] = [
    { value: 1_000_000_000, suffix: "b" },
    { value: 1_000_000, suffix: "m" },
    { value: 1_000, suffix: "k" },
  ];
  for (const unit of units) {
    if (abs >= unit.value) {
      const scaled = value / unit.value;
      const rounded = Math.round(scaled * 10) / 10;
      return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}${unit.suffix}`;
    }
  }
  return String(Math.floor(value));
}

function CoinGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="var(--jg-accent)" stroke="var(--jg-accent-deep)" strokeWidth={1.5} />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--jg-accent-deep)" strokeWidth={1.2} />
    </svg>
  );
}

export function CurrencyDisplay({
  amount,
  symbol,
  name,
  compact = false,
  className,
}: {
  amount: number;
  symbol?: ReactNode;
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-baseline gap-[5px] ${className ?? ""}`} data-jg="currency-display">
      <span className="inline-flex items-center">{symbol ?? <CoinGlyph />}</span>
      <span
        className="font-mono text-[15px] font-bold"
        style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
      >
        {compact ? compactNumber(amount) : Math.floor(amount)}
      </span>
      {name !== undefined && (
        <span
          className="text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-text-dim)" }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
