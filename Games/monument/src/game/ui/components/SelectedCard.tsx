import type { ReactNode } from "react";

import { PLAZA_KINDS, PROGRAMS, TYPOLOGIES, type Building, type Plaza } from "../../catalog";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";

function Line({ label, value, sub }: { label: string; value: string; sub?: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between px-3.5 py-2.5">
      <span className={EYEBROW}>{label}</span>
      <span className="text-right">
        <span className="block text-[12px] font-medium text-[#171916]">{value}</span>
        {sub !== undefined && (
          <span className="block text-[9px] uppercase tracking-[0.06em] text-[#6d7069]">{sub}</span>
        )}
      </span>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  onRemove,
  children,
}: {
  eyebrow: string;
  title: string;
  onRemove: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={`w-[266px] ${PANEL}`}>
      <div className={`border-b px-3.5 pb-2.5 pt-3 ${HAIRLINE}`}>
        <span className={EYEBROW}>{eyebrow}</span>
        <div className="mt-1 text-[15px] font-bold tracking-[-0.01em] text-[#171916]">{title}</div>
      </div>
      <div className="divide-y divide-[rgba(20,22,18,0.12)]">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        className={`flex w-full items-center justify-center gap-2 border-t py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#171916] transition hover:bg-[#ef715b] hover:text-[#eeeae0] ${HAIRLINE}`}
      >
        <span className="text-[12px] leading-none">✕</span> Strike from plan
      </button>
    </div>
  );
}

export function SelectedCard({
  building,
  plaza,
  onRemove,
}: {
  building: Building | null;
  plaza: Plaza | null;
  onRemove: (id: string) => void;
}): ReactNode {
  if (building !== null) {
    const typology = TYPOLOGIES[building.typology];
    const program = PROGRAMS[building.program];
    return (
      <Card eyebrow="Structure" title={building.name} onRemove={() => onRemove(building.id)}>
        <Line label="Typology" value={typology.label} sub={typology.subtitle} />
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span className="h-3 w-3 shrink-0" style={{ background: program.color }} />
          <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#171916]">
            {program.label}
          </span>
        </div>
      </Card>
    );
  }
  if (plaza !== null) {
    const kind = PLAZA_KINDS[plaza.kind];
    return (
      <Card eyebrow="Public ground" title={kind.label} onRemove={() => onRemove(plaza.id)}>
        <div className="px-3.5 py-2.5 text-[10.5px] leading-relaxed text-[#6d7069]">{kind.description}</div>
      </Card>
    );
  }
  return null;
}
