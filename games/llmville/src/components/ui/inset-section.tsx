import type { ReactNode } from "react";

import { Panel } from "@/components/ui/panel";
import { cn } from "@/components/ui/cn";

interface InsetSectionProps {
  children: ReactNode;
  className?: string;
  label?: string;
  trailing?: ReactNode;
}

export function InsetSection({ children, className, label, trailing }: InsetSectionProps) {
  return (
    <Panel variant="inset" label={label} as="section" className={cn("flex flex-col gap-3", className)}>
      {trailing ? <div className="flex justify-end -mt-6 mb-1">{trailing}</div> : null}
      {children}
    </Panel>
  );
}
