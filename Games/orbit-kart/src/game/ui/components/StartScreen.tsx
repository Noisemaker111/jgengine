import { KeybindBadge } from "./KeybindBadge";

const CONTROLS: readonly { action: string; label: string }[] = [
  { action: "thrust", label: "Thrust" },
  { action: "retroThrust", label: "Retro-Thrust" },
  { action: "rotateLeft", label: "Rotate Left" },
  { action: "rotateRight", label: "Rotate Right" },
  { action: "dischargeSling", label: "Discharge Sling" },
  { action: "restart", label: "Restart Race" },
];

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div data-jg-menu className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-7 bg-[radial-gradient(circle_at_center,rgba(127,216,190,0.16),rgba(5,4,15,0.96)_72%)] px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.5em] text-[#7fd8be]">Retro Space-Cartoon Grand Prix</span>
        <h1 className="text-5xl font-black uppercase tracking-tight text-[#f5f3ff] drop-shadow-[0_0_20px_rgba(255,127,17,0.5)] sm:text-6xl">
          Orbit Kart
        </h1>
        <p className="max-w-lg text-sm text-[#f5f3ff]/75">
          Six checkpoint rings, three laps, seven gravity wells. Aim the predicted thread into a well, charge the
          slingshot meter, and discharge inside the clean window to sling out faster than you flew in. Brakes are
          for cowards — geometry is for winners.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border border-[#f5f3ff]/15 bg-[#0a0820]/90 px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.6)] sm:grid-cols-3">
        {CONTROLS.map((control) => (
          <div key={control.action} className="flex items-center gap-2">
            <KeybindBadge action={control.action} />
            <span className="text-xs text-[#f5f3ff]/80">{control.label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        className="group flex items-center gap-3 rounded-full border-2 border-[#ff7f11] bg-[#ff7f11]/10 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] text-[#ff7f11] transition hover:bg-[#ff7f11] hover:text-[#05040f]"
      >
        Green Light
        <KeybindBadge action="startRace" />
      </button>
    </div>
  );
}
