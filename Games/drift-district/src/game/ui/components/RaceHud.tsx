import { PLAYER_RACER_ID, type SessionSnapshot } from "../../race/session";
import { formatRaceTime } from "./theme";

export function RaceHud({ snapshot }: { snapshot: SessionSnapshot }) {
  const playerStanding = snapshot.standings.find((s) => s.racerId === PLAYER_RACER_ID);
  const position = playerStanding?.position ?? 1;
  const total = snapshot.standings.length;

  return (
    <div className="absolute left-4 top-4 flex flex-col gap-2 rounded-lg border border-[#e8e6f0]/15 bg-[#15151d]/85 px-4 py-3 shadow-[0_0_24px_rgba(0,0,0,0.5)]">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#29d9e0]">
          Lap {snapshot.lap}/{snapshot.laps}
        </span>
        <span className="font-mono text-lg font-black text-[#e8e6f0]">
          P{position}
          <span className="text-xs text-[#e8e6f0]/50">/{total}</span>
        </span>
      </div>
      <div className="flex gap-5">
        <TimeField label="Time" value={formatRaceTime(snapshot.currentLapTime)} />
        <TimeField label="Best" value={formatRaceTime(snapshot.bestLapTime)} />
        <TimeField label="Total" value={formatRaceTime(snapshot.totalTime)} />
      </div>
    </div>
  );
}

function TimeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#e8e6f0]/45">{label}</span>
      <span className="font-mono text-sm font-bold text-[#e8e6f0]">{value}</span>
    </div>
  );
}
