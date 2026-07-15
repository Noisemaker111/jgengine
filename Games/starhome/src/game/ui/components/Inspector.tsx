import type { ReactNode } from "react";

import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";

import { describePlan } from "../../creatures/bodyPlan";
import { moodOf, NEEDS } from "../../needs/needs";
import { householdStore } from "../../session/store";
import { pairKey } from "../../session/types";
import { activeGoalLabel } from "../../sim/simulate";
import { relationLabel } from "../../sim/social";
import { AlienSwatch, MoodBadge, NeedBar } from "./bits";

export function Inspector(): ReactNode {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const id = household.selectedMemberId;
  if (id === null) return null;
  const member = household.members[id];
  if (member === undefined) return null;
  const mood = moodOf(member.needs);

  const bonds = household.order
    .filter((other) => other !== id)
    .map((other) => ({
      name: household.members[other]?.name ?? "?",
      value: household.relationships[pairKey(id, other)] ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="pointer-events-auto w-64 rounded-xl bg-slate-950/82 p-3 shadow-lg ring-1 ring-white/10 backdrop-blur">
      <div className="mb-2 flex items-start gap-2">
        <AlienSwatch plan={member.bodyPlan} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-100">{member.name}</div>
          <div className="text-[10px] text-slate-400">{member.job}</div>
          <div className="text-[10px] capitalize text-slate-500">{describePlan(member.bodyPlan)}</div>
        </div>
        <button
          type="button"
          onClick={() => commands.run("member.select", { id: null })}
          className="text-xs text-slate-500 hover:text-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <MoodBadge tier={mood.tier} face={mood.face} label={mood.label} />
        <span className="text-[10px] italic text-slate-400">{activeGoalLabel(member)}</span>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        {NEEDS.map((need) => (
          <NeedBar key={need} need={need} value={member.needs[need]} />
        ))}
      </div>

      <div className="mb-2">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Bonds</div>
        <div className="flex flex-col gap-1">
          {bonds.map((bond) => (
            <div key={bond.name} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-200">{bond.name}</span>
              <span className="text-slate-400">{relationLabel(bond.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-md bg-white/5 px-2 py-1.5 text-[10px] leading-snug text-slate-400">
        Click a furnishing to send {member.name.split(" ")[0]} to use it.
      </p>
    </div>
  );
}
