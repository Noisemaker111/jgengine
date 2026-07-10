import { useState } from "react";
import type { ReactNode } from "react";

import { objectiveDone, objectiveProgress, type GrowthBrief } from "../../city/briefs";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";

export function ObjectivePanel({ briefs, stage }: { briefs: GrowthBrief[]; stage: number }): ReactNode {
  const [open, setOpen] = useState(true);
  const brief = stage < briefs.length ? briefs[stage] : null;
  const objectives = brief?.objectives ?? [];
  const completed = objectives.filter(objectiveDone).length;
  const count = brief !== null ? `${completed}/${objectives.length}` : `${briefs.length}/${briefs.length}`;

  return (
    <div className={`w-[272px] ${PANEL}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex-1">
          <span className={`block ${EYEBROW}`}>
            Growth sketches · {Math.min(stage + 1, briefs.length)} / {briefs.length}
          </span>
          <b className="mt-1 block text-[12px] font-bold uppercase tracking-[0.01em] text-[#171916]">
            {brief?.name ?? "City charter complete"}
          </b>
        </span>
        <span className="bg-[#171916] px-1.5 py-1 text-[10px] font-medium tabular-nums text-[#d7ff43]">{count}</span>
        <span className={`text-[13px] leading-none text-[#4b4e47] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className={`border-t px-3.5 pb-3 pt-1.5 ${HAIRLINE}`}>
          {brief !== null ? (
            <>
              {objectives.map((objective) => {
                const done = objectiveDone(objective);
                return (
                  <div key={objective.label} className={`flex items-center gap-2.5 border-b py-2 ${HAIRLINE}`}>
                    <span
                      className={`grid h-[15px] w-[15px] shrink-0 place-items-center border text-[9px] leading-none ${
                        done ? "border-[#171916] bg-[#d7ff43] text-[#171916]" : "border-[#7b7e76] text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`flex-1 text-[10px] font-semibold leading-tight ${
                        done ? "text-[#797c74] line-through" : "text-[#171916]"
                      }`}
                    >
                      {objective.label}
                    </span>
                    <span className="shrink-0 text-[8px] tabular-nums text-[#777a72]">{objectiveProgress(objective)}</span>
                  </div>
                );
              })}
              <p className="mt-2.5 text-[8px] font-medium uppercase leading-snug tracking-[0.04em] text-[#6c6f67]">
                {brief.note}
              </p>
              <div className="mt-2.5 flex items-center gap-2 border border-[rgba(20,22,18,0.19)] bg-[rgba(215,255,67,0.24)] p-2">
                <span className="text-[15px] leading-none text-[#667b1d]">✦</span>
                <span>
                  <b className="block text-[7px] font-semibold uppercase tracking-[0.04em] text-[#171916]">
                    Completing this sketch
                  </b>
                  <small className="mt-0.5 block text-[7px] leading-snug text-[#61645d]">{brief.reward}</small>
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <span className="text-[16px] leading-none text-[#667b1d]">✦</span>
              <b className="text-[10px] font-semibold uppercase tracking-[0.02em] text-[#171916]">
                The district charter is complete
              </b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
