import type { ReactNode } from "react";

import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";

import { NEED_DEFS } from "../../needs/needs";
import { FURNITURE } from "../../objects/catalog";
import { householdStore } from "../../session/store";

function roleLabel(role: string): string {
  return role === "work" ? "💼 Career" : `${NEED_DEFS[role as keyof typeof NEED_DEFS].icon} ${NEED_DEFS[role as keyof typeof NEED_DEFS].label}`;
}

export function BuildPalette(): ReactNode {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const active = household.buildTool;

  return (
    <div className="pointer-events-auto rounded-xl bg-slate-950/80 p-2 shadow-lg ring-1 ring-white/10 backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Furnish</span>
        {active !== null ? (
          <button
            type="button"
            onClick={() => commands.run("build.cancel", {})}
            className="rounded px-1.5 text-[10px] text-slate-400 hover:text-slate-100"
          >
            cancel ✕
          </button>
        ) : (
          <span className="px-1 text-[10px] text-slate-500">pick, then click ground</span>
        )}
      </div>
      <div className="flex gap-1.5">
        {FURNITURE.map((def) => {
          const selected = active === def.id;
          const canAfford = household.credits >= def.cost;
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => commands.run("build.tool", { toolId: def.id })}
              title={def.blurb}
              className={`flex w-24 flex-col items-center gap-1 rounded-lg p-2 text-center transition ${
                selected
                  ? "bg-emerald-400/20 ring-1 ring-emerald-300/60"
                  : canAfford
                    ? "bg-white/5 hover:bg-white/12"
                    : "bg-white/5 opacity-45"
              }`}
            >
              <span
                className="h-6 w-6 rounded-md ring-1 ring-white/20"
                style={{ backgroundColor: def.color }}
              />
              <span className="text-[11px] font-semibold leading-tight text-slate-100">{def.name}</span>
              <span className="text-[9px] text-slate-400">{roleLabel(def.role)}</span>
              <span className={`text-[10px] font-bold ${canAfford ? "text-amber-200" : "text-rose-300"}`}>
                🪙 {def.cost}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
