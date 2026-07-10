import { CrewRoster } from "./CrewRoster";
import { KeybindLegend } from "./KeybindLegend";

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="pointer-events-auto flex max-h-full w-[min(92vw,30rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-[#f2b950]/40 bg-[#2b2320]/90 p-6 shadow-2xl backdrop-blur">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[#f2b950]">ROOFTOP RELAY</h1>
        <p className="mt-1 text-sm text-[#c9c4b8]">
          Dawn courier crew, five legs, one baton. Run the roofs, trust the jump, snap it clean.
        </p>
      </div>

      <CrewRoster />

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#c9c4b8]/80">Controls</p>
        <KeybindLegend className="flex flex-col gap-1" />
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-1 min-h-12 rounded-lg bg-[#b3573f] px-4 py-3 text-base font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-[#c96448] active:translate-y-px"
      >
        Go go go — Start (Enter)
      </button>
    </div>
  );
}
