import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/cn";

const progressVariants = cva("game-progress", {
  variants: {
    variant: {
      resource: "game-progress--resource",
      lcd: "game-progress--lcd",
      timeline: "game-progress--timeline",
      terminal: "game-progress--terminal",
      "invoice-due": "game-progress--invoice-due",
    },
  },
  defaultVariants: {
    variant: "resource",
  },
});

export type ProgressVariant = NonNullable<VariantProps<typeof progressVariants>["variant"]>;

interface ProgressProps extends VariantProps<typeof progressVariants> {
  value: number;
  max?: number;
  className?: string;
  label?: string;
}

export function Progress({ variant = "resource", value, max = 100, className, label }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  if (variant === "timeline") {
    return (
      <div className={cn(progressVariants({ variant: "timeline" }), className)}>
        {label ? <span className="game-progress__timeline-label">{label}</span> : null}
        <div className="game-progress__track">
          <div className="game-progress__fill" style={{ width: `${pct}%` }} />
          <div className="game-progress__tick-marks" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(progressVariants({ variant }), className)}>
      <div className="game-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

interface ProgressRowProps {
  label: string;
  valueLabel: string;
  fill: number;
  variant?: ProgressVariant;
  tone?: "teal" | "amber" | "coral" | "cream";
  compact?: boolean;
}

const toneClass = {
  teal: "game-progress-row--teal",
  amber: "game-progress-row--amber",
  coral: "game-progress-row--coral",
  cream: "game-progress-row--cream",
} as const;

export function ProgressRow({
  label,
  valueLabel,
  fill,
  variant = "lcd",
  tone = "teal",
  compact = false,
}: ProgressRowProps) {
  return (
    <div className={cn("game-progress-row", toneClass[tone], compact && "game-progress-row--compact")}>
      <span className="game-progress-row__label">{label}</span>
      <Progress variant={variant} value={fill} className="game-progress-row__bar" />
      <span className="game-progress-row__value">{valueLabel}</span>
    </div>
  );
}
