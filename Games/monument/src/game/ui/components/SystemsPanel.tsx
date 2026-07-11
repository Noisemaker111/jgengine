import type { ReactNode } from "react";

import type { CityMetrics, DecisionRecord, DistrictCharter } from "../../catalog";
import { formatStat } from "../../city/metrics";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";
import { Meter } from "./InspectorControls";

const clampPct = (value: number): number => Math.max(0, Math.min(100, value));

const BALANCE_COLORS = {
  housing: "#e96b50",
  work: "#7aa4e8",
  civic: "#d7ff43",
  culture: "#bc86de",
} as const;

const PRINCIPLES: readonly { id: keyof DistrictCharter; title: string; sketch: number }[] = [
  { id: "undercroft", title: "Ground life", sketch: 1 },
  { id: "commons", title: "Shared space", sketch: 2 },
  { id: "aggregate", title: "Material language", sketch: 3 },
];

export function SystemsPanel({
  metrics,
  decisions,
  onClose,
}: {
  metrics: CityMetrics;
  decisions: DecisionRecord[];
  onClose: () => void;
}): ReactNode {
  const bars: readonly { label: string; value: number; color: string }[] = [
    { label: "Housing", value: clampPct((metrics.population / Math.max(1, metrics.capacity)) * 100), color: BALANCE_COLORS.housing },
    { label: "Employment", value: clampPct((metrics.jobs / Math.max(1, metrics.population)) * 100), color: BALANCE_COLORS.work },
    { label: "Civic care", value: clampPct(metrics.civic / 4), color: BALANCE_COLORS.civic },
    { label: "Culture", value: clampPct(metrics.culture / 4), color: BALANCE_COLORS.culture },
  ];
  return (
    <div className={`flex max-h-[calc(100dvh-6rem)] w-[326px] flex-col overflow-hidden ${PANEL}`}>
      <div className={`flex items-start justify-between border-b px-3.5 pb-2.5 pt-3 ${HAIRLINE}`}>
        <div>
          <span className={EYEBROW}>City life</span>
          <div className="mt-1 text-[15px] font-bold tracking-[-0.01em] text-[#171916]">How this city is growing</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close city life panel"
          className="grid h-6 w-6 place-items-center text-[13px] leading-none text-[#4b4e47] transition hover:bg-[rgba(20,22,18,0.08)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[1.2fr_0.8fr] bg-[#171916] text-[#eeeae0]">
          <div className="border-r border-[rgba(255,255,255,0.16)] px-3.5 py-3">
            <span className="block text-[8px] uppercase tracking-[0.1em] text-[#a9ada2]">Public life index</span>
            <b className="mt-1 block text-[27px] font-semibold leading-none text-[#d7ff43]">{metrics.activity}</b>
            <span
              className="mt-2 block h-[3px] w-full"
              style={{ background: `linear-gradient(90deg,#d7ff43 ${metrics.activity}%,#42463f ${metrics.activity}%)` }}
            />
          </div>
          <div className="px-3.5 py-3">
            <span className="block text-[8px] uppercase tracking-[0.1em] text-[#a9ada2]">Approval</span>
            <b className="mt-1 block text-[27px] font-semibold leading-none text-[#d7ff43]">{metrics.approval}%</b>
            <small className="mt-1.5 block text-[8px] uppercase tracking-[0.06em] text-[#a9ada2]">
              {metrics.approval >= 72 ? "thriving" : "needs care"}
            </small>
          </div>
        </div>

        <div className={`border-b py-2 ${HAIRLINE}`}>
          <div className="flex items-baseline justify-between px-3.5 pb-1 pt-2">
            <span className={EYEBROW}>Program balance</span>
            <span className="text-[9px] uppercase tracking-[0.06em] text-[#8a8d84]">live capacity</span>
          </div>
          {bars.map((bar) => (
            <Meter key={bar.label} label={bar.label} value={bar.value} color={bar.color} suffix="%" />
          ))}
        </div>

        <div className={`border-b py-2 ${HAIRLINE}`}>
          <div className="flex items-baseline justify-between px-3.5 pb-1 pt-2">
            <span className={EYEBROW}>Growth principles</span>
            <span className="text-[9px] uppercase tracking-[0.06em] text-[#8a8d84]">what the city becomes</span>
          </div>
          <div className={`mx-3.5 mb-1 border ${HAIRLINE}`}>
            {PRINCIPLES.map((principle) => {
              const record = decisions.find((entry) => entry.eventId === principle.id);
              const resolved = record !== undefined;
              return (
                <div
                  key={principle.id}
                  className={`flex items-center gap-2.5 border-b bg-[rgba(255,255,255,0.13)] px-2 py-2 last:border-b-0 ${HAIRLINE} ${
                    resolved ? "" : "opacity-70"
                  }`}
                >
                  <span
                    className={`grid h-[19px] w-[19px] shrink-0 place-items-center border text-[8px] leading-none ${
                      resolved ? "border-[#171916] bg-[#171916] text-[#d7ff43]" : "border-[#92958d] text-[#868980]"
                    }`}
                  >
                    {resolved ? "◆" : "○"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[6.5px] uppercase tracking-[0.04em] text-[#777a72]">{principle.title}</span>
                    <b
                      className={`mt-0.5 block truncate text-[8px] font-semibold uppercase ${
                        resolved ? "text-[#171916]" : "text-[#868980]"
                      }`}
                    >
                      {resolved ? record.choice : `Awaiting sketch ${principle.sketch}`}
                    </b>
                  </div>
                  {resolved && (
                    <em className="shrink-0 whitespace-nowrap text-[6px] font-medium not-italic text-[#696c64]">
                      DAY {record.day}
                    </em>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <section className="flex items-start gap-3 px-3.5 py-3.5">
          <span className="mt-0.5 text-[16px] leading-none text-[#657a3d]">☘</span>
          <div>
            <span className={EYEBROW}>Embodied carbon</span>
            <b className="mt-1 block text-[16px] font-semibold tabular-nums text-[#171916]">
              {formatStat(metrics.carbon)} tCO₂e
            </b>
            <small className="mt-1 block text-[9.5px] leading-snug text-[#63665f]">
              Structure and material set the district&rsquo;s embodied carbon; gardens, water, and reclaimed ground pull it back down.
            </small>
          </div>
        </section>
      </div>
    </div>
  );
}
