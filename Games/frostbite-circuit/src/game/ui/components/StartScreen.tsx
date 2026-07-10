import { PALETTE } from "../theme";
import { KeybindBadge } from "./KeybindBadge";

const CONTROLS: readonly { action: string; label: string }[] = [
  { action: "throttle", label: "Throttle" },
  { action: "brake", label: "Brake / Reverse" },
  { action: "steerLeft", label: "Steer Left" },
  { action: "steerRight", label: "Steer Right" },
  { action: "handbrake", label: "Handbrake Slide" },
  { action: "restart", label: "Restart Race" },
];

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center"
      style={{
        background: `radial-gradient(circle at center, ${PALETTE.iceBlue}22, ${PALETTE.deepWater}f2 70%)`,
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: PALETTE.auroraGreen }}>
          Expedition Radio — Arctic Midnight Circuit
        </span>
        <h1
          className="text-5xl font-black uppercase tracking-tight drop-shadow-[0_0_18px_rgba(168,218,220,0.55)] sm:text-6xl"
          style={{ color: PALETTE.snowWhite }}
        >
          Frostbite Circuit
        </h1>
        <p className="max-w-lg text-sm" style={{ color: `${PALETTE.snowWhite}b3` }}>
          Five laps on a frozen lake. The ice remembers every line you take — cross a cell twice and it
          cracks; cross it again and it's black water. Rotate your line or the lake takes it from you.
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.6)] sm:grid-cols-3"
        style={{ borderColor: `${PALETTE.iceBlue}26`, backgroundColor: `${PALETTE.deepWater}e6` }}
      >
        {CONTROLS.map((control) => (
          <div key={control.action} className="flex items-center gap-2">
            <KeybindBadge action={control.action} />
            <span className="text-xs" style={{ color: `${PALETTE.snowWhite}cc` }}>
              {control.label}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        className="group flex items-center gap-3 rounded-full border-2 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] transition"
        style={{ borderColor: PALETTE.flareRed, color: PALETTE.flareRed, backgroundColor: `${PALETTE.flareRed}1a` }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = PALETTE.flareRed;
          event.currentTarget.style.color = PALETTE.deepWater;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = `${PALETTE.flareRed}1a`;
          event.currentTarget.style.color = PALETTE.flareRed;
        }}
      >
        Roll Out
        <KeybindBadge action="confirm" />
      </button>
    </div>
  );
}
