import type { ReactNode } from "react";

import type { CityEvent } from "../../city/briefs";

export function EventModal({ event, onChoose }: { event: CityEvent; onChoose: (choice: number) => void }): ReactNode {
  return (
    <div className="pointer-events-auto fixed inset-0 z-[110] grid place-items-center bg-[rgba(12,15,13,0.62)] px-4 backdrop-blur-[9px]">
      <div
        role="dialog"
        aria-modal="true"
        className="grid w-[min(760px,100%)] grid-cols-1 border border-[rgba(255,255,255,0.4)] bg-[#e9e4d8] text-[#171916] shadow-[0_34px_90px_rgba(0,0,0,0.4)] sm:grid-cols-[142px_1fr]"
      >
        <div className="flex flex-row items-center gap-2.5 bg-[#171916] px-4 py-4 text-[#eeeae0] sm:flex-col sm:items-start sm:px-[18px] sm:py-6">
          <span className="text-[8px] font-medium uppercase leading-[1.35] tracking-[0.15em] text-[#d7ff43]">
            City<br className="hidden sm:block" /> choice
          </span>
          <b className="ml-auto text-[42px] font-medium leading-[0.9] tracking-[-0.08em] sm:ml-0 sm:mt-auto sm:text-[70px]">
            {String(event.sketch).padStart(2, "0")}
          </b>
          <em className="text-[8px] not-italic text-[#94998e] sm:my-1.5">Sketch</em>
        </div>

        <div className="p-6 sm:px-[42px] sm:pb-[34px] sm:pt-[38px]">
          <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#666961]">{event.kicker}</span>
          <h2 className="my-2.5 max-w-[490px] text-[32px] font-bold uppercase leading-[0.95] tracking-[-0.055em] text-[#171916] sm:mb-[18px] sm:text-[42px]">
            {event.title}
          </h2>
          <p className="mb-6 max-w-[520px] text-[11px] leading-[1.65] text-[#5f625b]">{event.copy}</p>

          <div className="border border-[rgba(20,22,18,0.19)]">
            {event.choices.map((choice, index) => (
              <button
                key={choice.label}
                type="button"
                autoFocus={index === 0}
                onClick={() => onChoose(index)}
                className="flex min-h-[64px] w-full items-center gap-3 border-b border-[rgba(20,22,18,0.19)] px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-[rgba(20,22,18,0.05)]"
              >
                <i className="text-[8px] not-italic text-[#777a72]">0{index + 1}</i>
                <span className="flex-1">
                  <b className="block text-[10px] font-semibold uppercase text-[#171916]">{choice.label}</b>
                  <small className="mt-0.5 block text-[8px] text-[#73766e]">{choice.detail}</small>
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {choice.impacts.map((impact) => (
                      <em
                        key={impact}
                        className="border border-[rgba(20,22,18,0.28)] bg-[rgba(215,255,67,0.4)] px-1.5 py-0.5 text-[6px] font-medium not-italic tracking-[0.03em] text-[#171916]"
                      >
                        {impact}
                      </em>
                    ))}
                  </span>
                </span>
                <span className="text-[18px] leading-none text-[#171916]">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
