import type { FeedEntry } from "@jgengine/core/game/feed";
import { useFeed } from "@jgengine/react/hooks";

import { PickupToastStack, type PickupEntry } from "@/components/ui/pickup-toast-stack";

export function FeedPickupToasts({
  action,
  limit = 5,
  mapEntry,
  className,
}: {
  action: string;
  limit?: number;
  mapEntry: (entry: FeedEntry<unknown>, index: number) => PickupEntry | null;
  className?: string;
}) {
  const raw = useFeed({ action, limit });
  const entries: PickupEntry[] = [];
  raw.forEach((entry, index) => {
    const mapped = mapEntry(entry, index);
    if (mapped !== null) entries.push(mapped);
  });
  return <PickupToastStack entries={entries} limit={limit} className={className} />;
}
