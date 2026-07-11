import type { ReactNode } from "react";

import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";

export function StatChip({ icon, label, children }: { icon: GameIconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#c9a557]/35 bg-[#0d1b36]/80 px-2.5 py-1 sm:gap-2 sm:px-3.5 sm:py-1.5">
      <span className="text-[#c9a557]">
        <GameIcon name={icon} size={13} />
      </span>
      <span className="hidden text-[10px] uppercase tracking-[0.14em] text-[#8fa0c0] sm:inline">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-[#f4ecd9] sm:text-sm">{children}</span>
    </div>
  );
}
