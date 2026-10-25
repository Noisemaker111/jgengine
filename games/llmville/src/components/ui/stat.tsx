import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/cn";

const statVariants = cva("game-stat-display", {
  variants: {
    variant: {
      led: "game-stat-display--led",
      lcd: "game-stat-display--lcd",
      scoreboard: "game-stat-display--scoreboard",
      inline: "game-stat-display--inline",
    },
    tone: {
      cream: "game-stat-display--tone-cream",
      amber: "game-stat-display--tone-amber",
      teal: "game-stat-display--tone-teal",
      coral: "game-stat-display--tone-coral",
    },
  },
  defaultVariants: {
    variant: "led",
    tone: "cream",
  },
});

export type StatVariant = NonNullable<VariantProps<typeof statVariants>["variant"]>;

interface StatProps extends VariantProps<typeof statVariants> {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function Stat({ variant = "led", label, value, icon, className, tone = "cream" }: StatProps) {
  return (
    <div className={cn(statVariants({ variant, tone }), className)}>
      {icon ? <span className="game-stat-display__icon">{icon}</span> : null}
      <div className="game-stat-display__content">
        <span className="game-stat-display__label">{label}</span>
        <span className="game-stat-display__value">{value}</span>
      </div>
    </div>
  );
}

interface StatGridProps {
  children: ReactNode;
  className?: string;
}

export function StatGrid({ children, className }: StatGridProps) {
  return <div className={cn("game-stat-grid", className)}>{children}</div>;
}
