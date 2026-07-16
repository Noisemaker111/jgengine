import type {
  GameRuntimePlayerView,
  GameRuntimeServerView,
  JoinServerResult,
  PresencePoseRow,
  TransportRunCommandResult,
} from "@jgengine/core/runtime/transport";
import type { PlayerPose } from "@jgengine/core/multiplayer/poseSyncGate";
import type { SessionAttributes } from "@jgengine/core/runtime/hostPersistence";
import type { MatchFilter, SessionListing } from "@jgengine/core/multiplayer/matchmaking";

export const WS_PROTOCOL_VERSION = 1;

/** Max length of a `runCommand` command name, in UTF-16 code units. */
export const MAX_COMMAND_LENGTH = 4_096;
/** Max length of a `pushFeed` action name, in UTF-16 code units. */
export const MAX_FEED_ACTION_LENGTH = 256;
/** Max serialized size of a `pushFeed` entry payload, in bytes. */
export const MAX_FEED_ENTRY_BYTES = 65_536;
/** Max number of keys in a pose `appearance` tag map. */
export const MAX_APPEARANCE_ENTRIES = 32;
/** Max length of a single `appearance` tag string value, in UTF-16 code units. */
export const MAX_APPEARANCE_VALUE_LENGTH = 256;

export type WsChannel = "server" | "player" | "feed" | "presence" | "chat" | "voice";

/** Client-set cosmetic/state tags carried alongside a pose (skin, mount, emote, ...). Primitive values only. */
export type WsAppearance = Record<string, string | number | boolean>;

export type WsPose = PlayerPose & { appearance?: WsAppearance };

export type WsPresenceRow = PresencePoseRow & { appearance?: WsAppearance };

export type WsChatMessage = {
  id: string;
  channelId: string;
  fromUserId: string;
  body: string;
  at: number;
};

export type WsVoiceParticipant = {
  userId: string;
  streamId?: string;
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
  | { v: 1; t: "chatSend"; id: number; serverId: string; channelId: string; body: string }
  | { v: 1; t: "voiceJoin"; id: number; serverId: string; channelId: string; streamId?: string }
  | { v: 1; t: "voiceLeave"; id: number; serverId: string; channelId: string }
  | { v: 1; t: "voicePublish"; id: number; serverId: string; channelId: string; streamId: string };

export type WsUpdateMessage =
  | { v: 1; t: "update"; channel: "server"; serverId: string; data: GameRuntimeServerView | null }
  | { v: 1; t: "update"; channel: "player"; serverId: string; data: GameRuntimePlayerView | null }
  | { v: 1; t: "update"; channel: "feed"; serverId: string; action: string; data: unknown[] }
  | { v: 1; t: "update"; channel: "presence"; serverId: string; data: WsPresenceRow[] }
  | { v: 1; t: "update"; channel: "chat"; serverId: string; action: string; data: WsChatMessage[] }
  | { v: 1; t: "update"; channel: "voice"; serverId: string; action: string; data: WsVoiceParticipant[] };

export type WsServerMessage =
  | { v: 1; t: "reply"; id: number; ok: true; result?: unknown }
  | { v: 1; t: "reply"; id: number; ok: false; reason: string }
  | WsUpdateMessage;

export type WsJoinResult = JoinServerResult;
export type WsRunCommandResult = TransportRunCommandResult;
export type WsBrowseResult = SessionListing[];
export type WsJoinByCodeResult = JoinServerResult | null;

/** @internal */
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
    value === "chat" ||
    value === "voice"
  );
}

function isAppearance(value: unknown): value is WsAppearance {
  if (!isRecord(value)) return false;
  const entries = Object.values(value);
  if (entries.length > MAX_APPEARANCE_ENTRIES) return false;
  return entries.every(
    (v) =>
      (typeof v === "string" && v.length <= MAX_APPEARANCE_VALUE_LENGTH) ||
      typeof v === "number" ||
      typeof v === "boolean",
  );
}

function withinFeedEntryBudget(entry: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(entry)).length <= MAX_FEED_ENTRY_BYTES;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPose(value: unknown): value is WsPose {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z) &&
    isFiniteNumber(value.rotationY) &&
    isFiniteNumber(value.rotationPitch) &&
    (value.appearance === undefined || isAppearance(value.appearance))
  );
}

export type WsDecodeFailure = {
  reason: string;
  id?: number;
};

/** @internal */
export function inspectWsDecodeFailure(raw: unknown): WsDecodeFailure {
  if (typeof raw !== "string") return { reason: "Invalid message framing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reason: "Invalid JSON" };
  }
  if (!isRecord(parsed)) return { reason: "Invalid message" };
  const id = typeof parsed.id === "number" ? parsed.id : undefined;
  if (parsed.v !== WS_PROTOCOL_VERSION) {
    return { reason: "Protocol version mismatch", id };
  }
  if (typeof parsed.t !== "string") {
    return { reason: "Invalid message type", id };
  }
  if (parsed.t === "runCommand" && typeof parsed.command === "string" && parsed.command.length > MAX_COMMAND_LENGTH) {
    return { reason: "Command exceeds max length", id };
  }
  if (parsed.t === "pushFeed" && typeof parsed.action === "string" && parsed.action.length > MAX_FEED_ACTION_LENGTH) {
    return { reason: "Feed action exceeds max length", id };
  }
  if (parsed.t === "pushFeed" && "entry" in parsed && !withinFeedEntryBudget(parsed.entry)) {
    return { reason: "Feed entry exceeds max size", id };
  }
  if (parsed.t === "pose" && isRecord(parsed.pose) && isRecord(parsed.pose.appearance)) {
    const values = Object.values(parsed.pose.appearance);
    if (values.length > MAX_APPEARANCE_ENTRIES) {
      return { reason: "Appearance exceeds max entries", id };
    }
    if (values.some((v) => typeof v === "string" && v.length > MAX_APPEARANCE_VALUE_LENGTH)) {
      return { reason: "Appearance value exceeds max length", id };
    }
  }
  return { reason: "Malformed message", id };
}

/** @internal */
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
        typeof message.command === "string" &&
        message.command.length <= MAX_COMMAND_LENGTH
        ? (message as WsClientMessage)
        : null;
    case "pushFeed":
      return typeof message.id === "number" &&
        typeof message.serverId === "string" &&
        typeof message.action === "string" &&
        message.action.length <= MAX_FEED_ACTION_LENGTH &&
        withinFeedEntryBudget(message.entry)
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
    case "voiceJoin":
      return typeof message.id === "number" &&
        typeof message.serverId === "string" &&
        typeof message.channelId === "string" &&
        (message.streamId === undefined || typeof message.streamId === "string")
        ? (message as WsClientMessage)
        : null;
    case "voiceLeave":
      return typeof message.id === "number" &&
        typeof message.serverId === "string" &&
        typeof message.channelId === "string"
        ? (message as WsClientMessage)
        : null;
    case "voicePublish":
      return typeof message.id === "number" &&
        typeof message.serverId === "string" &&
        typeof message.channelId === "string" &&
        typeof message.streamId === "string"
        ? (message as WsClientMessage)
        : null;
    default:
      return null;
  }
}

/** @internal */
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

/** @internal */
export function subscriptionKey(channel: WsChannel, serverId: string, action?: string): string {
  return `${channel}|${serverId}|${action ?? ""}`;
}
