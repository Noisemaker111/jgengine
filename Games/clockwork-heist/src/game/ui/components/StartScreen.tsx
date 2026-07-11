import type { ReactNode } from "react";
import { useGame } from "@jgengine/react/hooks";
import { TREASURE_DEFS } from "../../items/treasures";
import { mansionClockAt, RUN_SECONDS } from "../../schedule/mansionClock";

export function StartScreen(): ReactNode {
  const { commands } = useGame();
  const dawn = mansionClockAt(RUN_SECONDS);

  return (
    <div className="pointer-events-auto absolute inset-0 overflow-hidden bg-[#07101d] text-[#f4e8ca]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(201,162,39,0.18),transparent_34%),linear-gradient(135deg,#1d2b4a_0%,#07101d_55%,#03070d_100%)]" />
      <div className="absolute -right-28 -top-28 aspect-square w-[34rem] rounded-full border border-[#c9a227]/25 shadow-[inset_0_0_80px_rgba(201,162,39,0.08)]" />
      <div className="absolute -right-10 top-10 aspect-square w-[22rem] rounded-full border border-[#c9a227]/20" />
      <div className="absolute right-24 top-24 h-40 w-px origin-bottom rotate-[38deg] bg-gradient-to-t from-[#c9a227] to-transparent" />

      <div className="relative grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex min-h-0 flex-col justify-center px-7 py-8 sm:px-12 lg:px-16">
          <p className="font-serif text-[10px] uppercase tracking-[0.48em] text-[#c9a227]">A gentleman&apos;s occupation</p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl font-semibold leading-[0.9] tracking-[-0.03em] text-[#fff3d6] sm:text-7xl">
            Clockwork
            <span className="block pl-[0.75em] italic text-[#d8bd66]">Heist</span>
          </h1>
          <p className="mt-6 max-w-xl border-l border-[#c9a227]/55 pl-4 text-sm leading-7 text-[#e5d9c3]/78 sm:text-base">
            Every guard, door, and sweeping light keeps published time. Learn the score, slip between its beats, and be gone before {dawn.label}.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              autoFocus
              onClick={() => commands.run("startHeist", {})}
              className="group relative min-h-14 overflow-hidden border border-[#d5b64c] bg-[#7a1f2b] px-8 py-3 font-serif text-sm font-semibold uppercase tracking-[0.24em] text-[#fff3d6] shadow-[0_14px_45px_rgba(0,0,0,0.42)] transition duration-150 hover:-translate-y-0.5 hover:bg-[#922b37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4d568] active:translate-y-0 active:scale-[0.98]"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-[#d5b64c] transition-all group-hover:w-2" />
              Begin the heist
              <span className="ml-4 font-mono text-[10px] text-[#f4e8ca]/65">ENTER</span>
            </button>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#e5d9c3]/45">
              Move quietly · hold to lift · read the schedule
            </div>
          </div>
        </section>

        <aside className="relative hidden min-h-0 border-l border-[#c9a227]/20 bg-black/15 p-8 lg:flex lg:flex-col lg:justify-center">
          <div className="absolute left-0 top-1/2 h-px w-10 bg-[#c9a227]/60" />
          <p className="font-serif text-xs uppercase tracking-[0.34em] text-[#c9a227]">The five marks</p>
          <div className="mt-5 space-y-2">
            {TREASURE_DEFS.map((treasure, index) => (
              <div key={treasure.id} className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-[#c9a227]/15 py-3">
                <span className="font-mono text-[10px] text-[#c9a227]/60">0{index + 1}</span>
                <span className="font-serif text-base text-[#f2e3c2]/90 transition group-hover:translate-x-1">{treasure.name}</span>
                <span className="font-mono text-sm text-[#d8bd66]">{treasure.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-7 grid grid-cols-3 gap-px bg-[#c9a227]/20 text-center">
            <BriefingStat label="Deadline" value={dawn.label} />
            <BriefingStat label="Method" value="Silent" />
            <BriefingStat label="Exit" value="West" />
          </div>
        </aside>
      </div>
    </div>
  );
}

function BriefingStat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="bg-[#0b1322] px-2 py-4">
      <div className="text-[8px] uppercase tracking-[0.26em] text-[#e5d9c3]/40">{label}</div>
      <div className="mt-1 font-serif text-sm text-[#f4e8ca]">{value}</div>
    </div>
  );
}
