import { RETRIES_PER_SECTOR } from "../../systems/sectorController";
import { useStore } from "@jgengine/react/store";
import { runStore } from "../../systems/runState";

const TOTAL_LIVES = RETRIES_PER_SECTOR + 1;

export function RetriesIndicator() {
  const run = useStore(runStore);
  const used = run.crashesInSector;
  return (
    <div className="flex flex-col items-end gap-1 rounded bg-[#2b2f36]/85 px-3 py-1.5 shadow-lg">
      <span className="text-[10px] font-semibold tracking-widest text-[#dfe6ee]/60">RETRIES</span>
      <div className="flex gap-1.5">
        {Array.from({ length: TOTAL_LIVES }, (_, i) => {
          const spent = i < used;
          return (
            <svg key={i} viewBox="0 0 24 24" width={18} height={18} className={spent ? "opacity-25" : "opacity-100"}>
              <rect x="6" y="2" width="12" height="14" rx="6" fill={spent ? "#5a616c" : "#dfe6ee"} />
              <rect x="9" y="15" width="6" height="7" rx="1.5" fill={spent ? "#5a616c" : "#ff4b3e"} />
            </svg>
          );
        })}
      </div>
    </div>
  );
}
