import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import type { Lens } from "../../catalog";
import { keybinds } from "../../keybinds";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";
import { Kbd } from "./Kbd";

export const LENSES: readonly { id: Lens; label: string; glyph: string }[] = [
  { id: "material", label: "Material", glyph: "◧" },
  { id: "program", label: "Program", glyph: "▦" },
  { id: "structure", label: "Structure", glyph: "⌗" },
  { id: "daylight", label: "Daylight", glyph: "☀" },
  { id: "activity", label: "Activity", glyph: "⚡" },
  { id: "carbon", label: "Embodied C", glyph: "☘" },
];

export function ViewDock({ lens, onSelect }: { lens: Lens; onSelect: (lens: Lens) => void }): ReactNode {
  const cycleKey = actionLabel(keybinds, "cycleLens") ?? "";
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
        <span className={EYEBROW}>Lens</span>
        <span className="flex items-center gap-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#8a8d84]">
          cycle
          <Kbd label={cycleKey} />
        </span>
      </div>
      <div className={`flex border-t ${HAIRLINE}`}>
        {LENSES.map((entry) => {
          const active = lens === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry.id)}
              title={entry.label}
              className={`relative flex h-[46px] w-[56px] flex-col items-center justify-center gap-1 transition ${
                active ? "bg-[#171916] text-[#eeeae0]" : "text-[#171916] hover:bg-[rgba(20,22,18,0.08)]"
              }`}
            >
              {active && <span className="absolute left-0 top-0 h-[3px] w-full bg-[#d7ff43]" />}
              <span className="text-[15px] leading-none">{entry.glyph}</span>
              <small className="text-[7px] font-medium uppercase tracking-[0.05em]">{entry.label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
