import type { FeedEntry } from "@jgengine/core/game/feed";
import { useFeed } from "@jgengine/react/hooks";

import { KillFeed, type KillFeedEntry } from "@/components/ui/kill-feed";

export function FeedKillFeed({
  action,
  limit = 5,
  mapEntry,
  className,
}: {
  action: string;
  limit?: number;
  mapEntry: (entry: FeedEntry<unknown>, index: number) => KillFeedEntry | null;
  className?: string;
}) {
  const raw = useFeed({ action, limit });
  const entries: KillFeedEntry[] = [];
  raw.forEach((entry, index) => {
    const mapped = mapEntry(entry, index);
    if (mapped !== null) entries.push(mapped);
  });
  return <KillFeed entries={entries} limit={limit} className={className} />;
}
