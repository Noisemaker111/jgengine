import { useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@jgengine/core/game/chat";
import { useGameStore } from "./hooks";

export interface ChatBubble {
  id: string;
  fromUserId: string;
  body: string;
  at: number;
}

export interface ChatBubblesOptions {
  channelId?: string;
  ttlMs?: number;
  limit?: number;
}

const DEFAULT_CHAT_BUBBLE_CHANNEL = "proximity";
const DEFAULT_CHAT_BUBBLE_TTL_MS = 4000;
const DEFAULT_CHAT_BUBBLE_LIMIT = 8;
const CHAT_BUBBLE_TICK_MS = 500;
const EMPTY_CHAT_MESSAGES: readonly ChatMessage[] = [];

export function latestChatBubbles(
  messages: readonly ChatMessage[],
  nowMs: number,
  ttlMs: number,
): ChatBubble[] {
  const cutoff = nowMs - ttlMs;
  const latestByUser = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (message.at <= cutoff) continue;
    const current = latestByUser.get(message.fromUserId);
    if (current === undefined || message.at > current.at) {
      latestByUser.set(message.fromUserId, message);
    }
  }
  return [...latestByUser.values()]
    .sort((a, b) => a.at - b.at)
    .map((message) => ({
      id: message.id,
      fromUserId: message.fromUserId,
      body: message.body,
      at: message.at,
    }));
}

export function useChatBubbles(options?: ChatBubblesOptions): readonly ChatBubble[] {
  const channelId = options?.channelId ?? DEFAULT_CHAT_BUBBLE_CHANNEL;
  const ttlMs = options?.ttlMs ?? DEFAULT_CHAT_BUBBLE_TTL_MS;
  const limit = options?.limit ?? DEFAULT_CHAT_BUBBLE_LIMIT;
  const messages = useGameStore(
    (ctx) => ctx.game.chat?.history(channelId, { limit }) ?? EMPTY_CHAT_MESSAGES,
  );
  const [now, setNow] = useState(() => Date.now());
  const hasLiveMessage = messages.some((message) => message.at > now - ttlMs);

  useEffect(() => {
    if (!hasLiveMessage) return undefined;
    const id = setInterval(() => setNow(Date.now()), CHAT_BUBBLE_TICK_MS);
    return () => clearInterval(id);
  }, [hasLiveMessage]);

  return useMemo(() => latestChatBubbles(messages, now, ttlMs), [messages, now, ttlMs]);
}

export function useEntityChatBubble(
  instanceId: string,
  options?: ChatBubblesOptions,
): ChatBubble | null {
  const bubbles = useChatBubbles(options);
  return bubbles.find((bubble) => bubble.fromUserId === instanceId) ?? null;
}
