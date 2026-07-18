import type { PoseSyncRules, PresencePoseState } from "@jgengine/core/multiplayer/presenceModel";
import {
  DEFAULT_POSE_SYNC_RULES,
  decidePoseSync,
  spawnPresenceState,
} from "@jgengine/core/multiplayer/presenceModel";
import { createPositionHistory, type PositionHistory } from "@jgengine/core/multiplayer/lagCompensation";
import {
  createChatRateLimiter,
  DEFAULT_CHAT_BODY_LENGTH,
  DEFAULT_CHAT_HISTORY_LIMIT,
  DEFAULT_CHAT_RATE_LIMIT,
  type ChatRateLimit,
} from "@jgengine/core/game/chat";

import {
  createCommandMiddleware,
  type CommandAuthorize,
  type CommandCatalog,
  type CommandLimits,
  type HostCommandOp,
} from "./commandMiddleware";
import type { GameHost, HostChangeEvent } from "./host";
import type { TransportPipeFactory } from "./pipe";
import {
  decodeWsClientMessage,
  encodeWsMessage,
  inspectWsDecodeFailure,
  subscriptionKey,
  type WsAppearance,
  type WsChannel,
  type WsChatMessage,
  type WsClientMessage,
  type WsPose,
  type WsPresenceRow,
  type WsServerMessage,
  type WsVoiceParticipant,
} from "./protocol";

export type HostRouterAuthenticate = (args: {
  userId: string;
  token?: string;
}) => Promise<string | null> | string | null;

export type HostRouterOptions = {
  host: GameHost;
  authenticate?: HostRouterAuthenticate;
  allowAnonymous?: boolean;
  singleSession?: boolean;
  poseRules?: PoseSyncRules;
  positionHistoryMs?: number;
  chatRateLimit?: ChatRateLimit;
  chatHistoryLimit?: number;
  chatMaxBodyLength?: number;
  /** Per-op rate limits for pose/runCommand/join/browse/voice. Omit (default) for no rate limiting; pass {@link DEFAULT_COMMAND_LIMITS} or a custom {@link CommandLimits} to opt in. */
  limits?: CommandLimits;
  /** Per-command authorization hook; defaults to allow-all. */
  authorize?: CommandAuthorize;
  /** Declared `runCommand` names and input validators. Omit (default) to pass every command through unchanged; set to reject unknown command names and validate declared ones. */
  validate?: CommandCatalog;
  now?: () => number;
};

export type HostRouterTransport = {
  send: (data: string) => void;
  close: () => void;
};

export type HostRouterConnection = {
  handleRaw: (raw: unknown) => void;
  close: () => void;
};

/** A player's interpolated position sampled from history at a past timestamp. */
export type RewoundPosition = {
  userId: string;
  x: number;
  y: number;
  z: number;
};

export type HostRouter = {
  connect: (transport: HostRouterTransport) => HostRouterConnection;
  rewind: (args: { serverId: string; atMs: number }) => RewoundPosition[];
  close: () => void;
};

export const DEFAULT_POSE_RULES: PoseSyncRules = DEFAULT_POSE_SYNC_RULES;

/** Cap on frames queued behind a connection's in-flight message; beyond this a flood gets rejected instead of piling up unbounded promises. */
export const MAX_QUEUED_MESSAGES = 64;

type Connection = {
  transport: HostRouterTransport;
  userId: string | null;
  subscriptions: Set<string>;
  joinedServers: Set<string>;
  queue: Promise<void>;
  queuedMessages: number;
};

type PresenceEntry = PresencePoseState & { appearance?: WsAppearance };

function appearanceEqual(a: WsAppearance | undefined, b: WsAppearance | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = factory();
    map.set(key, value);
  }
  return value;
}

/**
 * Remove `userId` from every visited `server|scope` bucket, drop buckets that empty out, and notify
 * per changed key. Backs both the disconnect-wide and per-server drops for presence and voice.
 */
function dropUserFrom<V>(
  store: Map<string, Map<string, V>>,
  userId: string,
  shouldVisit: (key: string) => boolean,
  onChanged: (key: string) => void,
): void {
  for (const [key, inner] of store) {
    if (!shouldVisit(key)) continue;
    if (!inner.delete(userId)) continue;
    if (inner.size === 0) store.delete(key);
    onChanged(key);
  }
}

export function createHostRouter(options: HostRouterOptions): HostRouter {
  const host = options.host;
  const now = options.now ?? Date.now;
  const poseRules = options.poseRules ?? DEFAULT_POSE_RULES;
  const allowAnonymous = options.allowAnonymous === true;
  const singleSession = options.singleSession !== false;
  const authenticate: HostRouterAuthenticate | null =
    options.authenticate ??
    (allowAnonymous ? ({ userId }: { userId: string }) => userId : null);

  const connections = new Set<Connection>();
  const sessionsByUserId = new Map<string, Connection>();
  const subscribers = new Map<string, Set<Connection>>();

  const subscribersOf = (key: string): readonly Connection[] => {
    const set = subscribers.get(key);
    return set === undefined ? [] : [...set];
  };
  const addSubscription = (connection: Connection, key: string): void => {
    connection.subscriptions.add(key);
    let set = subscribers.get(key);
    if (set === undefined) {
      set = new Set();
      subscribers.set(key, set);
    }
    set.add(connection);
  };
  const removeSubscription = (connection: Connection, key: string): void => {
    connection.subscriptions.delete(key);
    const set = subscribers.get(key);
    if (set === undefined) return;
    set.delete(connection);
    if (set.size === 0) subscribers.delete(key);
  };
  const presence = new Map<string, Map<string, PresenceEntry>>();
  const positionHistoryMs = options.positionHistoryMs ?? 1_000;
  const histories = new Map<string, PositionHistory>();

  const historyFor = (serverId: string): PositionHistory =>
    getOrCreate(histories, serverId, () => createPositionHistory({ historyMs: positionHistoryMs }));

  const send = (connection: Connection, message: WsServerMessage) => {
    connection.transport.send(encodeWsMessage(message));
  };

  const reply = (connection: Connection, id: number, result: unknown) => {
    send(connection, { v: 1, t: "reply", id, ok: true, result });
  };

  const replyError = (connection: Connection, id: number, reason: string) => {
    send(connection, { v: 1, t: "reply", id, ok: false, reason });
  };

  const presenceRows = (serverId: string): WsPresenceRow[] => {
    const rows = presence.get(serverId);
    if (rows === undefined) return [];
    return [...rows.entries()].map(([userId, pose]) => ({
      userId,
      position: pose.position,
      rotationY: pose.rotationY,
      rotationPitch: pose.rotationPitch ?? 0,
      lastSeenAt: pose.lastSeenAtMs ?? 0,
      appearance: pose.appearance,
    }));
  };

  const broadcast = (key: string, build: () => WsServerMessage) => {
    const targets = subscribersOf(key);
    if (targets.length === 0) return;
    const message = build();
    for (const connection of targets) send(connection, message);
  };

  const broadcastPresence = (serverId: string) =>
    broadcast(subscriptionKey("presence", serverId), () => ({
      v: 1,
      t: "update",
      channel: "presence",
      serverId,
      data: presenceRows(serverId),
    }));

  const commandMiddleware = createCommandMiddleware({
    limits: options.limits,
    authorize: options.authorize,
    validate: options.validate,
  });

  const gate = async (
    connection: Connection,
    id: number,
    op: HostCommandOp,
    args: { serverId?: string; command?: string; input?: unknown } = {},
  ): Promise<boolean> => {
    if (connection.userId === null) return true;
    const decision = await commandMiddleware.check({
      connection,
      userId: connection.userId,
      op,
      atMs: now(),
      ...args,
    });
    if (!decision.allow) {
      replyError(connection, id, decision.reason);
      return false;
    }
    return true;
  };

  const chatRings = new Map<string, WsChatMessage[]>();
  const chatLimiter = createChatRateLimiter(options.chatRateLimit ?? DEFAULT_CHAT_RATE_LIMIT);
  const chatHistoryLimit = options.chatHistoryLimit ?? DEFAULT_CHAT_HISTORY_LIMIT;
  const chatMaxBodyLength = options.chatMaxBodyLength ?? DEFAULT_CHAT_BODY_LENGTH;
  let chatCounter = 0;

  const chatRing = (serverId: string, channelId: string): WsChatMessage[] =>
    getOrCreate(chatRings, `${serverId}|${channelId}`, () => []);

  const broadcastChat = (serverId: string, channelId: string) =>
    broadcast(subscriptionKey("chat", serverId, channelId), () => ({
      v: 1,
      t: "update",
      channel: "chat",
      serverId,
      action: channelId,
      data: chatRing(serverId, channelId).slice(),
    }));

  const voiceRosters = new Map<string, Map<string, WsVoiceParticipant>>();

  const voiceRoster = (serverId: string, channelId: string): Map<string, WsVoiceParticipant> =>
    getOrCreate(voiceRosters, `${serverId}|${channelId}`, () => new Map());

  const voiceParticipants = (serverId: string, channelId: string): WsVoiceParticipant[] =>
    [...voiceRoster(serverId, channelId).values()].map((participant) => ({ ...participant }));

  const broadcastVoice = (serverId: string, channelId: string) =>
    broadcast(subscriptionKey("voice", serverId, channelId), () => ({
      v: 1,
      t: "update",
      channel: "voice",
      serverId,
      action: channelId,
      data: voiceParticipants(serverId, channelId),
    }));

  const dropVoice = (connection: Connection) => {
    if (connection.userId === null) return;
    dropUserFrom(voiceRosters, connection.userId, () => true, (key) => {
      const [serverId, channelId] = key.split("|") as [string, string];
      broadcastVoice(serverId, channelId);
    });
  };

  const dropVoiceForServer = (userId: string, serverId: string) => {
    const prefix = `${serverId}|`;
    dropUserFrom(
      voiceRosters,
      userId,
      (key) => key.startsWith(prefix),
      (key) => broadcastVoice(serverId, key.slice(prefix.length)),
    );
  };

  const requireMembership = async (
    connection: Connection,
    id: number,
    serverId: string,
  ): Promise<string | null> => {
    const userId = connection.userId;
    if (userId === null) {
      replyError(connection, id, "Not authenticated");
      return null;
    }
    if (!(await host.isMember({ userId, serverId }))) {
      replyError(connection, id, "Not a member of this server");
      return null;
    }
    return userId;
  };

  const handleChatSend = async (
    connection: Connection,
    message: { id: number; serverId: string; channelId: string; body: string },
  ) => {
    const userId = await requireMembership(connection, message.id, message.serverId);
    if (userId === null) return;
    const body = message.body.trim();
    if (body.length === 0) {
      replyError(connection, message.id, "empty message");
      return;
    }
    if (body.length > chatMaxBodyLength) {
      replyError(connection, message.id, "message too long");
      return;
    }
    const timestamp = now();
    if (!chatLimiter.allow(`${userId}|${message.serverId}`, timestamp)) {
      replyError(connection, message.id, "rate limited");
      return;
    }
    chatCounter += 1;
    const entry: WsChatMessage = {
      id: `msg_${chatCounter}`,
      channelId: message.channelId,
      fromUserId: userId,
      body,
      at: timestamp,
    };
    const ring = chatRing(message.serverId, message.channelId);
    ring.push(entry);
    if (ring.length > chatHistoryLimit) ring.splice(0, ring.length - chatHistoryLimit);
    reply(connection, message.id, null);
    broadcastChat(message.serverId, message.channelId);
  };

  const pushSubscription = async (
    connection: Connection,
    channel: WsChannel,
    serverId: string,
    action?: string,
  ) => {
    if (connection.userId === null) return;
    if (channel === "server") {
      const data = await host.getServerView({ userId: connection.userId, serverId });
      send(connection, { v: 1, t: "update", channel, serverId, data });
    } else if (channel === "player") {
      const data = await host.getPlayerView({ userId: connection.userId, serverId });
      send(connection, { v: 1, t: "update", channel, serverId, data });
    } else if (channel === "feed") {
      const data = await host.getFeed({ userId: connection.userId, serverId, action: action ?? "" });
      send(connection, { v: 1, t: "update", channel, serverId, action: action ?? "", data });
    } else if (channel === "chat") {
      const channelId = action ?? "";
      send(connection, {
        v: 1,
        t: "update",
        channel,
        serverId,
        action: channelId,
        data: chatRing(serverId, channelId).slice(),
      });
    } else if (channel === "voice") {
      const channelId = action ?? "";
      send(connection, {
        v: 1,
        t: "update",
        channel,
        serverId,
        action: channelId,
        data: voiceParticipants(serverId, channelId),
      });
    } else {
      send(connection, { v: 1, t: "update", channel, serverId, data: presenceRows(serverId) });
    }
  };

  const onHostEvent = (event: HostChangeEvent) => {
    if (event.type === "server") {
      for (const connection of subscribersOf(subscriptionKey("server", event.serverId))) {
        if (connection.userId === null) continue;
        void pushSubscription(connection, "server", event.serverId);
      }
    } else if (event.type === "player") {
      for (const connection of subscribersOf(subscriptionKey("player", event.serverId))) {
        if (connection.userId === event.userId) {
          void pushSubscription(connection, "player", event.serverId);
        }
      }
    } else {
      for (const connection of subscribersOf(subscriptionKey("feed", event.serverId, event.action))) {
        if (connection.userId === null) continue;
        void pushSubscription(connection, "feed", event.serverId, event.action);
      }
    }
  };
  const unsubscribeHost = host.subscribe(onHostEvent);

  const handlePose = async (connection: Connection, serverId: string, pose: WsPose) => {
    if (connection.userId === null) return;
    const gateDecision = await commandMiddleware.check({
      connection,
      userId: connection.userId,
      op: "pose",
      atMs: now(),
      serverId,
    });
    if (!gateDecision.allow) return;
    if (!(await host.isMember({ userId: connection.userId, serverId }))) return;
    const rows = presence.get(serverId) ?? new Map<string, PresenceEntry>();
    presence.set(serverId, rows);
    const timestamp = now();
    const hadRow = rows.has(connection.userId);
    const current = rows.get(connection.userId) ?? spawnPresenceState(undefined, timestamp, poseRules);
    const decision = decidePoseSync(
      current,
      { position: { x: pose.x, y: pose.y, z: pose.z }, rotationY: pose.rotationY, rotationPitch: pose.rotationPitch },
      poseRules,
      timestamp,
    );
    const appearanceChanged =
      pose.appearance !== undefined && !appearanceEqual(pose.appearance, current.appearance);
    if (decision.changed || decision.refreshKeepAlive || appearanceChanged || !hadRow) {
      rows.set(connection.userId, {
        position: decision.position,
        rotationY: decision.rotationY,
        rotationPitch: decision.rotationPitch,
        lastSeenAtMs: timestamp,
        appearance: pose.appearance ?? current.appearance,
      });
      historyFor(serverId).record(connection.userId, timestamp, decision.position);
    }
    if (decision.changed || appearanceChanged || !hadRow) {
      broadcastPresence(serverId);
    }
  };

  const dropPresence = (connection: Connection) => {
    if (connection.userId === null) return;
    dropUserFrom(presence, connection.userId, () => true, (serverId) => broadcastPresence(serverId));
  };

  const dropPresenceForServer = (userId: string, serverId: string) => {
    dropUserFrom(presence, userId, (key) => key === serverId, () => broadcastPresence(serverId));
  };

  const handleMessage = async (connection: Connection, message: WsClientMessage) => {
    if (message.t === "hello") {
      if (connection.userId !== null) {
        replyError(connection, message.id, "Already authenticated");
        return;
      }
      if (authenticate === null) {
        replyError(connection, message.id, "Not authenticated");
        connection.transport.close();
        return;
      }
      const userId = await authenticate({ userId: message.userId, token: message.token });
      if (userId === null) {
        replyError(connection, message.id, "Not authenticated");
        connection.transport.close();
        return;
      }
      if (singleSession) {
        const previous = sessionsByUserId.get(userId);
        if (previous !== undefined && previous !== connection) {
          sessionsByUserId.delete(userId);
          previous.userId = null;
          previous.transport.close();
        }
        sessionsByUserId.set(userId, connection);
      }
      connection.userId = userId;
      reply(connection, message.id, { userId });
      return;
    }

    if (message.t === "pose") {
      await handlePose(connection, message.serverId, message.pose);
      return;
    }

    if (connection.userId === null) {
      replyError(connection, message.id, "Not authenticated");
      return;
    }
    const userId = connection.userId;

    try {
      switch (message.t) {
        case "join": {
          if (!(await gate(connection, message.id, "join", { serverId: message.serverId }))) return;
          const result = await host.joinServer({
            userId,
            gameId: message.gameId,
            serverId: message.serverId,
            attributes: message.attributes,
            code: message.code,
          });
          connection.joinedServers.add(result.serverId);
          reply(connection, message.id, result);
          return;
        }
        case "joinByCode": {
          if (!(await gate(connection, message.id, "join", {}))) return;
          const result = await host.joinByCode({
            userId,
            gameId: message.gameId,
            code: message.code,
          });
          if (result !== null) connection.joinedServers.add(result.serverId);
          reply(connection, message.id, result);
          return;
        }
        case "browse": {
          if (!(await gate(connection, message.id, "browse", {}))) return;
          const result = await host.browseServers({
            gameId: message.gameId,
            filter: message.filter,
            limit: message.limit,
          });
          reply(connection, message.id, result);
          return;
        }
        case "leave": {
          await host.leaveServer({ userId, serverId: message.serverId });
          connection.joinedServers.delete(message.serverId);
          dropPresenceForServer(userId, message.serverId);
          dropVoiceForServer(userId, message.serverId);
          reply(connection, message.id, null);
          return;
        }
        case "runCommand": {
          if (
            !(await gate(connection, message.id, "runCommand", {
              serverId: message.serverId,
              command: message.command,
              input: message.input,
            }))
          )
            return;
          const result = await host.runCommand({
            userId,
            serverId: message.serverId,
            command: message.command,
            input: message.input,
          });
          reply(connection, message.id, result);
          return;
        }
        case "pushFeed": {
          await host.pushFeedEntry({
            userId,
            serverId: message.serverId,
            action: message.action,
            entry: message.entry,
          });
          reply(connection, message.id, null);
          return;
        }
        case "chatSend": {
          await handleChatSend(connection, message);
          return;
        }
        case "voiceJoin": {
          if (!(await gate(connection, message.id, "voice", { serverId: message.serverId }))) return;
          if ((await requireMembership(connection, message.id, message.serverId)) === null) return;
          const participant: WsVoiceParticipant = { userId };
          if (message.streamId !== undefined) participant.streamId = message.streamId;
          voiceRoster(message.serverId, message.channelId).set(userId, participant);
          reply(connection, message.id, null);
          broadcastVoice(message.serverId, message.channelId);
          return;
        }
        case "voiceLeave": {
          if (!(await gate(connection, message.id, "voice", { serverId: message.serverId }))) return;
          if ((await requireMembership(connection, message.id, message.serverId)) === null) return;
          const roster = voiceRoster(message.serverId, message.channelId);
          const removed = roster.delete(userId);
          reply(connection, message.id, null);
          if (removed) broadcastVoice(message.serverId, message.channelId);
          return;
        }
        case "voicePublish": {
          if (!(await gate(connection, message.id, "voice", { serverId: message.serverId }))) return;
          if ((await requireMembership(connection, message.id, message.serverId)) === null) return;
          const participant = voiceRoster(message.serverId, message.channelId).get(userId);
          if (participant === undefined) {
            replyError(connection, message.id, "not in this voice channel");
            return;
          }
          participant.streamId = message.streamId;
          reply(connection, message.id, null);
          broadcastVoice(message.serverId, message.channelId);
          return;
        }
        case "subscribe": {
          if (
            (message.channel === "chat" ||
              message.channel === "voice" ||
              message.channel === "presence") &&
            !(await host.isMember({ userId, serverId: message.serverId }))
          ) {
            replyError(connection, message.id, "Not a member of this server");
            return;
          }
          addSubscription(connection, subscriptionKey(message.channel, message.serverId, message.action));
          reply(connection, message.id, null);
          await pushSubscription(connection, message.channel, message.serverId, message.action);
          return;
        }
        case "unsubscribe": {
          removeSubscription(
            connection,
            subscriptionKey(message.channel, message.serverId, message.action),
          );
          reply(connection, message.id, null);
          return;
        }
      }
    } catch (error) {
      replyError(connection, message.id, error instanceof Error ? error.message : "Internal error");
    }
  };

  const leaveJoinedServers = (connection: Connection) => {
    if (connection.userId === null) return;
    const userId = connection.userId;
    const servers = [...connection.joinedServers];
    connection.joinedServers.clear();
    for (const serverId of servers) {
      void host.leaveServer({ userId, serverId }).catch(() => undefined);
    }
  };

  return {
    connect: (transport) => {
      const connection: Connection = {
        transport,
        userId: null,
        subscriptions: new Set(),
        joinedServers: new Set(),
        queue: Promise.resolve(),
        queuedMessages: 0,
      };
      connections.add(connection);
      return {
        handleRaw: (raw) => {
          const text = typeof raw === "string" ? raw : String(raw);
          const message = decodeWsClientMessage(text);
          if (message === null) {
            const failure = inspectWsDecodeFailure(text);
            if (failure.id !== undefined) {
              replyError(connection, failure.id, failure.reason);
            }
            return;
          }
          if (connection.queuedMessages >= MAX_QUEUED_MESSAGES) {
            if ("id" in message) replyError(connection, message.id, "Too many pending requests");
            return;
          }
          connection.queuedMessages += 1;
          connection.queue = connection.queue
            .then(() => handleMessage(connection, message))
            .catch(() => undefined)
            .finally(() => {
              connection.queuedMessages -= 1;
            });
        },
        close: () => {
          if (connection.userId !== null && sessionsByUserId.get(connection.userId) === connection) {
            sessionsByUserId.delete(connection.userId);
          }
          connections.delete(connection);
          for (const key of [...connection.subscriptions]) removeSubscription(connection, key);
          leaveJoinedServers(connection);
          dropPresence(connection);
          dropVoice(connection);
        },
      };
    },
    rewind: ({ serverId, atMs }) => {
      const history = histories.get(serverId);
      if (history === undefined) return [];
      const positions: RewoundPosition[] = [];
      for (const userId of history.entities()) {
        const sample = history.sampleAt(userId, atMs);
        if (sample !== null) {
          positions.push({ userId, x: sample.x, y: sample.y, z: sample.z });
        }
      }
      return positions;
    },
    close: () => {
      unsubscribeHost();
      connections.clear();
      subscribers.clear();
    },
  };
}

export function loopbackPipe(router: HostRouter): TransportPipeFactory {
  return (handlers) => {
    let open = true;
    const connection = router.connect({
      send: (data) => {
        if (!open) return;
        queueMicrotask(() => {
          if (open) handlers.onMessage(data);
        });
      },
      close: () => {
        if (!open) return;
        open = false;
        connection.close();
        queueMicrotask(() => handlers.onClose());
      },
    });
    queueMicrotask(() => {
      if (open) handlers.onOpen();
    });
    return {
      send: (data) => {
        if (!open) return;
        queueMicrotask(() => connection.handleRaw(data));
      },
      close: () => {
        if (!open) return;
        open = false;
        connection.close();
        queueMicrotask(() => handlers.onClose());
      },
    };
  };
}
