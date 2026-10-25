import type { ReactNode } from "react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

type TokenTone = "teal" | "amber" | "coral" | "muted";

const toneToBadge: Record<TokenTone, BadgeVariant> = {
  teal: "teal",
  amber: "amber",
  coral: "coral",
  muted: "muted",
};

interface TokenProps {
  children: ReactNode;
  tone?: TokenTone;
  className?: string;
}

export function Token({ children, tone = "muted", className }: TokenProps) {
  return <Badge variant={toneToBadge[tone]} className={cn(className)}>{children}</Badge>;
}
