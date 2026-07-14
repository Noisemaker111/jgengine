import { keyLabel } from "../keyLabel";
import { useStore } from "@jgengine/react/store";
import { runStore } from "../../systems/runState";

const SURFACE_LABEL: Record<string, string> = { floor: "FLOOR", ceiling: "CEILING", train: "TRAIN ROOF" };

export function LaneIndicator() {
  const run = useStore(runStore);
  return (
    <div className="flex flex-col items-center gap-1 rounded bg-[#2b2f36]/85 px-3 py-1.5 shadow-lg">
      <span className="text-[10px] font-semibold tracking-widest text-[#dfe6ee]/60">
        {SURFACE_LABEL[run.surface.kind]} · LANE
        <span className="ml-1 rounded border border-[#dfe6ee]/40 px-1">{keyLabel("laneLeft")}</span>/
        <span className="rounded border border-[#dfe6ee]/40 px-1">{keyLabel("laneRight")}</span>
      </span>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((lane) => (
          <span
            key={lane}
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: lane === run.lane ? "#dfe6ee" : "#4a4f58" }}
          />
        ))}
      </div>
    </div>
  );
}
