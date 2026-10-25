import { useEffect, useState } from "react";

import { cn } from "@/components/ui/cn";
import { Toast } from "@/components/ui/toast";
import { TWEET_NOTIFICATION_DURATION_MS, TWEET_NOTIFICATION_TICK_MS } from "@/economy/events";

interface TweetNotificationProps {
  message: string;
  avatarName?: string;
  onDismiss: () => void;
  durationMs?: number;
  className?: string;
}

export default function TweetNotification({
  message,
  avatarName = "News",
  onDismiss,
  durationMs = TWEET_NOTIFICATION_DURATION_MS,
  className,
}: TweetNotificationProps) {
  const [progress, setProgress] = useState(1);
  const [fakeStats] = useState(() => ({
    retweets: Math.floor(Math.random() * 200) + 10,
    likes: Math.floor(Math.random() * 1000) + 50,
  }));

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1 - elapsed / durationMs);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, TWEET_NOTIFICATION_TICK_MS);

    return () => clearInterval(interval);
  }, [durationMs, onDismiss]);

  return (
    <div className={cn("animate-in slide-in-from-left-4 fade-in duration-500 pointer-events-auto", className)}>
      <Toast
        variant="social"
        title={avatarName}
        onDismiss={onDismiss}
        progress={progress}
        avatar={(
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-brand-teal to-brand-teal-deep font-bold text-white">
            {avatarName.charAt(0)}
          </div>
        )}
        className="w-[min(340px,calc(100vw-1.5rem))]"
      >
        <p className="text-[15px] leading-normal text-slate-100">{message}</p>
        <div className="mt-3 flex items-center gap-6 text-slate-500">
          <div className="flex cursor-default items-center gap-1.5 transition-colors hover:text-[#1d9bf0]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs">{Math.floor(fakeStats.retweets / 2)}</span>
          </div>
          <div className="flex cursor-default items-center gap-1.5 transition-colors hover:text-brand-teal">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-xs">{fakeStats.retweets}</span>
          </div>
          <div className="flex cursor-default items-center gap-1.5 transition-colors hover:text-rose-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="text-xs">{fakeStats.likes}</span>
          </div>
        </div>
        <span className="mt-1 block text-[14px] text-slate-500">@llmville</span>
      </Toast>
    </div>
  );
}
