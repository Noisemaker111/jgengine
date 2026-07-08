import type { ChatMessage } from "../game/chat";

export interface ChatSendArgs {
  channelId: string;
  body: string;
}

export interface ChatSendOutcome {
  ok: boolean;
  reason?: string;
}

export interface ChatActions {
  sendMessage(args: ChatSendArgs): Promise<ChatSendOutcome>;
}

/**
 * Backend seam for remote text chat, mirroring PresenceTransport: the use*
 * members are called as React hooks by consumers, so a mounted transport must
 * never change identity — remount the subtree to switch backends. useMessages
 * returns undefined while the subscription is loading and the channel's recent
 * history once live.
 */
export interface ChatTransport {
  useMessages(channelId: string | "skip"): readonly ChatMessage[] | undefined;
  useActions(): ChatActions;
}

/**
 * Callback seam for backends that cannot host React hooks (e.g. the ws
 * client): subscribe delivers the channel's recent history on every change;
 * send resolves with the host's verdict. @jgengine/react's chatTransportFromSync
 * lifts a ChatSync into a ChatTransport.
 */
export interface ChatSync {
  subscribe(channelId: string, onChange: (messages: readonly ChatMessage[]) => void): () => void;
  send(channelId: string, body: string): Promise<ChatSendOutcome>;
}

export function createLocalChatTransport(options?: {
  userId?: string;
  historyLimit?: number;
  now?: () => number;
}): {
  transport: ChatTransport;
  sync: ChatSync;
  actions: ChatActions;
} {
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

  const actions: ChatActions = {
    sendMessage: (args) => sync.send(args.channelId, args.body),
  };

  const transport: ChatTransport = {
    useMessages: (channelId) => (channelId === "skip" ? undefined : snapshot(channelId)),
    useActions: () => actions,
  };

  return { transport, sync, actions };
}
