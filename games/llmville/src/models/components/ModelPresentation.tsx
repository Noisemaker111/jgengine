import type { ReactNode } from "react";
import { Clock } from "lucide-react";

import { formatTrainingDurationLabel } from "@llmville/game/models/trainingDurationLabel";

type ModelStatColor = "green" | "yellow" | "blue";

/** Same row as the fine-tune control on `BaseModelCard`: ~duration + clock. */
export function ModelTrainingDurationEstimate({ estimatedSeconds }: { estimatedSeconds: number }) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5 font-game text-[0.8125rem] font-extrabold uppercase tracking-[0.08em] text-white">
      <span className="tabular-nums">{Number.isFinite(estimatedSeconds) ? "~" : ""}{formatTrainingDurationLabel(estimatedSeconds)}</span>
      <Clock className="size-4 shrink-0 opacity-95" strokeWidth={2.5} aria-hidden />
    </span>
  );
}

const STAT_ROW_ACCENT_CLASS: Record<ModelStatColor, string> = {
  green: "text-[#4ADE80]",
  yellow: "text-[#FACC15]",
  blue: "text-[#60A5FA]",
};

const STAT_ROW_FILL_CLASS: Record<ModelStatColor, string> = {
  green: "bg-[#4ADE80]",
  yellow: "bg-[#FACC15]",
  blue: "bg-[#60A5FA]",
};

interface ModelStatRowProps {
  color: ModelStatColor;
  value: number;
  label: ReactNode;
  fillOpacity?: number;
  hidden?: boolean;
  title?: string;
}

export function getDeltaFillOpacity(delta: number, baseline: number): number {
  const magnitude = Math.min(1, Math.abs(delta) / Math.max(1, baseline));
  if (delta > 0) return 0.55 + magnitude * 0.45;
  if (delta < 0) return 0.55 - magnitude * 0.3;
  return 0.55;
}

export function ModelStatRow({ color, value, label, fillOpacity = 1, hidden = false, title }: ModelStatRowProps) {
  const barWidth = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-1.5" title={title}>
      <div className="h-2 min-w-8 max-w-52 flex-1 overflow-hidden rounded-sm border border-[#243430] bg-[#0a1210]">
        {!hidden && (
          <div
            className={`h-full ${STAT_ROW_FILL_CLASS[color]}`}
            style={{ width: `${barWidth}%`, opacity: fillOpacity }}
          />
        )}
      </div>
      <span className={`shrink-0 text-[14px] font-black tabular-nums ${STAT_ROW_ACCENT_CLASS[color]}`}>
        {hidden ? "???" : label}
      </span>
    </div>
  );
}
