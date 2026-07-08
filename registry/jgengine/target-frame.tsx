import type { ReactNode } from "react";

import { UnitFrame, type UnitVital } from "@/components/ui/unit-frame";

export type TargetRelationTone = "hostile" | "friendly" | "neutral";

const RELATION_COLORS: Record<TargetRelationTone, string> = {
  hostile: "var(--jg-hostile)",
  friendly: "var(--jg-friendly)",
  neutral: "var(--jg-neutral)",
};

export function TargetFrame({
  name,
  level,
  vitals,
  relation = "hostile",
  portrait,
  width,
  className,
  children,
}: {
  name: string;
  level?: number;
  vitals: readonly UnitVital[];
  relation?: TargetRelationTone;
  portrait?: ReactNode;
  width?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <UnitFrame
      name={name}
      level={level}
      vitals={vitals}
      portrait={portrait}
      reverse
      nameColor={RELATION_COLORS[relation]}
      width={width}
      className={className}
    >
      {children}
    </UnitFrame>
  );
}
