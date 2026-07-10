import { KeybindBadge } from "./KeybindBadge";

const CONTROLS: readonly { action: string; label: string }[] = [
  { action: "throttle", label: "Throttle" },
  { action: "brake", label: "Brake / Reverse" },
  { action: "steerLeft", label: "Steer Left" },
  { action: "steerRight", label: "Steer Right" },
  { action: "handbrake", label: "Handbrake Drift" },
  { action: "boost", label: "Boost" },
];

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-8 bg-[radial-gradient(circle_at_center,rgba(255,45,120,0.16),rgba(10,10,16,0.94)_70%)] px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.5em] text-[#29d9e0]">Neon Noir Arcade Racer</span>
        <h1 className="text-5xl font-black uppercase tracking-tight text-[#e8e6f0] drop-shadow-[0_0_18px_rgba(255,45,120,0.55)] sm:text-6xl">
          Drift District
        </h1>
        <p className="max-w-md text-sm text-[#e8e6f0]/70">
          Three laps through Harbor, Downtown, and Heights. Drift a gate hard and the district reshuffles the road
          ahead — clean lines get the long way, style gets the shortcut.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border border-[#e8e6f0]/15 bg-[#15151d]/90 px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.6)] sm:grid-cols-3">
        {CONTROLS.map((control) => (
          <div key={control.action} className="flex items-center gap-2">
            <KeybindBadge action={control.action} />
            <span className="text-xs text-[#e8e6f0]/80">{control.label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        className="group flex items-center gap-3 rounded-full border-2 border-[#ff2d78] bg-[#ff2d78]/10 px-8 py-3 text-lg font-black uppercase tracking-[0.2em] text-[#ff2d78] transition hover:bg-[#ff2d78] hover:text-[#15151d]"
      >
        Send It
        <KeybindBadge action="confirm" />
      </button>
    </div>
  );
}
