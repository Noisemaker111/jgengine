import { createPoseSyncGate, type PoseSyncTuning } from "@jgengine/core/multiplayer/poseSyncGate";
import type {
  GameBackend,
  GameRuntimeFeeds,
  GameRuntimeTransport,
  JoinServerResult,
  TransportRunCommandResult,
} from "@jgengine/core/runtime/transport";
import type { SessionAttributes } from "@jgengine/core/runtime/hostPersistence";
import type { MatchFilter, SessionListing } from "@jgengine/core/multiplayer/matchmaking";
import {
  decodeWsServerMessage,
  encodeWsMessage,
  subscriptionKey,
  type WsChannel,
  type WsClientMessage,
  type WsPose,
  type WsPresenceRow,
} from "./protocol";

export type WsBackendOptions = {
  url: string;
  userId: string;
  token?: string;
  webSocketFactory?: (url: string) => WebSocket;
  reconnectDelayMs?: number;
  poseTuning?: PoseSyncTuning;
  now?: () => number;
};

export type WsPresenceSync = {
  subscribe: (serverId: string, onChange: (rows: WsPresenceRow[]) => void) => () => void;
  syncPose: (serverId: string, pose: WsPose) => void;
};

export type WsBackend = GameBackend & {
  pushFeedEntry: (args: { serverId: string; action: string; entry: unknown }) => Promise<void>;
  browse: (args: { gameId: string; filter?: MatchFilter; limit?: number }) => Promise<SessionListing[]>;
  joinByCode: (args: { gameId: string; code: string }) => Promise<JoinServerResult | null>;
  createSession: (args: { gameId: string; attributes?: SessionAttributes }) => Promise<JoinServerResult>;
  presenceSync: WsPresenceSync;
  close: () => void;
};

const WS_READY_STATE_OPEN = 1;

const DEFAULT_POSE_TUNING: PoseSyncTuning = {
  minIntervalMs: 100,
  heartbeatMs: 5_000,
  positionEpsilon: 0.01,
  verticalEpsilon: 0.01,
  rotationEpsilon: 0.01,
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

type Subscription = {
  channel: WsChannel;
  serverId: string;
  action?: string;
  callbacks: Set<(data: unknown) => void>;
  last?: unknown;
  hasLast: boolean;
};

export function createWsBackend(options: WsBackendOptions): WsBackend {
  const now = options.now ?? Date.now;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
  const webSocketFactory = options.webSocketFactory ?? ((url: string) => new WebSocket(url));

  let socket: WebSocket | null = null;
  let ready: Promise<void> | null = null;
  let closed = false;
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();
  const subscriptions = new Map<string, Subscription>();

  const failPending = (reason: string) => {
    for (const request of pending.values()) {
      request.reject(new Error(reason));
    }
    pending.clear();
  };

  const rawSend = (message: WsClientMessage) => {
    if (socket === null || socket.readyState !== WS_READY_STATE_OPEN) return;
    socket.send(encodeWsMessage(message));
  };

  const handleMessage = (raw: unknown) => {
    const message = decodeWsServerMessage(typeof raw === "string" ? raw : String(raw));
    if (message === null) return;

    if (message.t === "reply") {
      const request = pending.get(message.id);
      if (request === undefined) return;
      pending.delete(message.id);
      if (message.ok) {
        request.resolve(message.result);
      } else {
        request.reject(new Error(message.reason));
      }
      return;
    }

    const key = subscriptionKey(
      message.channel,
      message.serverId,
      message.channel === "feed" ? message.action : undefined,
    );
    const subscription = subscriptions.get(key);
    if (subscription === undefined) return;
    const data = message.channel === "feed" ? { action: message.action, entries: message.data } : message.data;
    subscription.last = data;
    subscription.hasLast = true;
    for (const callback of subscription.callbacks) callback(data);
  };

  const connect = (): Promise<void> => {
    if (closed) return Promise.reject(new Error("Backend closed"));
    if (ready !== null) return ready;

    ready = new Promise<void>((resolve, reject) => {
      const nextSocket = webSocketFactory(options.url);
      socket = nextSocket;

      nextSocket.onopen = () => {
        const id = nextId++;
        pending.set(id, {
          resolve: () => {
            for (const subscription of subscriptions.values()) {
              rawSend({
                v: 1,
                t: "subscribe",
                id: nextId++,
                channel: subscription.channel,
                serverId: subscription.serverId,
                action: subscription.action,
              });
            }
            resolve();
          },
          reject,
        });
        nextSocket.send(
          encodeWsMessage({ v: 1, t: "hello", id, userId: options.userId, token: options.token }),
        );
      };

      nextSocket.onmessage = (event) => handleMessage(event.data);

      nextSocket.onclose = () => {
        failPending("Connection closed");
        socket = null;
        ready = null;
        reject(new Error("Connection closed"));
        if (!closed && subscriptions.size > 0) {
          setTimeout(() => {
            if (!closed) void connect().catch(() => undefined);
          }, reconnectDelayMs);
        }
      };
    });
    return ready;
  };

  const request = async (build: (id: number) => WsClientMessage): Promise<unknown> => {
    await connect();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      rawSend(build(id));
    });
  };

  const transport: GameRuntimeTransport = {
    async joinServer(args) {
      const result = await request((id) => ({
        v: 1,
        t: "join",
        id,
        gameId: args.gameId,
        serverId: args.serverId,
      }));
      return result as JoinServerResult;
    },
    async leaveServer(args) {
      await request((id) => ({ v: 1, t: "leave", id, serverId: args.serverId }));
    },
    async runCommand(args) {
      try {
        const result = await request((id) => ({
          v: 1,
          t: "runCommand",
          id,
          serverId: args.serverId,
          command: args.command,
          input: args.input,
        }));
        return result as TransportRunCommandResult;
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "Transport error" };
      }
    },
  };

  const addSubscription = (
    channel: WsChannel,
    serverId: string,
    action: string | undefined,
    callback: (data: unknown) => void,
  ): (() => void) => {
    const key = subscriptionKey(channel, serverId, action);
    let subscription = subscriptions.get(key);
    if (subscription === undefined) {
      subscription = { channel, serverId, action, callbacks: new Set(), hasLast: false };
      subscriptions.set(key, subscription);
      void request((id) => ({ v: 1, t: "subscribe", id, channel, serverId, action })).catch(
        () => undefined,
      );
    } else if (subscription.hasLast) {
      callback(subscription.last);
    }
    subscription.callbacks.add(callback);

    return () => {
      const current = subscriptions.get(key);
      if (current === undefined) return;
      current.callbacks.delete(callback);
      if (current.callbacks.size === 0) {
        subscriptions.delete(key);
        void request((id) => ({ v: 1, t: "unsubscribe", id, channel, serverId, action })).catch(
          () => undefined,
        );
      }
    };
  };

  const feeds: GameRuntimeFeeds = {
    subscribeServer(serverId, onChange) {
      return addSubscription("server", serverId, undefined, (data) =>
        onChange(data as Parameters<typeof onChange>[0]),
      );
    },
    subscribePlayer(args, onChange) {
      return addSubscription("player", args.serverId, undefined, (data) =>
        onChange(data as Parameters<typeof onChange>[0]),
      );
    },
    subscribeFeed(args, onChange) {
      return addSubscription("feed", args.serverId, args.action, (data) =>
        onChange(data as Parameters<typeof onChange>[0]),
      );
    },
  };

  const poseGates = new Map<string, ReturnType<typeof createPoseSyncGate>>();

  const presenceSync: WsPresenceSync = {
    subscribe(serverId, onChange) {
      return addSubscription("presence", serverId, undefined, (data) =>
        onChange(data as WsPresenceRow[]),
      );
    },
    syncPose(serverId, pose) {
      let gate = poseGates.get(serverId);
      if (gate === undefined) {
        gate = createPoseSyncGate(options.poseTuning ?? DEFAULT_POSE_TUNING);
        poseGates.set(serverId, gate);
      }
      if (!gate.evaluate(pose, now())) return;
      void connect()
        .then(() => rawSend({ v: 1, t: "pose", serverId, pose }))
        .catch(() => undefined);
    },
  };

  return {
    transport,
    feeds,
    presenceSync,
    async pushFeedEntry(args) {
      await request((id) => ({
        v: 1,
        t: "pushFeed",
        id,
        serverId: args.serverId,
        action: args.action,
        entry: args.entry,
      }));
    },
    async browse(args) {
      const result = await request((id) => ({
        v: 1,
        t: "browse",
        id,
        gameId: args.gameId,
        filter: args.filter,
        limit: args.limit,
      }));
      return result as SessionListing[];
    },
    async joinByCode(args) {
      const result = await request((id) => ({
        v: 1,
        t: "joinByCode",
        id,
        gameId: args.gameId,
        code: args.code,
      }));
      return result as JoinServerResult | null;
    },
    async createSession(args) {
      const result = await request((id) => ({
        v: 1,
        t: "join",
        id,
        gameId: args.gameId,
        attributes: args.attributes,
      }));
      return result as JoinServerResult;
    },
    close: () => {
      closed = true;
      failPending("Backend closed");
      socket?.close();
      socket = null;
      ready = null;
    },
  };
}
