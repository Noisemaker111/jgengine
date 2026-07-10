import { PLAYER_RACER_ID, type SessionSnapshot } from "../../race/session";
import { PALETTE } from "../theme";
import { formatRaceTime } from "../theme";

export function RaceHud({ snapshot }: { snapshot: SessionSnapshot }) {
  const playerStanding = snapshot.standings.find((s) => s.racerId === PLAYER_RACER_ID);
  const position = playerStanding?.position ?? 1;
  const total = snapshot.standings.length;

  return (
    <div
      className="absolute left-4 top-4 flex flex-col gap-2 rounded-lg border px-4 py-3 shadow-[0_0_24px_rgba(0,0,0,0.5)]"
      style={{ borderColor: `${PALETTE.iceBlue}26`, backgroundColor: `${PALETTE.deepWater}d9` }}
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: PALETTE.auroraGreen }}>
          Lap {snapshot.lap}/{snapshot.laps}
        </span>
        <span className="font-mono text-lg font-black" style={{ color: PALETTE.snowWhite }}>
          P{position}
          <span className="text-xs" style={{ color: `${PALETTE.snowWhite}80` }}>
            /{total}
          </span>
        </span>
      </div>
      <div className="flex gap-5">
        <TimeField label="Lap Time" value={formatRaceTime(snapshot.currentLapTime)} />
        <TimeField label="Best" value={formatRaceTime(snapshot.bestLapTime)} />
        <TimeField label="Total" value={formatRaceTime(snapshot.totalTime)} />
      </div>
      {snapshot.lapSplits.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t pt-2" style={{ borderColor: `${PALETTE.iceBlue}1f` }}>
          {snapshot.lapSplits.map((split, i) => (
            <span key={i} className="font-mono text-[10px]" style={{ color: `${PALETTE.iceBlue}cc` }}>
              S{i + 1} {formatRaceTime(split)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-bold uppercase tracking-[0.25em]" style={{ color: `${PALETTE.snowWhite}73` }}>
        {label}
      </span>
      <span className="font-mono text-sm font-bold" style={{ color: PALETTE.snowWhite }}>
        {value}
      </span>
    </div>
  );
}
