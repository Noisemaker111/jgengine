import { actionLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../../keybinds";
import { MAX_SPEED } from "../../course/run";
import { useRunState } from "../hooks";

export function Speedometer() {
  const run = useRunState();
  const kmh = Math.round(run.speed * 3.6);
  const pct = Math.min(100, (run.speed / MAX_SPEED) * 100);

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-[#3d4a5c] bg-[#1e2633]/85 px-4 py-2 shadow-lg">
      <div className="flex items-baseline gap-1 tabular-nums text-[#d9a441]">
        <span className="text-2xl font-bold">{kmh}</span>
        <span className="text-xs text-[#9fb8c8]">km/h</span>
      </div>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[#0f151d]">
        <div className="h-full rounded-full bg-[#d9a441] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-1.5 text-[9px] uppercase tracking-wide text-[#9fb8c8]/80">
        <span className="rounded border border-[#3d4a5c] px-1">{actionLabel(keybinds, "throttle") ?? "-"}</span>
        <span className="rounded border border-[#3d4a5c] px-1">{actionLabel(keybinds, "brake") ?? "-"}</span>
        <span className="rounded border border-[#3d4a5c] px-1">{actionLabel(keybinds, "steerLeft") ?? "-"}</span>
        <span className="rounded border border-[#3d4a5c] px-1">{actionLabel(keybinds, "steerRight") ?? "-"}</span>
        <span className="rounded border border-[#3d4a5c] px-1">{actionLabel(keybinds, "handbrake") ?? "-"}</span>
      </div>
    </div>
  );
}
