import { SettingsTrigger } from "@jgengine/react";

import { PLAYER_RACER_ID, type SessionSnapshot } from "../../race/session";
import { PALETTE } from "../theme";
import { formatRaceTime } from "../theme";
import { KeybindBadge } from "./KeybindBadge";

function headlineFor(snapshot: SessionSnapshot): { headline: string; sub: string } {
  if (snapshot.outcome === "win") return { headline: "FIRST ACROSS THE ICE", sub: "Circuit Champion" };
  if (snapshot.loseReason === "sunk") return { headline: "THE LAKE WON", sub: "Drowned Out" };
  return { headline: "OUTRACED", sub: "Race Over" };
}

export function ResultsScreen({ snapshot, onRestart }: { snapshot: SessionSnapshot; onRestart: () => void }) {
  const won = snapshot.outcome === "win";
  const accent = won ? PALETTE.auroraGreen : PALETTE.flareRed;
  const { headline, sub } = headlineFor(snapshot);
  const playerStanding = snapshot.standings.find((s) => s.racerId === PLAYER_RACER_ID);

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-7 px-6 text-center"
      style={{ background: `radial-gradient(circle at center, ${PALETTE.iceBlue}14, ${PALETTE.deepWater}f7 75%)` }}
    >
      <SettingsTrigger className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#a8dadc]/30 bg-[#0d1b2a]/70 text-[#a8dadc] backdrop-blur transition-colors hover:bg-[#a8dadc]/15" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: accent }}>
          {sub}
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight sm:text-5xl" style={{ color: PALETTE.snowWhite }}>
          {headline}
        </h1>
      </div>

      <div
        className="grid w-full max-w-md grid-cols-2 gap-4 rounded-lg border px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.6)]"
        style={{ borderColor: `${PALETTE.iceBlue}26`, backgroundColor: `${PALETTE.deepWater}e6` }}
      >
        <ResultStat label="Finish" value={`P${playerStanding?.position ?? "-"} / ${snapshot.standings.length}`} accent />
        <ResultStat label="Total Time" value={formatRaceTime(snapshot.totalTime)} />
        <ResultStat label="Best Lap" value={formatRaceTime(snapshot.bestLapTime)} />
        <ResultStat label="Lines Survived" value={String(snapshot.cleanLines)} />
        <ResultStat label="Sinks" value={`${snapshot.sinkCount}/${snapshot.maxSinks}`} />
      </div>

      <div className="flex w-full max-w-md flex-col gap-1 text-left">
        {snapshot.standings.map((row) => (
          <div
            key={row.racerId}
            className="flex items-center justify-between rounded px-3 py-1.5 text-xs"
            style={{
              backgroundColor: row.racerId === PLAYER_RACER_ID ? `${PALETTE.auroraGreen}22` : "transparent",
              color: PALETTE.snowWhite,
            }}
          >
            <span className="font-mono font-bold">P{row.position}</span>
            <span>{row.name}</span>
            <span style={{ color: `${PALETTE.snowWhite}80` }}>Lap {row.lap}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="group flex items-center gap-3 rounded-full border-2 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] transition"
        style={{ borderColor: accent, color: accent, backgroundColor: `${accent}1a` }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = accent;
          event.currentTarget.style.color = PALETTE.deepWater;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = `${accent}1a`;
          event.currentTarget.style.color = accent;
        }}
      >
        Refreeze the Lake
        <KeybindBadge action="restart" />
      </button>
    </div>
  );
}

function ResultStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: `${PALETTE.snowWhite}80` }}>
        {label}
      </span>
      <span className="font-mono text-2xl font-extrabold" style={{ color: accent ? PALETTE.auroraGreen : PALETTE.snowWhite }}>
        {value}
      </span>
    </div>
  );
}
