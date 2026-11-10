/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef } from "@jgengine/core/ui/jsx";

import type { NotificationEntry } from "@jgengine/core/notifications/notificationCenter";
import { seededRng } from "@jgengine/core/random/rng";
import { KitToast } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { TWEET_NOTIFICATION_DURATION_MS } from "@/economy/events";
import { cn } from "@/kit/cn";

interface TweetNotificationProps {
  tweet: NotificationEntry;
  onDismiss: (id: string) => void;
  durationMs?: number;
  /** Draws the reply and like counts. Default a stream seeded by the tweet's id, so a tweet keeps its counts. */
  rng?: () => number;
  className?: string;
}

/** A news tweet: the toast leaves on its own after `durationMs`, or when dismissed. */
export default function TweetNotification({
  tweet,
  onDismiss,
  durationMs = TWEET_NOTIFICATION_DURATION_MS,
  rng,
  className,
}: TweetNotificationProps) {
  const avatarName = tweet.title;
  const stats = useMemo(() => {
    const random = rng ?? seededRng(tweet.id);
    return { retweets: Math.floor(random() * 200) + 10, likes: Math.floor(random() * 1000) + 50 };
  }, [rng, tweet.id]);

  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const timeout = setTimeout(() => dismissRef.current(tweet.id), durationMs);
    return () => clearTimeout(timeout);
  }, [durationMs, tweet.id]);

  return (
    <KitToast
      tone="good"
      className={cn("llm-toast--social pointer-events-auto w-[min(340px,calc(100vw-1.5rem))]", className)}
      title={avatarName}
      icon={(
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-brand-teal to-[#3c8c76] font-bold text-white">
          {avatarName.charAt(0)}
        </div>
      )}
    >
      <span className="llm-toast__progress" aria-hidden>
        <span style={{ animation: `llm-drain ${durationMs}ms linear forwards` }} />
      </span>
      <button type="button" onClick={() => onDismiss(tweet.id)} className="llm-toast__dismiss absolute right-3 top-3" aria-label="Dismiss">
        ✕
      </button>
      <p className="text-[15px] leading-normal text-slate-100">{tweet.body}</p>
      <div className="mt-3 flex items-center gap-6 text-slate-500">
        <div className="flex cursor-default items-center gap-1.5 transition-colors hover:text-[#1d9bf0]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-xs">{Math.floor(stats.retweets / 2)}</span>
        </div>
        <div className="flex cursor-default items-center gap-1.5 transition-colors hover:text-brand-teal">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-xs">{stats.retweets}</span>
        </div>
        <div className="flex cursor-default items-center gap-1.5 transition-colors hover:text-rose-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="text-xs">{stats.likes}</span>
        </div>
      </div>
      <span className="mt-1 block text-[14px] text-slate-500">@llmville</span>
    </KitToast>
  );
}
