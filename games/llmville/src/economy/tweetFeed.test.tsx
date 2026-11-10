import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";

import { createNotificationCenter } from "@jgengine/core/notifications/notificationCenter";
import TweetNotification from "@/economy/components/TweetNotification";
import { logTweet } from "@/economy/tweetFeed";

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
    const center = createNotificationCenter();
    const entry = center.push({ id: "event-2", kind: "tweet", title: "News", body: "A new model ships" });
    const render = (rng?: () => number) => renderToStaticMarkup(<TweetNotification tweet={entry} onDismiss={() => undefined} {...(rng === undefined ? {} : { rng })} />);
    expect(render()).toBe(render());
    const fixed = render(() => 0.5);
    expect(fixed).toContain(">110<");
    expect(fixed).toContain(">550<");
    expect(fixed).toContain("A new model ships");
  });
});
