import type { SessionSnapshot } from "../../race/session";
import { PLAYER_ID } from "../../constants";
import { formatRaceTime, ordinal, PALETTE } from "../../theme";

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#f5f3ff]/55">{label}</span>
      <span className="font-mono text-lg font-extrabold text-[#f5f3ff]">{value}</span>
    </div>
  );
}

export function RaceHud({ snapshot }: { snapshot: SessionSnapshot }) {
  const player = snapshot.karts[PLAYER_ID];
  const speed = player !== undefined ? Math.round(player.speed * 10) : 0;
  return (
    <div className="absolute left-2 top-2 flex w-44 flex-col gap-1.5 rounded-lg border border-[#f5f3ff]/20 bg-[#0a0820]/90 px-3 py-2.5 shadow-[0_0_30px_rgba(0,0,0,0.55)] sm:left-4 sm:top-4 sm:w-56 sm:gap-2 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[0.3em] text-[#7fd8be]">
          Lap {snapshot.lap}/{snapshot.laps}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-black"
          style={{ color: snapshot.playerPosition === 1 ? PALETTE.boostTangerine : PALETTE.starlight }}
        >
          {ordinal(snapshot.playerPosition)}
        </span>
      </div>
      <StatRow label="Race Time" value={formatRaceTime(snapshot.totalTime)} />
      <StatRow label="Lap Time" value={formatRaceTime(snapshot.currentLapTime)} />
      <StatRow label="Best Lap" value={formatRaceTime(snapshot.bestLapTime)} />
      <StatRow label="Orbital Velocity" value={`${speed} u/s`} />
      <StatRow label="Clean Slings" value={String(snapshot.cleanSlingCount)} />
    </div>
  );
}

export function AnnouncerTicker({ snapshot }: { snapshot: SessionSnapshot }) {
  if (snapshot.announcer === null) return null;
  return (
    <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-[#ff7f11]/50 bg-[#0a0820]/90 px-6 py-2 text-center shadow-[0_0_30px_rgba(255,127,17,0.35)]">
      <span className="text-sm font-black uppercase tracking-[0.15em] text-[#ff7f11]">{snapshot.announcer.message}</span>
    </div>
  );
}
