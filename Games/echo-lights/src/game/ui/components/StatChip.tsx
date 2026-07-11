import type { ReactNode } from "react";

export function StatChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#d9a441]/30 bg-[#100a06]/80 px-3 py-1">
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8a6f4d]">{label}</span>
      <span className="text-sm font-black tabular-nums text-[#f3dfae]">{children}</span>
    </div>
  );
}
