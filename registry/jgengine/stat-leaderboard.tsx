import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import { useLeaderboard } from "@jgengine/react/hooks";

import { RankList, type RankEntry } from "@/components/ui/rank-list";

export function StatLeaderboard({
  stat,
  scope,
  title,
  resolveName,
  limit,
  width,
  className,
}: {
  stat: string;
  scope: LeaderboardScope;
  title?: string;
  resolveName?: (userId: string) => string;
  limit?: number;
  width?: number;
  className?: string;
}) {
  const rows = useLeaderboard(stat, { scope, limit });
  const entries: RankEntry[] = rows.map((row, index) => ({
    id: row.userId,
    rank: index + 1,
    name: resolveName?.(row.userId) ?? row.userId,
    value: row.value,
  }));
  return <RankList entries={entries} title={title} width={width} className={className} />;
}
