import { useId, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";

interface TooltipProps {
  children: ReactNode;
  placement?: "right" | "top" | "bottom" | "left";
  className?: string;
  id?: string;
}

const placementClasses: Record<NonNullable<TooltipProps["placement"]>, string> = {
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
};

export function Tooltip({ children, placement = "top", className, id }: TooltipProps) {
  return (
    <span
      role="tooltip"
      id={id}
      className={cn(
        "pointer-events-none absolute z-40 max-w-[220px] rounded-md border border-[var(--surface-border)] bg-[var(--surface-strong)] px-2.5 py-1.5 text-[11px] text-[var(--brand-cream)] opacity-0 shadow-2xl backdrop-blur transition-opacity delay-150",
        "group-hover/builder-tip:opacity-100 group-focus-visible/builder-tip:opacity-100",
        placementClasses[placement],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function useTooltip() {
  const id = useId();
  return {
    triggerProps: {
      "aria-describedby": id,
      className: "group/builder-tip relative",
    },
    tooltipProps: { id },
  };
}
