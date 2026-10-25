import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/cn";

const panelVariants = cva("game-panel-surface", {
  variants: {
    variant: {
      default: "game-panel-surface--default",
      inset: "game-panel-surface--inset",
      "server-lcd": "game-panel-surface--server-lcd",
      terminal: "game-panel-surface--terminal",
      blueprint: "game-panel-surface--blueprint",
      tablet: "game-panel-surface--tablet",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type PanelVariant = NonNullable<VariantProps<typeof panelVariants>["variant"]>;

export const PANEL_VARIANT = {
  default: "default",
  inset: "inset",
  terminal: "terminal",
  blueprint: "blueprint",
  tablet: "tablet",
} as const satisfies Record<string, PanelVariant>;

interface PanelProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof panelVariants> {
  children: ReactNode;
  label?: string;
  as?: "section" | "div" | "article" | "nav" | "header";
}

export function Panel({
  variant = "default",
  children,
  label,
  className,
  as: Tag = "section",
  ...props
}: PanelProps) {
  return (
    <Tag className={cn(panelVariants({ variant }), className)} {...props}>
      {label ? <p className="game-panel-surface__label">{label}</p> : null}
      {children}
    </Tag>
  );
}
