import { useStore } from "@jgengine/react/store";
import { raceStore } from "../../handroll";

export function RaceHud() {
  const race = useStore(raceStore, (v) => v ?? null);
  if (race === null) return null;
  if (race.finished) {
    return (
      <div
        className={`-skew-x-6 border-2 border-black px-4 py-2 text-lg font-black uppercase shadow-[4px_4px_0_#000] ${
          race.won ? "bg-[#3fbf5a] text-black" : "bg-[#c23b3b] text-white"
        }`}
      >
        {race.won ? `Won the Ocean Loop — ${race.timeSec.toFixed(1)}s` : "Lost — talk to the starter to retry"}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="-skew-x-6 border-2 border-black bg-[#12141a]/90 px-3 py-1 shadow-[3px_3px_0_#000]">
        <span className="text-xl font-black text-[#ffb020]">
          {race.checkpoint}/{race.total}
        </span>
        <span className="ml-1 text-[10px] font-black uppercase text-[#cfd6de]">gates</span>
      </div>
      <div className={`-skew-x-6 border-2 border-black px-2 py-1 text-sm font-black uppercase shadow-[3px_3px_0_#000] ${race.position === 1 ? "bg-[#3fbf5a] text-black" : "bg-[#c23b3b] text-white"}`}>
        P{race.position}
      </div>
      <div className="-skew-x-6 border-2 border-black bg-[#12141a]/90 px-2 py-1 text-sm font-black tabular-nums text-[#cfd6de] shadow-[3px_3px_0_#000]">
        {race.timeSec.toFixed(1)}s
      </div>
    </div>
  );
}
