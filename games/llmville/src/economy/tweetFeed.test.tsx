/** @jsxImportSource @jgengine/core/ui/jsx */
import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";

import { createNotificationCenter } from "@jgengine/core/notifications/notificationCenter";
import { tweetStats } from "./components/TweetNotification";
import { logTweet } from "./tweetFeed";

describe("tweet feed", () => {
  test("logs a world tweet once and never revives one already read", () => {
    const center = createNotificationCenter();
    const tweet = { eventId: "event-1", avatarName: "News", message: "GPU prices fall" };
    logTweet(center, tweet);
    logTweet(center, { ...tweet });
    expect(center.list()).toHaveLength(1);
    center.markRead("event-1");
    logTweet(center, tweet);
    expect(center.unreadCount()).toBe(0);
  });

  test("a tweet keeps its reply and like counts, drawn from the injected rng", () => {
    expect(tweetStats(seededRng("event-2"))).toEqual(tweetStats(seededRng("event-2")));
    expect(tweetStats(() => 0.5)).toEqual({ replies: 55, reposts: 110, likes: 550 });
  });
});
