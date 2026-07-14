import { keyLabel } from "../keyLabel";
import { useStore } from "@jgengine/react/store";
import { runStore } from "../../systems/runState";

const LABEL = { red: "+", blue: "−" } as const;
const COLOR = { red: "#ff4b3e", blue: "#3e7bff" } as const;

export function PolarityChip() {
  const run = useStore(runStore);
  const flashing = run.flipFlashUntil > run.totalElapsed;
  const color = COLOR[run.polarity];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full border-4 text-4xl font-black text-white shadow-[0_0_24px_rgba(0,0,0,0.55)] transition-transform duration-150 sm:h-24 sm:w-24"
        style={{
          backgroundColor: color,
          borderColor: flashing ? "#ffffff" : `${color}aa`,
          boxShadow: flashing ? `0 0 28px 6px ${color}` : "0 0 18px rgba(0,0,0,0.5)",
          transform: flashing ? "scale(1.08)" : "scale(1)",
        }}
      >
        {LABEL[run.polarity]}
      </div>
      <div className="flex items-center gap-1 rounded bg-[#2b2f36]/85 px-2 py-0.5 text-[11px] font-semibold tracking-widest text-[#dfe6ee]">
        POLARITY: {run.polarity === "red" ? "+" : "−"}
        <span className="ml-1 rounded border border-[#dfe6ee]/40 px-1 text-[10px] text-[#dfe6ee]/80">{keyLabel("polarityFlip")}</span>
      </div>
    </div>
  );
}
