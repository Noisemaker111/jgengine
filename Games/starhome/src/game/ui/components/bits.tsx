import type { ReactNode } from "react";

import { bodyColor, describePlan, type AlienBodyPlan } from "../../creatures/bodyPlan";
import { NEED_DEFS, type NeedId } from "../../needs/needs";
import { MOOD_COLORS, NEED_COLORS } from "../../palette";

export function NeedBar({ need, value }: { need: NeedId; value: number }): ReactNode {
  const def = NEED_DEFS[need];
  const pct = Math.max(0, Math.min(100, value));
  const low = pct < 30;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-4 text-center text-[11px]" title={def.label}>
        {def.icon}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/45">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: NEED_COLORS[need], opacity: low ? 0.9 : 1 }}
        />
      </div>
      <span className="w-6 text-right text-[10px] tabular-nums text-slate-300">{Math.round(pct)}</span>
    </div>
  );
}

export function MoodBadge({ tier, face, label }: { tier: string; face: string; label: string }): ReactNode {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${MOOD_COLORS[tier]}22`, color: MOOD_COLORS[tier] }}
    >
      <span className="font-mono">{face}</span>
      {label}
    </span>
  );
}

export function AlienSwatch({ plan, size = 28 }: { plan: AlienBodyPlan; size?: number }): ReactNode {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full ring-1 ring-white/15"
      style={{ width: size, height: size, backgroundColor: bodyColor(plan, 40) }}
      title={describePlan(plan)}
    >
      <span
        className="rounded-full"
        style={{
          width: size * 0.5,
          height: size * (plan.shape === "tall" ? 0.66 : plan.shape === "blob" ? 0.4 : 0.5),
          backgroundColor: bodyColor(plan, 66),
        }}
      />
    </div>
  );
}
