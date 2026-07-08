import type { Moodle } from "@jgengine/core/survival/moodle";

import { BuffTray, type BuffChip } from "@/components/ui/buff-tray";

export function MoodleTray({
  moodles,
  size,
  className,
}: {
  moodles: readonly Moodle[];
  size?: number;
  className?: string;
}) {
  const chips: BuffChip[] = moodles.map((moodle) => ({
    id: moodle.id,
    label: moodle.note === undefined ? moodle.label : `${moodle.label} — ${moodle.note}`,
    stacks: moodle.stacks,
    remainingFraction: moodle.fraction,
    kind: moodle.severity === "warning" || moodle.severity === "critical" ? "debuff" : "buff",
  }));
  return <BuffTray buffs={chips} size={size} className={className} />;
}
