import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/cn";

const buttonVariants = cva("game-btn", {
  variants: {
    variant: {
      default: "game-btn--default",
      primary: "game-btn--primary",
      secondary: "game-btn--secondary",
      "invoice-pay": "game-btn--invoice-pay",
      "invoice-pay-unaffordable": "game-btn--invoice-pay-unaffordable",
      terminal: "game-btn--terminal",
      blueprint: "game-btn--blueprint",
      led: "game-btn--led",
      compact: "game-btn--compact",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export const BUTTON_VARIANT = {
  default: "default",
  primary: "primary",
  secondary: "secondary",
  terminal: "terminal",
  blueprint: "blueprint",
} as const satisfies Record<string, ButtonVariant>;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  children: ReactNode;
}

export function Button({ variant = "default", children, className, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant }), className)} {...props}>
      {children}
    </button>
  );
}

export { buttonVariants };
