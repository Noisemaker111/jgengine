import type { ReactNode } from "react";

import type { Tool } from "../../catalog";

const CAST_HINT = "Click an open lot to cast a new structure";

const HINTS: Record<Tool, string> = {
  select: "Click a building to inspect it",
  housing: CAST_HINT,
  work: CAST_HINT,
  civic: CAST_HINT,
  culture: CAST_HINT,
  mixed: CAST_HINT,
  plaza: "Click an open lot to open public ground",
  demolish: "Click a structure to strike it from the plan",
};

export function ToolHint({ tool }: { tool: Tool }): ReactNode {
  return (
    <div className="flex items-center gap-2 bg-[rgba(20,22,18,0.82)] px-3 py-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#d7ff43]">Tool</span>
      <span className="text-[10px] tracking-[0.01em] text-[#eeeae0]">{HINTS[tool]}</span>
    </div>
  );
}
