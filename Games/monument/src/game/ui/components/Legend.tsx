import type { ReactNode } from "react";

import { PROGRAMS, type Lens, type Program } from "../../catalog";
import { HAIRLINE, PANEL } from "../theme";
import { LENSES } from "./ViewDock";

const STRUCTURE_KEY: readonly { label: string; color: string }[] = [
  { label: "Frame", color: "#91a7b8" },
  { label: "Walls", color: "#d4ad67" },
  { label: "Cores", color: "#a98ebd" },
];

const GRADIENTS: Partial<Record<Lens, { css: string; low: string; high: string }>> = {
  daylight: { css: "linear-gradient(90deg,#516578,#ffe5a0)", low: "less sun", high: "more sun" },
  activity: { css: "linear-gradient(90deg,#313a49,#ffb238)", low: "quiet", high: "intense" },
  carbon: { css: "linear-gradient(90deg,#b9df65,#f05444)", low: "low impact", high: "high impact" },
};

function KeyDot({ color, label }: { color: string; label: string }): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 border border-[rgba(20,22,18,0.35)]" style={{ background: color }} />
      <span className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#171916]">{label}</span>
    </span>
  );
}

export function Legend({ lens }: { lens: Lens }): ReactNode {
  if (lens === "material") return null;
  const title = LENSES.find((entry) => entry.id === lens)?.label ?? "";
  const gradient = GRADIENTS[lens];
  return (
    <div className={`min-w-[210px] ${PANEL}`}>
      <span className="block px-3 pb-1.5 pt-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#171916]">
        {title}
      </span>
      <div className={`border-t px-3 py-2.5 ${HAIRLINE}`}>
        {lens === "program" && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {(Object.keys(PROGRAMS) as Program[]).map((program) => (
              <KeyDot key={program} color={PROGRAMS[program].color} label={PROGRAMS[program].short} />
            ))}
          </div>
        )}
        {lens === "structure" && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {STRUCTURE_KEY.map((entry) => (
              <KeyDot key={entry.label} color={entry.color} label={entry.label} />
            ))}
          </div>
        )}
        {gradient !== undefined && (
          <div className="flex flex-col gap-1.5">
            <span className="h-2 w-full" style={{ background: gradient.css }} />
            <div className="flex items-center justify-between text-[7.5px] uppercase tracking-[0.04em] text-[#71746c]">
              <span>{gradient.low}</span>
              <span>{gradient.high}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
