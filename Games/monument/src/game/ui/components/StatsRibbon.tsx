import type { ReactNode } from "react";

import type { CityMetrics } from "../../catalog";
import { formatStat } from "../../city/metrics";
import { HAIRLINE, PANEL } from "../theme";

const ACID = "#d7ff43";
const AMBER = "#f0c65e";
const MUTED = "#8a8d84";

function MiniStat({ value, label, tone }: { value: string; label: string; tone: string }): ReactNode {
  return (
    <div title={label} className={`flex items-center gap-2 border-r px-3 py-1.5 ${HAIRLINE}`}>
      <span className="h-2 w-2 shrink-0" style={{ background: tone }} />
      <div className="flex flex-col">
        <b className="text-[14px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[#171916]">
          {value}
        </b>
        <span className="mt-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#73766f]">{label}</span>
      </div>
    </div>
  );
}

export function StatsRibbon({
  metrics,
  systemsActive,
  onToggleSystems,
}: {
  metrics: CityMetrics;
  systemsActive: boolean;
  onToggleSystems: () => void;
}): ReactNode {
  return (
    <div className={`flex items-stretch ${PANEL}`}>
      <MiniStat value={formatStat(metrics.population)} label="Residents" tone={MUTED} />
      <MiniStat value={formatStat(metrics.jobs)} label="Jobs" tone={MUTED} />
      <MiniStat value={`${metrics.approval}%`} label="Approval" tone={metrics.approval > 70 ? ACID : AMBER} />
      <MiniStat value={`${metrics.activity}`} label="Public life" tone={ACID} />
      <button
        type="button"
        onClick={onToggleSystems}
        title="City life"
        aria-label="City life"
        className={`flex items-center gap-2 px-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${
          systemsActive ? "bg-[#171916] text-[#eeeae0]" : "text-[#171916] hover:bg-[rgba(20,22,18,0.08)]"
        }`}
      >
        <span className="text-[13px] leading-none">▤</span>
        City life
      </button>
    </div>
  );
}
