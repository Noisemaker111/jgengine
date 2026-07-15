import type { ReactNode } from "react";

import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";

import { moodOf, NEEDS } from "../../needs/needs";
import { householdStore } from "../../session/store";
import { activeGoalLabel } from "../../sim/simulate";
import { AlienSwatch, MoodBadge, NeedBar } from "./bits";

export function RosterPanel(): ReactNode {
  const household = useStore(householdStore);
  const { commands } = useGame();

  return (
    <div className="pointer-events-auto w-64 rounded-xl bg-slate-950/78 p-3 shadow-lg ring-1 ring-white/10 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Household</h2>
        <span className="text-[11px] text-slate-500">{household.order.length} beings</span>
      </div>
      <div className="flex flex-col gap-2">
        {household.order.map((id) => {
          const member = household.members[id];
          if (member === undefined) return null;
          const mood = moodOf(member.needs);
          const selected = household.selectedMemberId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => commands.run("member.select", { id: selected ? null : id })}
              className={`flex flex-col gap-1.5 rounded-lg p-2 text-left transition ${
                selected ? "bg-emerald-400/15 ring-1 ring-emerald-300/50" : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <AlienSwatch plan={member.bodyPlan} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-100">{member.name}</div>
                  <div className="truncate text-[10px] text-slate-400">{activeGoalLabel(member)}</div>
                </div>
                <MoodBadge tier={mood.tier} face={mood.face} label={mood.label} />
              </div>
              <div className="flex flex-col gap-1">
                {NEEDS.map((need) => (
                  <NeedBar key={need} need={need} value={member.needs[need]} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
