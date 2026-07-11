import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";
import { Kbd } from "./Kbd";

type Run = (action: string, input?: unknown) => void;

const TOOL_KEYS: readonly [string, string][] = [
  ["Place housing", "toolHousing"],
  ["Place work", "toolWork"],
  ["Place civic", "toolCivic"],
  ["Place culture", "toolCulture"],
  ["Place mixed", "toolMixed"],
  ["Open plaza", "toolPlaza"],
  ["Select / inspect", "toolSelect"],
  ["Demolish", "toolDemolish"],
];

const SYSTEM_KEYS: readonly [string, string][] = [
  ["Play / pause", "pauseToggle"],
  ["Undo", "undo"],
  ["Redo", "redo"],
  ["Cycle lens", "cycleLens"],
  ["Cycle mood", "cycleMood"],
  ["Focus mode", "focusToggle"],
  ["Field manual", "helpToggle"],
];

const HANDLES: readonly { label: string; color: string }[] = [
  { label: "Move", color: "#ffffff" },
  { label: "Height", color: "#d7ff43" },
  { label: "Span", color: "#ffb35c" },
  { label: "Depth", color: "#69d8d0" },
  { label: "Cantilever", color: "#f18ac2" },
  { label: "Void", color: "#8fe083" },
  { label: "Taper", color: "#b8a0ff" },
  { label: "Break", color: "#ff735f" },
  { label: "Repeat", color: "#f2cf58" },
  { label: "Branch", color: "#55c8ff" },
  { label: "Crown", color: "#ff82c8" },
  { label: "Rotate", color: "#d7ff43" },
];

function KeyRow({ label, action }: { label: string; action: string }): ReactNode {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[10px] text-[#4b4e47]">{label}</span>
      <Kbd label={actionLabel(keybinds, action) ?? ""} />
    </div>
  );
}

export function HelpModal({ run, onClose }: { run: Run; onClose: () => void }): ReactNode {
  return (
    <div className="pointer-events-auto fixed inset-0 z-[115] grid place-items-center bg-[rgba(12,15,13,0.6)] px-4 py-8 backdrop-blur-[8px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className={`flex max-h-[calc(100dvh-4rem)] w-[min(680px,100%)] flex-col overflow-hidden ${PANEL}`}
      >
        <header className={`flex items-start justify-between border-b px-5 pb-3 pt-4 ${HAIRLINE}`}>
          <div>
            <span className={EYEBROW}>Field manual</span>
            <h2 id="help-title" className="mt-1 text-[19px] font-bold tracking-[-0.02em] text-[#171916]">
              Design with intent.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close field manual"
            className="grid h-6 w-6 place-items-center text-[13px] leading-none text-[#4b4e47] transition hover:bg-[rgba(20,22,18,0.08)]"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <section>
              <span className={EYEBROW}>Instruments</span>
              <div className="mt-1.5 divide-y divide-[rgba(20,22,18,0.14)]">
                {TOOL_KEYS.map(([label, action]) => (
                  <KeyRow key={action} label={label} action={action} />
                ))}
              </div>
            </section>
            <section>
              <span className={EYEBROW}>City &amp; time</span>
              <div className="mt-1.5 divide-y divide-[rgba(20,22,18,0.14)]">
                {SYSTEM_KEYS.map(([label, action]) => (
                  <KeyRow key={action} label={label} action={action} />
                ))}
              </div>
            </section>
          </div>

          <section className="mt-5">
            <span className={EYEBROW}>Massing handles</span>
            <p className="mt-1 text-[10px] leading-relaxed text-[#5f625b]">
              Select a structure and drag the colored handles to reshape it; hold Shift for fine control.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5">
              {HANDLES.map((handle) => (
                <span key={handle.label} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-[rgba(20,22,18,0.35)]"
                    style={{ background: handle.color }}
                  />
                  <span className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#171916]">
                    {handle.label}
                  </span>
                </span>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <span className={EYEBROW}>Growth &amp; charter</span>
            <p className="mt-1 text-[10px] leading-relaxed text-[#5f625b]">
              As the city grows it completes growth sketches, and each one opens a city choice. Those decisions become the
              district charter — ground life, shared space, and material language — steering how the whole place ages and
              who gathers in it.
            </p>
          </section>

          <section className={`mt-4 border-t pt-3 ${HAIRLINE}`}>
            <p className="text-[10px] leading-relaxed text-[#5f625b]">
              <b className="font-semibold text-[#171916]">Lenses</b> reveal material, program, structure, daylight,
              activity, and embodied carbon. <b className="font-semibold text-[#171916]">Moods</b> reset the hour and
              atmosphere — default, cyberpunk, green, totalitarian, university.
            </p>
          </section>
        </div>

        <div className={`flex justify-end border-t px-5 py-3 ${HAIRLINE}`}>
          <button
            type="button"
            onClick={() => run("helpToggle", {})}
            className="bg-[#171916] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#eeeae0] transition hover:bg-[#2a2c26]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
