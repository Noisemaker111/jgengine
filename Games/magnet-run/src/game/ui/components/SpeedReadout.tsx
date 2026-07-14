import { formatSpeed } from "@jgengine/core/format/speed";
import { keyLabel } from "../keyLabel";
import { useRunState } from "../useRunState";

export function SpeedReadout() {
  const run = useRunState();
  const kmh = formatSpeed(run.speed, { showUnit: false });
  return (
    <div className="flex flex-col items-start gap-0.5 rounded bg-[#2b2f36]/85 px-3 py-1.5 shadow-lg">
      <span className="text-[10px] font-semibold tracking-widest text-[#dfe6ee]/60">SPEED</span>
      <span className="text-2xl font-black tabular-nums text-[#dfe6ee]">
        {kmh}
        <span className="ml-1 text-xs font-semibold text-[#dfe6ee]/60">KM/H</span>
      </span>
      <span className="flex gap-2 text-[10px] font-semibold text-[#dfe6ee]/50">
        <span>
          <span className="rounded border border-[#dfe6ee]/40 px-1">{keyLabel("boost")}</span> BOOST
        </span>
        <span>
          <span className="rounded border border-[#dfe6ee]/40 px-1">{keyLabel("brake")}</span> BRAKE
        </span>
      </span>
    </div>
  );
}
