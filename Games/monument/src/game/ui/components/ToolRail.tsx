import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { PROGRAMS, type Program, type Tool } from "../../catalog";
import { keybinds } from "../../keybinds";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";
import { Kbd } from "./Kbd";

interface ToolEntry {
  tool: Tool;
  action: string;
  label: string;
  color: string | null;
  glyph: string | null;
}

const PROGRAM_ORDER: readonly Program[] = ["housing", "work", "civic", "culture", "mixed"];

const PROGRAM_ACTION: Record<Program, string> = {
  housing: "toolHousing",
  work: "toolWork",
  civic: "toolCivic",
  culture: "toolCulture",
  mixed: "toolMixed",
};

const ENTRIES: readonly ToolEntry[] = [
  { tool: "select", action: "toolSelect", label: "Select", color: null, glyph: "✛" },
  ...PROGRAM_ORDER.map((program): ToolEntry => ({
    tool: program,
    action: PROGRAM_ACTION[program],
    label: PROGRAMS[program].short,
    color: PROGRAMS[program].color,
    glyph: null,
  })),
  { tool: "plaza", action: "toolPlaza", label: "Plaza", color: null, glyph: "▧" },
  { tool: "demolish", action: "toolDemolish", label: "Demolish", color: null, glyph: "✕" },
];

export function ToolRail({
  activeTool,
  onSelect,
}: {
  activeTool: Tool;
  onSelect: (action: string) => void;
}): ReactNode {
  return (
    <div className={`w-[172px] ${PANEL}`}>
      <span className={`block px-3 pb-2 pt-2.5 ${EYEBROW}`}>Instrument</span>
      <div className={`flex flex-col border-t ${HAIRLINE}`}>
        {ENTRIES.map((entry) => {
          const active = entry.tool === activeTool;
          const key = actionLabel(keybinds, entry.action) ?? "";
          return (
            <button
              key={entry.tool}
              type="button"
              onClick={() => onSelect(entry.action)}
              className={`relative flex items-center gap-2.5 px-3 py-2 text-left transition ${
                active
                  ? "bg-[#171916] text-[#eeeae0]"
                  : "text-[#171916] hover:bg-[rgba(20,22,18,0.08)]"
              }`}
            >
              {active && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#d7ff43]" />}
              <Kbd label={key} active={active} />
              {entry.color !== null ? (
                <span
                  className="h-3.5 w-3.5 shrink-0 border border-[rgba(20,22,18,0.35)]"
                  style={{ background: entry.color }}
                />
              ) : (
                <span className="grid h-3.5 w-3.5 shrink-0 place-items-center text-[13px] leading-none">
                  {entry.glyph}
                </span>
              )}
              <span className="text-[11px] font-medium uppercase tracking-[0.06em]">{entry.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
