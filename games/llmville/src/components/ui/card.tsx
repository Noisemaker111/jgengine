import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/cn";

const cardVariants = cva("game-card", {
  variants: {
    variant: {
      "quest-ticket": "game-card--quest-ticket",
      invoice: "game-card--invoice",
      terminal: "game-card--terminal",
      blueprint: "game-card--blueprint",
      "sticky-note": "game-card--sticky-note",
      "server-lcd": "game-card--server-lcd",
      "spec-sheet": "game-card--spec-sheet",
      "inventory-tray": "game-card--inventory-tray",
      "model-report": "game-card--model-report",
      redacted: "game-card--redacted",
      polaroid: "game-card--polaroid",
    },
    decoration: {
      pin: "game-card__decoration--pin",
      tape: "game-card__decoration--tape",
      stamp: "game-card__decoration--stamp",
      fold: "game-card__decoration--fold",
    },
  },
});

export type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>;

export const CARD_VARIANT = {
  redacted: "redacted",
  blueprint: "blueprint",
  terminal: "terminal",
} as const satisfies Record<string, CardVariant>;

interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  children: ReactNode;
  header?: ReactNode;
  decoration?: "pin" | "tape" | "stamp" | "fold";
}

export function Card({ variant, children, header, decoration, className, ...props }: CardProps) {
  const hasTopDecoration = decoration === "pin" || decoration === "tape";

  return (
    <div
      className={cn(
        cardVariants({ variant, decoration }),
        hasTopDecoration && "game-card--top-decoration",
        className,
      )}
      {...props}
    >
      {header ? <div className="game-card__header">{header}</div> : null}
      <div className="game-card__body">{children}</div>
      {decoration === "pin" && <div className="game-card__pin" aria-hidden />}
      {decoration === "tape" && <div className="game-card__tape" aria-hidden />}
      {decoration === "fold" && <div className="game-card__corner-fold" aria-hidden />}
    </div>
  );
}
