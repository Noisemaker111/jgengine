import { useMemo } from "react";
import type { ReactNode } from "react";

import { CITY_TEMPLATES, readCityLibrary, snapshotSummary } from "../../city/library";
import { HAIRLINE } from "../theme";

type Run = (action: string, input?: unknown) => void;

export function WelcomeModal({ revision, run }: { revision: number; run: Run }): ReactNode {
  const saves = useMemo(() => readCityLibrary(), [revision]);
  const templates = useMemo(
    () => CITY_TEMPLATES.map((template) => ({ template, summary: snapshotSummary(template.create(template.id)) })),
    [],
  );

  return (
    <div className="pointer-events-auto fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-[rgba(12,15,13,0.55)] px-4 py-8 backdrop-blur-[6px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="grid w-[min(900px,100%)] grid-cols-1 border border-[rgba(255,255,255,0.4)] bg-[#e9e4d8] text-[#171916] shadow-[0_34px_90px_rgba(0,0,0,0.45)] sm:grid-cols-[308px_1fr]"
      >
        <div className="flex flex-col gap-4 bg-[#171916] px-6 py-7 text-[#eeeae0]">
          <span className="text-[9px] font-medium uppercase tracking-[0.24em] text-[#d7ff43]">Form · light · life</span>
          <div>
            <b
              id="welcome-title"
              className="block text-[46px] font-extrabold uppercase leading-[0.86] tracking-[-0.04em] text-[#eeeae0]"
            >
              Monument
            </b>
            <em className="mt-2 block text-[9px] font-medium uppercase not-italic tracking-[0.26em] text-[#94998e]">
              Brutalist city playground
            </em>
          </div>
          <p className="mt-auto max-w-[240px] text-[11px] leading-[1.7] text-[#b7bab1]">
            Pull, repeat, branch, and carve each structure — then guide its use, atmosphere, public spaces, and the life
            that gathers around it.
          </p>
        </div>

        <div className="flex flex-col p-6 sm:p-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#666961]">Start a city</span>
            <button
              type="button"
              onClick={() => run("city.menu", { open: false })}
              className="flex items-center gap-1.5 border border-[rgba(20,22,18,0.3)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#171916] transition hover:bg-[rgba(20,22,18,0.08)]"
            >
              Continue
              <span className="text-[12px] leading-none">→</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {templates.map(({ template, summary }) => (
              <button
                key={template.id}
                type="button"
                onClick={() => run("city.template", { templateId: template.id })}
                className="relative flex flex-col gap-1 border border-[rgba(20,22,18,0.18)] p-3 pl-4 text-left transition hover:bg-[rgba(20,22,18,0.06)]"
              >
                <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: template.accent }} />
                <div className="flex items-center gap-2">
                  <b className="text-[13px] font-bold tracking-[-0.01em] text-[#171916]">{template.name}</b>
                  <span className="border border-[rgba(20,22,18,0.28)] px-1.5 py-0.5 text-[6.5px] font-medium uppercase tracking-[0.06em] text-[#4b4e47]">
                    {template.label}
                  </span>
                </div>
                <small className="text-[9.5px] leading-snug text-[#6d7069]">{template.description}</small>
                <em className="mt-0.5 text-[8.5px] font-medium not-italic uppercase tracking-[0.06em] text-[#8a8d84]">
                  {summary.structures} structures · {summary.plazas} plazas
                </em>
              </button>
            ))}
          </div>

          {saves.length > 0 && (
            <>
              <span className="mb-2 mt-5 block text-[9px] font-medium uppercase tracking-[0.14em] text-[#666961]">
                Continue a city
              </span>
              <div className={`border ${HAIRLINE}`}>
                {saves.slice(0, 4).map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => run("city.open", { recordId: record.id })}
                    className={`flex w-full items-center gap-3 border-b px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-[rgba(20,22,18,0.05)] ${HAIRLINE}`}
                  >
                    <span className="flex-1">
                      <b className="block text-[11px] font-semibold text-[#171916]">{record.name}</b>
                      <small className="mt-0.5 block text-[9px] text-[#73766e]">
                        Day {record.snapshot.day} · {record.snapshot.buildings.length} structures
                      </small>
                    </span>
                    <em className="text-[9px] font-medium not-italic uppercase tracking-[0.06em] text-[#8a8d84]">
                      Open →
                    </em>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="mt-5 text-[9px] leading-snug text-[#8a8d84]">
            Cities are saved on this device and can be reopened from the library.
          </p>
        </div>
      </div>
    </div>
  );
}
