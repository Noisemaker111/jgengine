import type { ChatMessage } from "./chat";

export interface ChatSendArgs {
  channelId: string;
  body: string;
}

export interface ChatSendOutcome {
  ok: boolean;
  reason?: string;
}

/**
 * The seam for remote text chat, with no UI hooks so any runtime can hold it: subscribe delivers the
 * channel's recent history now and on every change; send resolves with the host's verdict.
 */
export interface ChatSync {
  subscribe(channelId: string, onChange: (messages: readonly ChatMessage[]) => void): () => void;
  send(channelId: string, body: string): Promise<ChatSendOutcome>;
}

/** Chat kept in this process: one ChatSync with a bounded history per channel, for offline play and tests. */
export function createLocalChatSync(options?: {
  userId?: string;
  historyLimit?: number;
  now?: () => number;
}): ChatSync {
  const userId = options?.userId ?? "local";
  const historyLimit = options?.historyLimit ?? 100;
  const now = options?.now ?? Date.now;

  const messagesByChannel = new Map<string, ChatMessage[]>();
  const listeners = new Map<string, Set<(messages: readonly ChatMessage[]) => void>>();
  let counter = 0;

  function snapshot(channelId: string): readonly ChatMessage[] {
    return (messagesByChannel.get(channelId) ?? []).slice();
  }

  const sync: ChatSync = {
    subscribe(channelId, onChange) {
      let set = listeners.get(channelId);
      if (set === undefined) {
        set = new Set();
        listeners.set(channelId, set);
      }
      set.add(onChange);
      onChange(snapshot(channelId));
      return () => {
        set.delete(onChange);
        if (set.size === 0) listeners.delete(channelId);
      };
    },
    send(channelId, body) {
      const trimmed = body.trim();
      if (trimmed.length === 0) return Promise.resolve({ ok: false, reason: "empty message" });
      counter += 1;
      const message: ChatMessage = {
        id: `local_${counter}`,
        channelId,
        fromUserId: userId,
        body: trimmed,
        at: now(),
      };
      const ring = messagesByChannel.get(channelId) ?? [];
      ring.push(message);
      if (ring.length > historyLimit) ring.splice(0, ring.length - historyLimit);
      messagesByChannel.set(channelId, ring);
      const current = snapshot(channelId);
      for (const listener of listeners.get(channelId) ?? []) listener(current);
      return Promise.resolve({ ok: true });
    },
  };

  return sync;
}
