import { currentLead } from "../../course/run";
import { useRunState } from "../hooks";

const MAX_DISPLAY_LEAD = 420;

function leadColor(lead: number): string {
  if (lead < 40) return "#f25c05";
  if (lead < 100) return "#f2a705";
  return "#d9a441";
}

export function StormLeadBar() {
  const run = useRunState();
  const lead = run.status === "ready" ? MAX_DISPLAY_LEAD : currentLead(run.progress, run.bankedBonus, run.now);
  const clamped = Math.max(0, Math.min(MAX_DISPLAY_LEAD, lead));
  const pct = (clamped / MAX_DISPLAY_LEAD) * 100;
  const color = leadColor(lead);
  const critical = lead < 40 && run.status === "playing";

  return (
    <div className="flex w-full max-w-md flex-col gap-1 rounded-lg border border-[#3d4a5c] bg-[#1e2633]/85 px-4 py-2 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-[#9fb8c8]">
        <span>The Line</span>
        <span className={critical ? "animate-pulse font-bold" : "font-semibold"} style={{ color }}>
          {Math.round(lead)}m lead
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-[#0f151d]">
        <div
          className={critical ? "h-full animate-pulse rounded-full transition-[width]" : "h-full rounded-full transition-[width]"}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
