import { useCallback, useEffect, useMemo } from "@jgengine/core/ui/jsx";

import { createNotificationCenter, type NotificationEntry, type NotificationStore } from "@jgengine/core/notifications/notificationCenter";
import { useNotifications } from "@jgengine/core/notifications/notificationCenter.view";
import type { TweetNotification } from "@/runtime/gameEngine";

/** How many past tweets the feed keeps. */
const TWEET_LOG_CAP = 20;

/** Logs a world tweet once by its event id; a tweet already seen (read or not) is never revived. */
export function logTweet(center: NotificationStore, tweet: TweetNotification): void {
  if (center.list().some((entry) => entry.id === tweet.eventId)) return;
  center.push({ id: tweet.eventId, kind: "tweet", title: tweet.avatarName, body: tweet.message });
}

/** The newest unread tweet, from the engine notification center the world's tweets are logged into. */
export function useTweetFeed(tweet: TweetNotification | null, onResolve: () => void): {
  current: NotificationEntry | null;
  dismiss: (id: string) => void;
} {
  const center = useMemo(() => createNotificationCenter({ cap: TWEET_LOG_CAP }), []);
  useEffect(() => {
    if (tweet !== null) logTweet(center, tweet);
  }, [center, tweet]);
  const entries = useNotifications(center);
  const current = entries.find((entry) => !entry.read) ?? null;
  const dismiss = useCallback(
    (id: string) => {
      center.markRead(id);
      onResolve();
    },
    [center, onResolve],
  );
  return { current, dismiss };
}
