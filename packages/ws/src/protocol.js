export const WS_PROTOCOL_VERSION = 1;
export function encodeWsMessage(message) {
    return JSON.stringify(message);
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function parseVersioned(raw) {
    if (typeof raw !== "string")
        return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!isRecord(parsed))
        return null;
    if (parsed.v !== WS_PROTOCOL_VERSION)
        return null;
    if (typeof parsed.t !== "string")
        return null;
    return parsed;
}
function isWsChannel(value) {
    return value === "server" || value === "player" || value === "feed" || value === "presence";
}
function isPose(value) {
    return (isRecord(value) &&
        typeof value.x === "number" &&
        typeof value.y === "number" &&
        typeof value.z === "number" &&
        typeof value.rotationY === "number" &&
        typeof value.rotationPitch === "number");
}
export function decodeWsClientMessage(raw) {
    const message = parseVersioned(raw);
    if (message === null)
        return null;
    switch (message.t) {
        case "hello":
            return typeof message.id === "number" &&
                typeof message.userId === "string" &&
                (message.token === undefined || typeof message.token === "string")
                ? message
                : null;
        case "join":
            return typeof message.id === "number" &&
                typeof message.gameId === "string" &&
                (message.serverId === undefined || typeof message.serverId === "string")
                ? message
                : null;
        case "leave":
            return typeof message.id === "number" && typeof message.serverId === "string"
                ? message
                : null;
        case "runCommand":
            return typeof message.id === "number" &&
                typeof message.serverId === "string" &&
                typeof message.command === "string"
                ? message
                : null;
        case "pushFeed":
            return typeof message.id === "number" &&
                typeof message.serverId === "string" &&
                typeof message.action === "string"
                ? message
                : null;
        case "subscribe":
        case "unsubscribe":
            return typeof message.id === "number" &&
                isWsChannel(message.channel) &&
                typeof message.serverId === "string" &&
                (message.action === undefined || typeof message.action === "string")
                ? message
                : null;
        case "pose":
            return typeof message.serverId === "string" && isPose(message.pose)
                ? message
                : null;
        default:
            return null;
    }
}
export function decodeWsServerMessage(raw) {
    const message = parseVersioned(raw);
    if (message === null)
        return null;
    switch (message.t) {
        case "reply":
            if (typeof message.id !== "number")
                return null;
            if (message.ok === true)
                return message;
            if (message.ok === false && typeof message.reason === "string") {
                return message;
            }
            return null;
        case "update":
            return isWsChannel(message.channel) && typeof message.serverId === "string"
                ? message
                : null;
        default:
            return null;
    }
}
export function subscriptionKey(channel, serverId, action) {
    return `${channel}|${serverId}|${action ?? ""}`;
}
