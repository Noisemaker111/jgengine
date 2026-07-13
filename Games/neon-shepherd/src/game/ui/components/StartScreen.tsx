import { TIER_ORDER, TIERS, type TierId } from "../../difficulty/tiers";

const CONTROLS: readonly { key: string; label: string }[] = [
  { key: "WASD", label: "walk" },
  { key: "SPACE", label: "gather-pulse" },
  { key: "SHIFT", label: "hold the herd" },
  { key: "M", label: "corridor map" },
  { key: "R", label: "restart" },
  { key: "ENTER", label: "start" },
];

export function StartScreen({
  tier,
  onSelectTier,
  onStart,
}: {
  tier: TierId;
  onSelectTier: (tier: TierId) => void;
  onStart: () => void;
}): React.ReactNode {
  return (
    <div data-jg-menu className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-6 bg-[#101318]/90 px-6 text-center backdrop-blur-md">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-semibold tracking-wide text-[#eef4f0]">Neon Shepherd</h1>
        <p className="max-w-md text-sm italic text-[#7ef9c8]">
          After midnight, twenty lights follow you through the sleeping city. Walk them all home. Lose none.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-widest text-[#eef4f0]/60">Choose the city&apos;s mood</span>
        <div className="flex gap-2">
          {TIER_ORDER.map((id) => {
            const def = TIERS[id];
            const active = id === tier;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTier(id)}
                className="flex min-w-[9.5rem] flex-col items-center gap-1 rounded-xl border px-4 py-3 text-left transition-colors"
                style={{
                  borderColor: active ? "#7ef9c8" : "#2a2f38",
                  backgroundColor: active ? "#7ef9c81a" : "#161a20",
                }}
              >
                <span className="text-sm font-semibold text-[#eef4f0]">{def.label}</span>
                <span className="text-[11px] text-[#eef4f0]/60">{def.tagline}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-2 rounded-xl bg-[#161a20]/80 px-6 py-4">
        {CONTROLS.map((control) => (
          <div key={control.key} className="flex items-center gap-2 text-left">
            <span className="rounded bg-[#0c0e12] px-2 py-1 text-[10px] font-semibold text-[#f5c56b]">{control.key}</span>
            <span className="text-[11px] text-[#eef4f0]/75">{control.label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        className="rounded-full bg-[#7ef9c8] px-8 py-3 text-sm font-semibold uppercase tracking-widest text-[#101318] shadow-[0_0_20px_rgba(126,249,200,0.5)] transition-transform hover:scale-105"
      >
        Start · Enter
      </button>
    </div>
  );
}
