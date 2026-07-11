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
import type { ChatSendOutcome, ChatSync } from "@jgengine/core/multiplayer/chatContract";
import type { VoiceTransport } from "@jgengine/core/multiplayer/voiceContract";
import {
  decodeWsServerMessage,
  encodeWsMessage,
  inspectWsDecodeFailure,
  subscriptionKey,
  type WsChannel,
  type WsChatMessage,
  type WsClientMessage,
  type WsPose,
  type WsPresenceRow,
  type WsVoiceParticipant,
} from "./protocol";
import { webSocketPipe, type TransportPipe, type TransportPipeFactory } from "./pipe";

export type WsBackendOptions = {
  url?: string;
  pipe?: TransportPipeFactory;
  userId: string;
  token?: string;
  webSocketFactory?: (url: string) => WebSocket;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  rpcTimeoutMs?: number;
  poseTuning?: PoseSyncTuning;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

export type WsPresenceSync = {
  subscribe: (serverId: string, onChange: (rows: WsPresenceRow[]) => void) => () => void;
  /** `pose.appearance`, when provided, is forwarded to the host as-is and surfaces on every subscriber's presence row for that user. */
  syncPose: (serverId: string, pose: WsPose) => void;
};

export type WsChatSync = {
  subscribe: (
    serverId: string,
    channelId: string,
    onChange: (messages: WsChatMessage[]) => void,
  ) => () => void;
  send: (serverId: string, channelId: string, body: string) => Promise<ChatSendOutcome>;
};

export type WsVoiceSync = {
  subscribe: (
    serverId: string,
    channelId: string,
    onChange: (participants: WsVoiceParticipant[]) => void,
  ) => () => void;
  join: (serverId: string, channelId: string, streamId?: string) => Promise<void>;
  leave: (serverId: string, channelId: string) => Promise<void>;
  publish: (serverId: string, channelId: string, streamId: string) => Promise<void>;
};

export type WsBackend = GameBackend & {
  pushFeedEntry: (args: { serverId: string; action: string; entry: unknown }) => Promise<void>;
  browse: (args: { gameId: string; filter?: MatchFilter; limit?: number }) => Promise<SessionListing[]>;
  joinByCode: (args: { gameId: string; code: string }) => Promise<JoinServerResult | null>;
  createSession: (args: { gameId: string; attributes?: SessionAttributes }) => Promise<JoinServerResult>;
  presenceSync: WsPresenceSync;
  chatSync: WsChatSync;
  chatSyncFor: (serverId: string) => ChatSync;
  voiceSync: WsVoiceSync;
  voiceTransportFor: (serverId: string) => VoiceTransport;
  close: () => void;
};

const DEFAULT_POSE_TUNING: PoseSyncTuning = {
  minIntervalMs: 100,
  heartbeatMs: 5_000,
  positionEpsilon: 0.01,
  verticalEpsilon: 0.01,
  rotationEpsilon: 0.01,
};

const DEFAULT_RPC_TIMEOUT_MS = 15_000;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;

type PendingRequest = {
  id: number;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  build: (id: number) => WsClientMessage;
  timer: ReturnType<typeof setTimeout> | null;
  kind: "rpc" | "hello";
  sent: boolean;
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
  const baseReconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
  const rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  const schedule = options.setTimeoutFn ?? setTimeout;
  const cancel = options.clearTimeoutFn ?? clearTimeout;
  const pipeFactory: TransportPipeFactory =
    options.pipe ??
    (() => {
      const url = options.url;
      if (url === undefined) throw new Error("WsBackendOptions requires url or pipe");
      return webSocketPipe(url, options.webSocketFactory);
    })();

  let pipe: TransportPipe | null = null;
  let open = false;
  let ready: Promise<void> | null = null;
  let closed = false;
  let wantConnection = false;
  let nextId = 1;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<number, PendingRequest>();
  const subscriptions = new Map<string, Subscription>();

  const clearRequestTimer = (request: PendingRequest) => {
    if (request.timer !== null) {
      cancel(request.timer);
      request.timer = null;
    }
  };

  const failPending = (reason: string) => {
    for (const request of pending.values()) {
      clearRequestTimer(request);
      request.reject(new Error(reason));
    }
    pending.clear();
  };

  const armRpcTimeout = (request: PendingRequest) => {
    if (rpcTimeoutMs <= 0 || request.kind === "hello") return;
    request.timer = schedule(() => {
      const current = pending.get(request.id);
      if (current !== request) return;
      pending.delete(request.id);
      request.timer = null;
      request.reject(new Error("RPC timeout"));
    }, rpcTimeoutMs);
  };

  const rawSend = (message: WsClientMessage) => {
    if (pipe === null || !open) return;
    pipe.send(encodeWsMessage(message));
  };

  const resendPendingRpcs = () => {
    const entries = [...pending.entries()];
    pending.clear();
    for (const [, request] of entries) {
      if (request.kind === "hello") {
        clearRequestTimer(request);
        request.reject(new Error("Connection reset"));
        continue;
      }
      request.id = nextId++;
      request.sent = true;
      pending.set(request.id, request);
      rawSend(request.build(request.id));
    }
  };

  const resubscribeAll = () => {
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
  };

  const handleMessage = (raw: string) => {
    const message = decodeWsServerMessage(raw);
    if (message === null) {
      const failure = inspectWsDecodeFailure(raw);
      if (failure.id !== undefined) {
        const request = pending.get(failure.id);
        if (request !== undefined) {
          pending.delete(failure.id);
          clearRequestTimer(request);
          request.reject(new Error(failure.reason));
        }
      }
      return;
    }

    if (message.t === "reply") {
      const request = pending.get(message.id);
      if (request === undefined) return;
      pending.delete(message.id);
      clearRequestTimer(request);
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
      message.channel === "feed" || message.channel === "chat" || message.channel === "voice"
        ? message.action
        : undefined,
    );
    const subscription = subscriptions.get(key);
    if (subscription === undefined) return;
    const data = message.channel === "feed" ? { action: message.action, entries: message.data } : message.data;
    subscription.last = data;
    subscription.hasLast = true;
    for (const callback of subscription.callbacks) callback(data);
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      cancel(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed || !wantConnection || reconnectTimer !== null) return;
    const delay = Math.min(
      maxReconnectDelayMs,
      baseReconnectDelayMs * 2 ** reconnectAttempt,
    );
    reconnectAttempt += 1;
    reconnectTimer = schedule(() => {
      reconnectTimer = null;
      if (closed || !wantConnection) return;
      void connect().catch(() => undefined);
    }, delay);
  };

  const connect = (): Promise<void> => {
    if (closed) return Promise.reject(new Error("Backend closed"));
    wantConnection = true;
    if (ready !== null) return ready;

    clearReconnectTimer();
    ready = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      pipe = pipeFactory({
        onOpen: () => {
          open = true;
          const id = nextId++;
          const helloBuild = (requestId: number): WsClientMessage => ({
            v: 1,
            t: "hello",
            id: requestId,
            userId: options.userId,
            token: options.token,
          });
          pending.set(id, {
            id,
            resolve: () => {
              reconnectAttempt = 0;
              resubscribeAll();
              resendPendingRpcs();
              settleResolve();
            },
            reject: (error) => {
              settleReject(error);
            },
            build: helloBuild,
            timer: null,
            kind: "hello",
            sent: true,
          });
          rawSend(helloBuild(id));
        },
        onMessage: handleMessage,
        onClose: () => {
          open = false;
          pipe = null;
          ready = null;
          for (const [id, request] of [...pending.entries()]) {
            if (request.kind === "hello") {
              pending.delete(id);
              clearRequestTimer(request);
              request.reject(new Error("Connection closed"));
            } else {
              request.sent = false;
            }
          }
          settleReject(new Error("Connection closed"));
          if (!closed && wantConnection) {
            scheduleReconnect();
          }
        },
      });
    });
    return ready;
  };

  const request = (build: (id: number) => WsClientMessage): Promise<unknown> => {
    if (closed) return Promise.reject(new Error("Backend closed"));
    wantConnection = true;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const entry: PendingRequest = {
        id,
        resolve,
        reject,
        build,
        timer: null,
        kind: "rpc",
        sent: false,
      };
      pending.set(id, entry);
      armRpcTimeout(entry);
      void connect()
        .then(() => {
          if (pending.get(entry.id) !== entry || entry.sent || !open) return;
          entry.sent = true;
          rawSend(build(entry.id));
        })
        .catch(() => {
          if (closed && pending.get(entry.id) === entry) {
            pending.delete(entry.id);
            clearRequestTimer(entry);
            reject(new Error("Backend closed"));
          }
        });
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
      poseGates.delete(args.serverId);
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

  const chatSync: WsChatSync = {
    subscribe(serverId, channelId, onChange) {
      return addSubscription("chat", serverId, channelId, (data) =>
        onChange(data as WsChatMessage[]),
      );
    },
    async send(serverId, channelId, body) {
      try {
        await request((id) => ({ v: 1, t: "chatSend", id, serverId, channelId, body }));
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "Transport error" };
      }
    },
  };

  const voiceSync: WsVoiceSync = {
    subscribe(serverId, channelId, onChange) {
      return addSubscription("voice", serverId, channelId, (data) =>
        onChange(data as WsVoiceParticipant[]),
      );
    },
    async join(serverId, channelId, streamId) {
      await request((id) => ({ v: 1, t: "voiceJoin", id, serverId, channelId, streamId }));
    },
    async leave(serverId, channelId) {
      await request((id) => ({ v: 1, t: "voiceLeave", id, serverId, channelId }));
    },
    async publish(serverId, channelId, streamId) {
      await request((id) => ({ v: 1, t: "voicePublish", id, serverId, channelId, streamId }));
    },
  };

  return {
    transport,
    feeds,
    presenceSync,
    chatSync,
    chatSyncFor: (serverId) => ({
      subscribe: (channelId, onChange) => chatSync.subscribe(serverId, channelId, onChange),
      send: (channelId, body) => chatSync.send(serverId, channelId, body),
    }),
    voiceSync,
    voiceTransportFor: (serverId) => ({
      join: (channelId, streamId) => voiceSync.join(serverId, channelId, streamId),
      leave: (channelId) => voiceSync.leave(serverId, channelId),
      publish: (channelId, streamId) => voiceSync.publish(serverId, channelId, streamId),
      subscribers: (channelId, onChange) => voiceSync.subscribe(serverId, channelId, onChange),
    }),
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
      wantConnection = false;
      clearReconnectTimer();
      failPending("Backend closed");
      pipe?.close();
      pipe = null;
      open = false;
      ready = null;
    },
  };
}
