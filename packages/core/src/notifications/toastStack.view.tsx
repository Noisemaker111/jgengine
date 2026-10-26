import type { ReactNode } from "react";

import { lootDropsOf } from "@jgengine/core/game/events";
import type { FeedEntry } from "@jgengine/core/game/feed";

import { useFeed } from "@jgengine/react/hooks";

function defaultToast(entry: FeedEntry): ReactNode {
  const drops = lootDropsOf(entry.data);
  if (drops.length > 0) {
    return drops.map((drop) => `${drop.item ?? drop.currency ?? "item"} ×${drop.count}`).join("  ");
  }
  return typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
}

/**
 * Render `ctx.game.feed`'s entries for `action` as a newest-first toast stack. Reach for this when the
 * message source is already an engine event bound onto `ctx.game.feed` (kill feed, quest updates, loot
 * log); for ad-hoc player messages push to `ctx.game.notices`, which the shell draws as a {@link NoticeStack}.
 */
export function ToastStack({
  action,
  limit = 4,
  className,
  renderToast,
}: {
  action: string;
  limit?: number;
  className?: string;
  renderToast?: (entry: FeedEntry, index: number) => ReactNode;
}) {
  const entries = useFeed({ action, limit });
  if (entries.length === 0) return null;
  // Keys stay stable as newer entries arrive so a toast's entrance animation plays once.
  const seen = new Map<number, number>();
  const keyed = entries.map((entry) => {
    const n = seen.get(entry.at) ?? 0;
    seen.set(entry.at, n + 1);
    return { entry, key: `${entry.at}-${n}` };
  });
  const newestFirst = keyed.reverse();
  return (
    <div className={className} data-toast-stack={action}>
      {newestFirst.map(({ entry, key }, index) => (
        <div key={key} data-toast>
          {renderToast !== undefined ? renderToast(entry, index) : defaultToast(entry)}
        </div>
      ))}
    </div>
  );
}
