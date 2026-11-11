/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef } from "@jgengine/core/ui/jsx";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import type { NotificationEntry } from "@jgengine/core/notifications/notificationCenter";
import { seededRng } from "@jgengine/core/random/rng";

import { Button, C, FULL, Icon, Muted, Panel, Row, Text } from "../../ui/kit";
import type { IconName } from "../../ui/icons";
import { TWEET_NOTIFICATION_DURATION_MS } from "../events";

interface TweetNotificationProps {
  tweet: NotificationEntry;
  onDismiss: (id: string) => void;
  durationMs?: number;
  /** Draws the reply and like counts. Default a stream seeded by the tweet's id, so a tweet keeps its counts. */
  rng?: () => number;
  /** The clock the drain bar reads. */
  now?: () => number;
}

/** A tweet's reply, repost and like counts, drawn once from `random`. */
export function tweetStats(random: () => number): { replies: number; reposts: number; likes: number } {
  const reposts = Math.floor(random() * 200) + 10;
  const likes = Math.floor(random() * 1000) + 50;
  return { replies: Math.floor(reposts / 2), reposts, likes };
}

function Count({ icon, value }: { icon: IconName; value: number }) {
  return <Row gap={6}><Icon name={icon} size={14} color="#64748b" strokeWidth={1.5} /><Text size={12} color="#64748b">{String(value)}</Text></Row>;
}

/** A news tweet: the toast leaves on its own after `durationMs`, or when dismissed. */
export default function TweetNotification({ tweet, onDismiss, durationMs = TWEET_NOTIFICATION_DURATION_MS, rng, now = Date.now }: TweetNotificationProps) {
  const stats = useMemo(() => tweetStats(rng ?? seededRng(tweet.id)), [rng, tweet.id]);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const shownAt = useMemo(() => now(), [now, tweet.id]);
  useEffect(() => {
    const timeout = setTimeout(() => dismissRef.current(tweet.id), durationMs);
    return () => clearTimeout(timeout);
  }, [durationMs, tweet.id]);
  return <Panel shell="toast" width={340} responsive={{ phone: { width: 320 } }} gap={8} label={`Tweet from ${tweet.title}`}>
    <Row justify="between" items="start" width={FULL}>
      <Row gap={10}>
        <RuneView width={44} height={44} radius={22} justify="center" items="center" gradient={{ angle: 2.4, stops: [[0, C.teal], [1, C.tealDeep]] }}>
          <Text size={18} weight={800} color="#ffffff">{tweet.title.charAt(0)}</Text>
        </RuneView>
        <RuneView gap={0}><Text size={15} weight={800}>{tweet.title}</Text><Muted size={13} color="#64748b">@llmville</Muted></RuneView>
      </Row>
      <Button tone="ghost" label="Dismiss" padding={6} minHeight={0} onPress={() => onDismiss(tweet.id)}><Icon name="close" size={12} /></Button>
    </Row>
    <Text size={15} color="#f1f5f9">{tweet.body}</Text>
    <Row gap={24}><Count icon="reply" value={stats.replies} /><Count icon="repost" value={stats.reposts} /><Count icon="heart" value={stats.likes} /></Row>
    <RuneView height={3} radius={2} fill={C.line} width={FULL}>
      <RuneView height={3} radius={2} fill={C.teal} width={bind(() => ({ fraction: Math.max(0, 1 - (now() - shownAt) / durationMs) }))} />
    </RuneView>
  </Panel>;
}
