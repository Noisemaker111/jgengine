import type { FeedEntry } from "@jgengine/core/game/feed";
import { useFeed } from "@jgengine/react/hooks";

import { CombatLogPanel, type CombatLogLine } from "@/components/ui/combat-log-panel";

export function FeedCombatLog({
  action,
  limit = 30,
  mapLine,
  title,
  width,
  height,
  className,
}: {
  action: string;
  limit?: number;
  mapLine: (entry: FeedEntry<unknown>, index: number) => CombatLogLine | null;
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const entries = useFeed({ action, limit });
  const lines = entries
    .map((entry, index) => mapLine(entry, index))
    .filter((line): line is CombatLogLine => line !== null);
  return <CombatLogPanel lines={lines} title={title} width={width} height={height} className={className} />;
}
