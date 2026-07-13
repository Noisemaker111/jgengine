import { useDisplayProfile } from "@jgengine/react/display";

import type { SessionSnapshot } from "../../race/session";
import { KeybindBadge } from "./KeybindBadge";
import { formatRaceTime, PALETTE } from "./theme";

const CONTROLS: readonly { action: string; label: string }[] = [
  { action: "pitchUp", label: "Pitch Up" },
  { action: "pitchDown", label: "Pitch Down" },
  { action: "yawLeft", label: "Yaw Left" },
  { action: "yawRight", label: "Yaw Right" },
  { action: "thrust", label: "Thrust" },
  { action: "airbrake", label: "Airbrake" },
  { action: "dodge", label: "Barrel-shift" },
  { action: "restart", label: "Restart" },
];

export function StartScreen({ snapshot, onStart }: { snapshot: SessionSnapshot; onStart: () => void }) {
  const { coarsePointer } = useDisplayProfile();
  return (
    <div
      data-jg-menu
      className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-7 px-6 text-center"
      style={{
        background: `radial-gradient(circle at center, ${PALETTE.skyTeal}22, #0d1b1c 78%)`,
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--jg-hud-dock-clearance, 0px))",
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: PALETTE.skyTeal }}>
          Cloud-City Aerodrome
        </span>
        <h1 className="text-5xl font-black uppercase tracking-tight sm:text-6xl" style={{ color: PALETTE.cloudWhite }}>
          Turbine City
        </h1>
        <p className="max-w-lg text-sm" style={{ color: `${PALETTE.cloudWhite}b3` }}>
          Ten rings, two laps, one pace-glider. Ride the core of a gale like a marble in a garden hose — stray to the
          edge and the turbulence eats your line. Fans spool on their own clock, so read the schedule and pick the
          canyon that will be breathing when you arrive. Two barrel-shift charges dodge you sideways, and your best
          finish flies again as a shadow glider.
        </p>
        {snapshot.records.bestTime !== null && (
          <span
            className="rounded-full border px-4 py-1 font-mono text-sm font-bold"
            style={{ borderColor: `${PALETTE.skyTeal}77`, color: PALETTE.skyTeal, backgroundColor: `${PALETTE.skyTeal}11` }}
          >
            Personal best {formatRaceTime(snapshot.records.bestTime)}
          </span>
        )}
      </div>

      {coarsePointer ? (
        <p className="text-[11px] uppercase tracking-[0.3em]" style={{ color: `${PALETTE.cloudWhite}66` }}>
          Stick steers · Thrust and Airbrake on the right
        </p>
      ) : (
        <>
          <div
            className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border px-6 py-5 sm:grid-cols-4"
            style={{ borderColor: `${PALETTE.citySlate}55`, backgroundColor: "#0f1d1e" }}
          >
            {CONTROLS.map((control) => (
              <div key={control.action} className="flex items-center gap-2">
                <KeybindBadge action={control.action} />
                <span className="text-xs" style={{ color: `${PALETTE.cloudWhite}cc` }}>
                  {control.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] uppercase tracking-[0.3em]" style={{ color: `${PALETTE.cloudWhite}66` }}>
            Mouse also steers pitch &amp; yaw
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onStart}
        className="group flex items-center gap-3 rounded-full border-2 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] transition"
        style={{ borderColor: PALETTE.windsockOrange, backgroundColor: `${PALETTE.windsockOrange}1a`, color: PALETTE.windsockOrange }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = PALETTE.windsockOrange;
          event.currentTarget.style.color = "#0d1b1c";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = `${PALETTE.windsockOrange}1a`;
          event.currentTarget.style.color = PALETTE.windsockOrange;
        }}
      >
        Cleared for Departure
        {coarsePointer ? null : <KeybindBadge action="start" />}
      </button>
    </div>
  );
}
