import type { GameRuntimePlayerView, GameRuntimeServerView, JoinServerResult, TransportRunCommandResult } from "@jgengine/core/runtime/transport";
export declare const WS_PROTOCOL_VERSION = 1;
export type WsChannel = "server" | "player" | "feed" | "presence";
export type WsPose = {
    x: number;
    y: number;
    z: number;
    rotationY: number;
    rotationPitch: number;
};
export type WsPresenceRow = {
    userId: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
    rotationY: number;
    rotationPitch: number;
    lastSeenAt: number;
};
export type WsClientMessage = {
    v: 1;
    t: "hello";
    id: number;
    userId: string;
    token?: string;
} | {
    v: 1;
    t: "join";
    id: number;
    gameId: string;
    serverId?: string;
} | {
    v: 1;
    t: "leave";
    id: number;
    serverId: string;
} | {
    v: 1;
    t: "runCommand";
    id: number;
    serverId: string;
    command: string;
    input: unknown;
} | {
    v: 1;
    t: "pushFeed";
    id: number;
    serverId: string;
    action: string;
    entry: unknown;
} | {
    v: 1;
    t: "subscribe";
    id: number;
    channel: WsChannel;
    serverId: string;
    action?: string;
} | {
    v: 1;
    t: "unsubscribe";
    id: number;
    channel: WsChannel;
    serverId: string;
    action?: string;
} | {
    v: 1;
    t: "pose";
    serverId: string;
    pose: WsPose;
};
export type WsUpdateMessage = {
    v: 1;
    t: "update";
    channel: "server";
    serverId: string;
    data: GameRuntimeServerView | null;
} | {
    v: 1;
    t: "update";
    channel: "player";
    serverId: string;
    data: GameRuntimePlayerView | null;
} | {
    v: 1;
    t: "update";
    channel: "feed";
    serverId: string;
    action: string;
    data: unknown[];
} | {
    v: 1;
    t: "update";
    channel: "presence";
    serverId: string;
    data: WsPresenceRow[];
};
export type WsServerMessage = {
    v: 1;
    t: "reply";
    id: number;
    ok: true;
    result?: unknown;
} | {
    v: 1;
    t: "reply";
    id: number;
    ok: false;
    reason: string;
} | WsUpdateMessage;
export type WsJoinResult = JoinServerResult;
export type WsRunCommandResult = TransportRunCommandResult;
export declare function encodeWsMessage(message: WsClientMessage | WsServerMessage): string;
export declare function decodeWsClientMessage(raw: unknown): WsClientMessage | null;
export declare function decodeWsServerMessage(raw: unknown): WsServerMessage | null;
export declare function subscriptionKey(channel: WsChannel, serverId: string, action?: string): string;
