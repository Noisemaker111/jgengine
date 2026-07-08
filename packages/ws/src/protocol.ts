import type {
  GameRuntimePlayerView,
  GameRuntimeServerView,
  JoinServerResult,
  TransportRunCommandResult,
} from "@jgengine/core/runtime/transport";
import type { SessionAttributes } from "@jgengine/core/runtime/hostPersistence";
import type { MatchFilter, SessionListing } from "@jgengine/core/multiplayer/matchmaking";

export const WS_PROTOCOL_VERSION = 1;

export type WsChannel = "server" | "player" | "feed" | "presence" | "chat";

export type WsAppearance = Record<string, string>;

export type WsPose = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  rotationPitch: number;
  appearance?: WsAppearance;
};

export type WsPresenceRow = {
  userId: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch: number;
  lastSeenAt: number;
  appearance?: WsAppearance;
};

export type WsChatMessage = {
  id: string;
  channelId: string;
  fromUserId: string;
  body: string;
  at: number;
};

export type WsClientMessage =
  | { v: 1; t: "hello"; id: number; userId: string; token?: string }
  | { v: 1; t: "join"; id: number; gameId: string; serverId?: string; attributes?: SessionAttributes }
  | { v: 1; t: "joinByCode"; id: number; gameId: string; code: string }
  | { v: 1; t: "browse"; id: number; gameId: string; filter?: MatchFilter; limit?: number }
  | { v: 1; t: "leave"; id: number; serverId: string }
  | { v: 1; t: "runCommand"; id: number; serverId: string; command: string; input: unknown }
  | { v: 1; t: "pushFeed"; id: number; serverId: string; action: string; entry: unknown }
  | { v: 1; t: "subscribe"; id: number; channel: WsChannel; serverId: string; action?: string }
  | { v: 1; t: "unsubscribe"; id: number; channel: WsChannel; serverId: string; action?: string }
  | { v: 1; t: "pose"; serverId: string; pose: WsPose }
  | { v: 1; t: "chatSend"; id: number; serverId: string; channelId: string; body: string };

export type WsUpdateMessage =
  | { v: 1; t: "update"; channel: "server"; serverId: string; data: GameRuntimeServerView | null }
  | { v: 1; t: "update"; channel: "player"; serverId: string; data: GameRuntimePlayerView | null }
  | { v: 1; t: "update"; channel: "feed"; serverId: string; action: string; data: unknown[] }
  | { v: 1; t: "update"; channel: "presence"; serverId: string; data: WsPresenceRow[] }
  | { v: 1; t: "update"; channel: "chat"; serverId: string; action: string; data: WsChatMessage[] };

export type WsServerMessage =
  | { v: 1; t: "reply"; id: number; ok: true; result?: unknown }
  | { v: 1; t: "reply"; id: number; ok: false; reason: string }
  | WsUpdateMessage;

export type WsJoinResult = JoinServerResult;
export type WsRunCommandResult = TransportRunCommandResult;
export type WsBrowseResult = SessionListing[];
export type WsJoinByCodeResult = JoinServerResult | null;

export function encodeWsMessage(message: WsClientMessage | WsServerMessage): string {
  return JSON.stringify(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseVersioned(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.v !== WS_PROTOCOL_VERSION) return null;
  if (typeof parsed.t !== "string") return null;
  return parsed;
}

function isWsChannel(value: unknown): value is WsChannel {
  return (
    value === "server" ||
    value === "player" ||
    value === "feed" ||
    value === "presence" ||
    value === "chat"
  );
}

function isWsAppearance(value: unknown): value is WsAppearance {
  return isRecord(value) && Object.values(value).every((slot) => typeof slot === "string");
}

function isPose(value: unknown): value is WsPose {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.z === "number" &&
    typeof value.rotationY === "number" &&
    typeof value.rotationPitch === "number" &&
    (value.appearance === undefined || isWsAppearance(value.appearance))
  );
}

export function decodeWsClientMessage(raw: unknown): WsClientMessage | null {
  const message = parseVersioned(raw);
  if (message === null) return null;

  switch (message.t) {
    case "hello":
      return typeof message.id === "number" &&
        typeof message.userId === "string" &&
        (message.token === undefined || typeof message.token === "string")
        ? (message as WsClientMessage)
        : null;
    case "join":
      return typeof message.id === "number" &&
        typeof message.gameId === "string" &&
        (message.serverId === undefined || typeof message.serverId === "string")
        ? (message as WsClientMessage)
        : null;
    case "joinByCode":
      return typeof message.id === "number" &&
        typeof message.gameId === "string" &&
        typeof message.code === "string"
        ? (message as WsClientMessage)
        : null;
    case "browse":
      return typeof message.id === "number" && typeof message.gameId === "string"
        ? (message as WsClientMessage)
        : null;
    case "leave":
      return typeof message.id === "number" && typeof message.serverId === "string"
        ? (message as WsClientMessage)
        : null;
    case "runCommand":
      return typeof message.id === "number" &&
        typeof message.serverId === "string" &&
        typeof message.command === "string"
        ? (message as WsClientMessage)
        : null;
    case "pushFeed":
      return typeof message.id === "number" &&
        typeof message.serverId === "string" &&
        typeof message.action === "string"
        ? (message as WsClientMessage)
        : null;
    case "subscribe":
    case "unsubscribe":
      return typeof message.id === "number" &&
        isWsChannel(message.channel) &&
        typeof message.serverId === "string" &&
        (message.action === undefined || typeof message.action === "string")
        ? (message as WsClientMessage)
        : null;
    case "pose":
      return typeof message.serverId === "string" && isPose(message.pose)
        ? (message as WsClientMessage)
        : null;
    case "chatSend":
      return typeof message.id === "number" &&
        typeof message.serverId === "string" &&
        typeof message.channelId === "string" &&
        typeof message.body === "string"
        ? (message as WsClientMessage)
        : null;
    default:
      return null;
  }
}

export function decodeWsServerMessage(raw: unknown): WsServerMessage | null {
  const message = parseVersioned(raw);
  if (message === null) return null;

  switch (message.t) {
    case "reply":
      if (typeof message.id !== "number") return null;
      if (message.ok === true) return message as WsServerMessage;
      if (message.ok === false && typeof message.reason === "string") {
        return message as WsServerMessage;
      }
      return null;
    case "update":
      return isWsChannel(message.channel) && typeof message.serverId === "string"
        ? (message as WsServerMessage)
        : null;
    default:
      return null;
  }
}

export function subscriptionKey(channel: WsChannel, serverId: string, action?: string): string {
  return `${channel}|${serverId}|${action ?? ""}`;
}
