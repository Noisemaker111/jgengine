import type { ReactNode } from "react";
import { bodyColor, describePlan, type AlienBodyPlan } from "../../creatures/bodyPlan";
import { NEED_DEFS, type NeedId } from "../../needs/needs";
import { MOOD_COLORS, NEED_COLORS } from "../../palette";

export function NeedBar({ need, value }: { need: NeedId; value: number }): ReactNode {
  const def = NEED_DEFS[need];
  const pct = Math.max(0, Math.min(100, value));
  return <div className={`orbit-need ${pct < 30 ? "low" : ""}`}><span>{def.label}</span><div role="meter" aria-label={def.label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.round(pct)}%`, backgroundColor: NEED_COLORS[need] }}/></div><b>{Math.round(pct)}</b></div>;
}
export function MoodBadge({ tier, face, label }: { tier: string; face: string; label: string }): ReactNode {
  return <span className="orbit-mood" style={{ color: `color-mix(in srgb, ${MOOD_COLORS[tier]} 70%, #2a1733)` }}><span aria-hidden="true">{face}</span> {label}</span>;
}
export function AlienSwatch({ plan, size = 40 }: { plan: AlienBodyPlan; size?: number }): ReactNode {
  const tall = plan.shape === "tall";
  const blob = plan.shape === "blob";
  const eyeCount = Math.max(1, Math.min(4, plan.eyeCount));
  return <svg className="orbit-portrait" width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={describePlan(plan)}>
    <circle cx="36" cy="36" r="34" fill={bodyColor(plan, 20)} stroke={bodyColor(plan, 62)} strokeWidth="2"/>
    <g stroke={bodyColor(plan, 36)} strokeWidth="3" strokeLinejoin="round">
      <path d={tall ? "M24 57V26q0-18 12-18t12 18v31Z" : blob ? "M14 49q-5-16 10-21 0-16 13-10 17-5 19 15 13 7 1 23H20Z" : "M17 40q0-24 19-24t19 24q0 19-19 19T17 40Z"} fill={bodyColor(plan, 67)}/>
      <path d="m21 53-7 8m37-8 7 8m-31-2-3 6m16-6 3 6" fill="none"/>
      <path d="m26 21-4-11m24 11 4-11" fill="none" stroke={bodyColor(plan, 78)}/>
    </g>
    {Array.from({ length: eyeCount }, (_, i) => <g key={i}><ellipse cx={36 + (i - (eyeCount - 1) / 2) * 8} cy={tall ? 31 : 36} rx="4" ry="5" fill="#fff5da"/><circle cx={37 + (i - (eyeCount - 1) / 2) * 8} cy={tall ? 32 : 37} r="2" fill="#241634"/></g>)}
    <path d="M30 47q6 5 12 0" fill="none" stroke="#43234b" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="19" cy="18" r="3" fill="#fff0a8"/>
  </svg>;
}

export function creditsText(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(2); }
