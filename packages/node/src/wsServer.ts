import type { Server as HttpServer } from "node:http";

import { WebSocketServer, type WebSocket } from "ws";

import type { PoseSyncRules, PresencePoseState } from "@jgengine/core/multiplayer/presenceModel";
import { decidePoseSync } from "@jgengine/core/multiplayer/presenceModel";
import { createPositionHistory, type PositionHistory } from "@jgengine/core/multiplayer/lagCompensation";
import {
  createChatRateLimiter,
  DEFAULT_CHAT_BODY_LENGTH,
  DEFAULT_CHAT_HISTORY_LIMIT,
  DEFAULT_CHAT_RATE_LIMIT,
  type ChatRateLimit,
} from "@jgengine/core/game/chat";
import {
  decodeWsClientMessage,
  encodeWsMessage,
  subscriptionKey,
  type WsChatMessage,
  type WsClientMessage,
  type WsPose,
  type WsPresenceRow,
  type WsServerMessage,
} from "@jgengine/ws/protocol";

import type { GameHost, HostChangeEvent } from "./host";

export type GameWsServerOptions = {
  host: GameHost;
  server?: HttpServer;
  port?: number;
  path?: string;
  authenticate?: (args: { userId: string; token?: string }) => Promise<string | null> | string | null;
  poseRules?: PoseSyncRules;
  positionHistoryMs?: number;
  chatRateLimit?: ChatRateLimit;
  chatHistoryLimit?: number;
  chatMaxBodyLength?: number;
  now?: () => number;
};

export type RewoundPosition = {
  userId: string;
  x: number;
  y: number;
  z: number;
};

export type GameWsServer = {
  wss: WebSocketServer;
  port: () => number;
  rewind: (args: { serverId: string; atMs: number }) => RewoundPosition[];
  close: () => Promise<void>;
};

const DEFAULT_POSE_RULES: PoseSyncRules = {
  maxSpeed: 12,
  maxVerticalOffset: 3,
  minElapsedSec: 0.05,
  maxElapsedSec: 0.5,
  keepAliveRefreshMs: 10_000,
};

type Connection = {
  socket: WebSocket;
  userId: string | null;
  subscriptions: Set<string>;
};

export function createGameWsServer(options: GameWsServerOptions): GameWsServer {
  const host = options.host;
  const now = options.now ?? Date.now;
  const poseRules = options.poseRules ?? DEFAULT_POSE_RULES;
  const authenticate = options.authenticate ?? (({ userId }: { userId: string }) => userId);

  const wss =
    options.server !== undefined
      ? new WebSocketServer({ server: options.server, path: options.path })
      : new WebSocketServer({ port: options.port ?? 0, path: options.path });

  const connections = new Set<Connection>();
  const presence = new Map<string, Map<string, PresencePoseState>>();
  const positionHistoryMs = options.positionHistoryMs ?? 1_000;
  const histories = new Map<string, PositionHistory>();

  const historyFor = (serverId: string): PositionHistory => {
    let history = histories.get(serverId);
    if (history === undefined) {
      history = createPositionHistory({ historyMs: positionHistoryMs });
      histories.set(serverId, history);
    }
    return history;
  };

  const send = (connection: Connection, message: WsServerMessage) => {
    if (connection.socket.readyState !== connection.socket.OPEN) return;
    connection.socket.send(encodeWsMessage(message));
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
    }));
  };

  const broadcastPresence = (serverId: string) => {
    const key = subscriptionKey("presence", serverId);
    const data = presenceRows(serverId);
    for (const connection of connections) {
      if (!connection.subscriptions.has(key)) continue;
      send(connection, { v: 1, t: "update", channel: "presence", serverId, data });
    }
  };

  const chatRings = new Map<string, WsChatMessage[]>();
  const chatLimiter = createChatRateLimiter(options.chatRateLimit ?? DEFAULT_CHAT_RATE_LIMIT);
  const chatHistoryLimit = options.chatHistoryLimit ?? DEFAULT_CHAT_HISTORY_LIMIT;
  const chatMaxBodyLength = options.chatMaxBodyLength ?? DEFAULT_CHAT_BODY_LENGTH;
  let chatCounter = 0;

  const chatRing = (serverId: string, channelId: string): WsChatMessage[] => {
    const key = `${serverId}|${channelId}`;
    let ring = chatRings.get(key);
    if (ring === undefined) {
      ring = [];
      chatRings.set(key, ring);
    }
    return ring;
  };

  const broadcastChat = (serverId: string, channelId: string) => {
    const key = subscriptionKey("chat", serverId, channelId);
    const data = chatRing(serverId, channelId).slice();
    for (const connection of connections) {
      if (!connection.subscriptions.has(key)) continue;
      send(connection, { v: 1, t: "update", channel: "chat", serverId, action: channelId, data });
    }
  };

  const handleChatSend = (
    connection: Connection,
    message: { id: number; serverId: string; channelId: string; body: string },
  ) => {
    const userId = connection.userId;
    if (userId === null) {
      replyError(connection, message.id, "Not authenticated");
      return;
    }
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
    channel: "server" | "player" | "feed" | "presence" | "chat",
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
    } else {
      send(connection, { v: 1, t: "update", channel, serverId, data: presenceRows(serverId) });
    }
  };

  const onHostEvent = (event: HostChangeEvent) => {
    for (const connection of connections) {
      if (connection.userId === null) continue;
      if (event.type === "server") {
        if (connection.subscriptions.has(subscriptionKey("server", event.serverId))) {
          void pushSubscription(connection, "server", event.serverId);
        }
      } else if (event.type === "player") {
        if (
          connection.userId === event.userId &&
          connection.subscriptions.has(subscriptionKey("player", event.serverId))
        ) {
          void pushSubscription(connection, "player", event.serverId);
        }
      } else {
        if (connection.subscriptions.has(subscriptionKey("feed", event.serverId, event.action))) {
          void pushSubscription(connection, "feed", event.serverId, event.action);
        }
      }
    }
  };
  const unsubscribeHost = host.subscribe(onHostEvent);

  const handlePose = (connection: Connection, serverId: string, pose: WsPose) => {
    if (connection.userId === null) return;
    const rows = presence.get(serverId) ?? new Map<string, PresencePoseState>();
    presence.set(serverId, rows);
    const timestamp = now();
    const current = rows.get(connection.userId);
    if (current === undefined) {
      rows.set(connection.userId, {
        position: { x: pose.x, y: pose.y, z: pose.z },
        rotationY: pose.rotationY,
        rotationPitch: pose.rotationPitch,
        lastSeenAtMs: timestamp,
      });
      historyFor(serverId).record(connection.userId, timestamp, { x: pose.x, y: pose.y, z: pose.z });
      broadcastPresence(serverId);
      return;
    }
    const decision = decidePoseSync(
      current,
      { position: { x: pose.x, y: pose.y, z: pose.z }, rotationY: pose.rotationY, rotationPitch: pose.rotationPitch },
      poseRules,
      timestamp,
    );
    if (decision.changed || decision.refreshKeepAlive) {
      rows.set(connection.userId, {
        position: decision.position,
        rotationY: decision.rotationY,
        rotationPitch: decision.rotationPitch,
        lastSeenAtMs: timestamp,
      });
      historyFor(serverId).record(connection.userId, timestamp, decision.position);
    }
    if (decision.changed) broadcastPresence(serverId);
  };

  const dropPresence = (connection: Connection) => {
    if (connection.userId === null) return;
    for (const [serverId, rows] of presence) {
      if (rows.delete(connection.userId)) {
        if (rows.size === 0) presence.delete(serverId);
        broadcastPresence(serverId);
      }
    }
  };

  const handleMessage = async (connection: Connection, message: WsClientMessage) => {
    if (message.t === "hello") {
      const userId = await authenticate({ userId: message.userId, token: message.token });
      if (userId === null) {
        replyError(connection, message.id, "Not authenticated");
        connection.socket.close();
        return;
      }
      connection.userId = userId;
      reply(connection, message.id, { userId });
      return;
    }

    if (message.t === "pose") {
      handlePose(connection, message.serverId, message.pose);
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
          const result = await host.joinServer({
            userId,
            gameId: message.gameId,
            serverId: message.serverId,
            attributes: message.attributes,
          });
          reply(connection, message.id, result);
          return;
        }
        case "joinByCode": {
          const result = await host.joinByCode({
            userId,
            gameId: message.gameId,
            code: message.code,
          });
          reply(connection, message.id, result);
          return;
        }
        case "browse": {
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
          reply(connection, message.id, null);
          return;
        }
        case "runCommand": {
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
          handleChatSend(connection, message);
          return;
        }
        case "subscribe": {
          connection.subscriptions.add(subscriptionKey(message.channel, message.serverId, message.action));
          reply(connection, message.id, null);
          await pushSubscription(connection, message.channel, message.serverId, message.action);
          return;
        }
        case "unsubscribe": {
          connection.subscriptions.delete(
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

  wss.on("connection", (socket) => {
    const connection: Connection = { socket, userId: null, subscriptions: new Set() };
    connections.add(connection);

    socket.on("message", (raw) => {
      const message = decodeWsClientMessage(raw.toString());
      if (message === null) return;
      void handleMessage(connection, message);
    });

    socket.on("close", () => {
      connections.delete(connection);
      dropPresence(connection);
    });
  });

  return {
    wss,
    port: () => {
      const address = wss.address();
      if (address === null || typeof address === "string") {
        throw new Error("WebSocket server has no bound port");
      }
      return address.port;
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
    close: () =>
      new Promise((resolve) => {
        unsubscribeHost();
        for (const connection of connections) {
          connection.socket.terminate();
        }
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        wss.close(finish);
        setTimeout(finish, 500);
      }),
  };
}
