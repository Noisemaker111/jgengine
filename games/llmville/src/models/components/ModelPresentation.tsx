/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { formatTrainingDurationLabel } from "@llmville/game/models/trainingDurationLabel";

import { DISPLAY } from "../../ui/theme";
import { FULL, Icon, Row, Text } from "../../ui/kit";

type ModelStatColor = "green" | "yellow" | "blue";
const STAT_COLOR: Record<ModelStatColor, string> = { green: "#4ade80", yellow: "#facc15", blue: "#60a5fa" };

/** Same row as the fine-tune control on `BaseModelCard`: ~duration + clock. */
export function ModelTrainingDurationEstimate({ estimatedSeconds }: { estimatedSeconds: number }) {
  return <Row gap={6}>
    <Text family={DISPLAY} size={13} weight={800} tracking={1}>{`${Number.isFinite(estimatedSeconds) ? "~" : ""}${formatTrainingDurationLabel(estimatedSeconds).toUpperCase()}`}</Text>
    <Icon name="clock" size={16} strokeWidth={2.5} />
  </Row>;
}

export function getDeltaFillOpacity(delta: number, baseline: number): number {
  const magnitude = Math.min(1, Math.abs(delta) / Math.max(1, baseline));
  if (delta > 0) return 0.55 + magnitude * 0.45;
  if (delta < 0) return 0.55 - magnitude * 0.3;
  return 0.55;
}

/** A thin stat bar (0..100) with its value beside it; hidden stats read "???". */
export function ModelStatRow({ color, value, label, fillOpacity = 1, hidden = false, title }: {
  color: ModelStatColor; value: number; label: string; fillOpacity?: number; hidden?: boolean; title?: string;
}) {
  const fraction = Math.min(100, Math.max(0, value)) / 100;
  return <Row gap={6} width={FULL} {...(title === undefined ? {} : { tooltip: title })}>
    <RuneView height={8} minWidth={32} maxWidth={208} grow={1} radius={2} fill="#0a1210" border={{ width: 1, color: "#243430" }} clip>
      {hidden ? null : <RuneView height={8} width={{ fraction }} fill={STAT_COLOR[color]} opacity={fillOpacity} />}
    </RuneView>
    <Text size={14} weight={900} color={STAT_COLOR[color]}>{hidden ? "???" : label}</Text>
  </Row>;
}
