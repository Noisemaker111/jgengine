import type { GameEventMap, GameEvents } from "./events";
import type { ChatFilter } from "./chatFilter";
import type { EmotesDeps } from "./social";

export type ChatChannelKind = "global" | "party" | "proximity";

export interface ChatRateLimit {
  count: number;
  perMs: number;
}

export interface ChatChannelDef {
  id: string;
  kind: ChatChannelKind;
  radius?: number;
  historyLimit?: number;
  rateLimit?: ChatRateLimit;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  fromUserId: string;
  body: string;
  at: number;
}

export type ChatRecipients = readonly string[] | "all";

export type ChatSendResult =
  | { message: ChatMessage; recipients: ChatRecipients }
  | { reason: string };

export interface ChatSnapshot {
  messages: Record<string, ChatMessage[]>;
  counter: number;
}

export interface Chat {
  register(def: ChatChannelDef): void;
  channels(): ChatChannelDef[];
  send(fromUserId: string, channelId: string, body: string): ChatSendResult;
  whisper(fromUserId: string, toUserId: string, body: string): ChatSendResult;
  history(channelId: string, options?: { limit?: number; viewerUserId?: string }): ChatMessage[];
  snapshot(): ChatSnapshot;
  hydrate(data: ChatSnapshot): void;
}

export interface ChatDeps {
  events: GameEvents;
  now?: () => number;
  party?: { membersOf(userId: string): string[] };
  proximity?: EmotesDeps;
  blockedBy?: (userId: string) => readonly string[];
  maxBodyLength?: number;
  defaultRateLimit?: ChatRateLimit;
  filter?: ChatFilter;
}

export const DEFAULT_CHAT_RATE_LIMIT: ChatRateLimit = { count: 10, perMs: 10_000 };
export const DEFAULT_CHAT_HISTORY_LIMIT = 100;
export const DEFAULT_CHAT_BODY_LENGTH = 500;
export const DEFAULT_PROXIMITY_CHAT_RADIUS = 20;
export const WHISPER_CHANNEL_PREFIX = "whisper:";

export function whisperChannelId(a: string, b: string): string {
  const [first, second] = a < b ? [a, b] : [b, a];
  return `${WHISPER_CHANNEL_PREFIX}${first}:${second}`;
}

export interface ChatRateLimiter {
  allow(key: string, atMs: number): boolean;
}

export function createChatRateLimiter(limit: ChatRateLimit): ChatRateLimiter {
  const windows = new Map<string, number[]>();
  return {
    allow(key, atMs) {
      const cutoff = atMs - limit.perMs;
      const stamps = (windows.get(key) ?? []).filter((stamp) => stamp > cutoff);
      if (stamps.length >= limit.count) {
        windows.set(key, stamps);
        return false;
      }
      stamps.push(atMs);
      windows.set(key, stamps);
      return true;
    },
  };
}

const BUILTIN_CHANNELS: ChatChannelDef[] = [
  { id: "global", kind: "global" },
  { id: "party", kind: "party" },
  { id: "proximity", kind: "proximity", radius: DEFAULT_PROXIMITY_CHAT_RADIUS },
];

export function createChat(deps: ChatDeps): Chat {
  const now = deps.now ?? Date.now;
  const events = deps.events;
  const maxBodyLength = deps.maxBodyLength ?? DEFAULT_CHAT_BODY_LENGTH;
  const defaultRateLimit = deps.defaultRateLimit ?? DEFAULT_CHAT_RATE_LIMIT;
  const blockedBy = deps.blockedBy ?? (() => []);
  const filter = deps.filter;

  const channelDefs = new Map<string, ChatChannelDef>();
  for (const def of BUILTIN_CHANNELS) channelDefs.set(def.id, { ...def });

  const messagesByChannel = new Map<string, ChatMessage[]>();
  const limiters = new Map<string, ChatRateLimiter>();
  let counter = 0;

  function limiterFor(channelId: string, rateLimit: ChatRateLimit): ChatRateLimiter {
    let limiter = limiters.get(channelId);
    if (limiter === undefined) {
      limiter = createChatRateLimiter(rateLimit);
      limiters.set(channelId, limiter);
    }
    return limiter;
  }

  function hasBlocked(userId: string, targetUserId: string): boolean {
    return blockedBy(userId).includes(targetUserId);
  }

  function resolveRecipients(
    fromUserId: string,
    channelId: string,
    def: ChatChannelDef | null,
  ): { recipients: ChatRecipients } | { reason: string } {
    if (channelId.startsWith(WHISPER_CHANNEL_PREFIX)) {
      const pair = channelId.slice(WHISPER_CHANNEL_PREFIX.length).split(":");
      const toUserId = pair.find((userId) => userId !== fromUserId);
      if (pair.length !== 2 || toUserId === undefined || !pair.includes(fromUserId)) {
        return { reason: "not a participant of this whisper" };
      }
      if (hasBlocked(toUserId, fromUserId) || hasBlocked(fromUserId, toUserId)) {
        return { reason: "blocked" };
      }
      return { recipients: [toUserId] };
    }
    if (def === null) return { reason: `unknown channel "${channelId}"` };
    if (def.kind === "global") return { recipients: "all" };
    if (def.kind === "party") {
      const members = deps.party?.membersOf(fromUserId) ?? [];
      if (!members.includes(fromUserId)) return { reason: "not in a party" };
      return {
        recipients: members.filter(
          (userId) => userId !== fromUserId && !hasBlocked(userId, fromUserId),
        ),
      };
    }
    const proximity = deps.proximity;
    if (proximity === undefined) return { reason: "proximity chat not configured" };
    const origin = proximity.entities.get(fromUserId);
    if (origin === null) return { reason: `entity "${fromUserId}" is not spawned` };
    const nearby = proximity.spatial.inRadius(
      origin.position,
      def.radius ?? DEFAULT_PROXIMITY_CHAT_RADIUS,
      (id) => id !== fromUserId && proximity.entities.get(id)?.role === "player",
    );
    return { recipients: nearby.filter((userId) => !hasBlocked(userId, fromUserId)) };
  }

  function append(channelId: string, message: ChatMessage, historyLimit: number): void {
    const ring = messagesByChannel.get(channelId) ?? [];
    ring.push(message);
    if (ring.length > historyLimit) ring.splice(0, ring.length - historyLimit);
    messagesByChannel.set(channelId, ring);
  }

  function sendResolved(
    fromUserId: string,
    channelId: string,
    body: string,
    def: ChatChannelDef | null,
  ): ChatSendResult {
    const trimmed = body.trim();
    if (trimmed.length === 0) return { reason: "empty message" };
    if (trimmed.length > maxBodyLength) return { reason: "message too long" };

    let filteredBody = trimmed;
    if (filter !== undefined) {
      const filtered = filter.apply(trimmed);
      if (!filtered.ok) return { reason: "filtered" };
      filteredBody = filtered.body;
    }

    const resolved = resolveRecipients(fromUserId, channelId, def);
    if ("reason" in resolved) return resolved;

    const at = now();
    const rateLimit = def?.rateLimit ?? defaultRateLimit;
    if (!limiterFor(channelId, rateLimit).allow(`${fromUserId}|${channelId}`, at)) {
      return { reason: "rate limited" };
    }

    counter += 1;
    const message: ChatMessage = {
      id: `msg_${counter}`,
      channelId,
      fromUserId,
      body: filteredBody,
      at,
    };
    append(channelId, message, def?.historyLimit ?? DEFAULT_CHAT_HISTORY_LIMIT);

    const event: GameEventMap["chat.message"] = { ...message };
    if (resolved.recipients !== "all") event.recipients = resolved.recipients;
    events.emit("chat.message", event);
    return { message, recipients: resolved.recipients };
  }

  return {
    register(def) {
      channelDefs.set(def.id, { ...def });
      limiters.delete(def.id);
    },
    channels() {
      return Array.from(channelDefs.values(), (def) => ({ ...def }));
    },
    send(fromUserId, channelId, body) {
      const def = channelDefs.get(channelId) ?? null;
      return sendResolved(fromUserId, channelId, body, def);
    },
    whisper(fromUserId, toUserId, body) {
      if (fromUserId === toUserId) return { reason: "cannot whisper yourself" };
      const channelId = whisperChannelId(fromUserId, toUserId);
      return sendResolved(fromUserId, channelId, body, channelDefs.get(channelId) ?? null);
    },
    history(channelId, options) {
      const ring = messagesByChannel.get(channelId) ?? [];
      const viewerUserId = options?.viewerUserId;
      const visible =
        viewerUserId === undefined
          ? ring
          : ring.filter((message) => !hasBlocked(viewerUserId, message.fromUserId));
      const limit = options?.limit;
      return limit === undefined ? visible.slice() : visible.slice(-limit);
    },
    snapshot() {
      const messages: Record<string, ChatMessage[]> = {};
      for (const [channelId, ring] of messagesByChannel) {
        messages[channelId] = ring.map((message) => ({ ...message }));
      }
      return { messages, counter };
    },
    hydrate(data) {
      messagesByChannel.clear();
      for (const [channelId, ring] of Object.entries(data.messages)) {
        messagesByChannel.set(channelId, ring.map((message) => ({ ...message })));
      }
      counter = data.counter;
    },
  };
}
