import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/cn";

const badgeVariants = cva("game-badge", {
  variants: {
    variant: {
      teal: "game-badge--teal",
      amber: "game-badge--amber",
      coral: "game-badge--coral",
      muted: "game-badge--muted",
      stamp: "game-badge--stamp",
      alert: "game-badge--alert",
    },
  },
  defaultVariants: {
    variant: "muted",
  },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "muted", children, className }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
