export type MultiplayerTopology = "shared" | "lobbies" | "private";

/**
 * Where the world simulation is authoritative.
 *
 * - `"client"` (default when omitted) — **presence-only multiplayer**: each client runs its own `onTick` and
 *   syncs presence / feeds / chat. Not competitive-safe; do not treat it as a shared sim.
 * - `"server"` — host-authoritative world replication: the host runs the loop; the shell mirrors the host's
 *   world into the local `ctx` instead of simulating locally.
 *
 * Prefer naming the product intent in game code: pass `authority: "server"` for shared worlds, leave unset or
 * `"client"` only for co-op presence / lobbies that intentionally tick independently.
 */
export type MultiplayerAuthority = "server" | "client";

export type MultiplayerAdapterConfig =
  | { kind: "convex"; topology?: MultiplayerTopology; authority?: MultiplayerAuthority }
  | { kind: "ws"; topology?: MultiplayerTopology; url?: string; authority?: MultiplayerAuthority }
  | { kind: "socketio"; topology?: MultiplayerTopology; url?: string; authority?: MultiplayerAuthority }
  | { kind: "p2p"; topology?: MultiplayerTopology; room?: string; authority?: MultiplayerAuthority }
  | { kind: "lan"; topology?: MultiplayerTopology; port?: number; path?: string; authority?: MultiplayerAuthority }
  | { kind: "offline" };

/**
 * Convex transport. Omitting `authority` (or passing `"client"`) is **presence-only** — prefer
 * `convexPresence()` to name that intent explicitly. Pass `{ authority: "server" }` for a shared,
 * host-authoritative world — see `examples/HOSTED.md`.
 */
export function convex(config?: { topology?: MultiplayerTopology; authority?: MultiplayerAuthority }): MultiplayerAdapterConfig {
  return { kind: "convex", topology: config?.topology ?? "shared", authority: config?.authority };
}

/** Presence-only Convex transport — each client runs its own `onTick`; only presence/feeds/chat sync. Sugar for `convex({ ...config, authority: "client" })`. */
export function convexPresence(config?: { topology?: MultiplayerTopology }): MultiplayerAdapterConfig {
  return { kind: "convex", topology: config?.topology ?? "shared", authority: "client" };
}

/**
 * WebSocket transport. Omitting `authority` (or passing `"client"`) is **presence-only** — prefer
 * `wsPresence()` to name that intent explicitly. Pass `{ authority: "server" }` for a shared,
 * host-authoritative world — see `examples/HOSTED.md`.
 *
 * @capability multiplayer-ws server-hosted shared world over WebSocket — `multiplayer: ws({ authority: "server" })`
 */
export function ws(config?: { topology?: MultiplayerTopology; url?: string; authority?: MultiplayerAuthority }): MultiplayerAdapterConfig {
  return { kind: "ws", topology: config?.topology ?? "shared", url: config?.url, authority: config?.authority };
}

/** Presence-only WebSocket transport — each client runs its own `onTick`; only presence/feeds/chat sync. Sugar for `ws({ ...config, authority: "client" })`. */
export function wsPresence(config?: { topology?: MultiplayerTopology; url?: string }): MultiplayerAdapterConfig {
  return { kind: "ws", topology: config?.topology ?? "shared", url: config?.url, authority: "client" };
}

export function fly(config: { app: string; topology?: MultiplayerTopology; path?: string; authority?: MultiplayerAuthority }): MultiplayerAdapterConfig {
  return {
    kind: "ws",
    topology: config.topology ?? "shared",
    url: `wss://${config.app}.fly.dev${config.path ?? "/ws"}`,
    authority: config.authority,
  };
}

export function socketIo(config?: { topology?: MultiplayerTopology; url?: string; authority?: MultiplayerAuthority }): MultiplayerAdapterConfig {
  return { kind: "socketio", topology: config?.topology ?? "shared", url: config?.url, authority: config?.authority };
}

/**
 * Serverless peer-to-peer (WebRTC) session — one peer hosts, friends join by room code.
 *
 * @capability multiplayer-p2p serverless co-op over WebRTC — `multiplayer: p2p({ room })`
 */
export function p2p(config?: { topology?: MultiplayerTopology; room?: string; authority?: MultiplayerAuthority }): MultiplayerAdapterConfig {
  return { kind: "p2p", topology: config?.topology ?? "private", room: config?.room, authority: config?.authority };
}

export function lan(config?: {
  topology?: MultiplayerTopology;
  port?: number;
  path?: string;
  authority?: MultiplayerAuthority;
}): MultiplayerAdapterConfig {
  return { kind: "lan", topology: config?.topology ?? "shared", port: config?.port, path: config?.path, authority: config?.authority };
}

/** True when the adapter opts into host-authoritative world replication (`authority: "server"`). */
export function isServerAuthoritative(multiplayer: unknown): boolean {
  return resolveAuthority(multiplayer) === "server";
}

/**
 * Resolved authority for a multiplayer config.
 * - `offline` / missing adapter → `null` (single-player; not multiplayer authority).
 * - unset or `"client"` → `"client"` (presence-only; each client ticks).
 * - `"server"` → host-authoritative shared sim.
 */
export function resolveAuthority(multiplayer: unknown): MultiplayerAuthority | null {
  const adapter = adapterOf(multiplayer);
  if (adapter === null || adapter.kind === "offline") return null;
  if ("authority" in adapter && adapter.authority === "server") return "server";
  return "client";
}

/**
 * True when multiplayer is on but the world sim is not host-authoritative — presence/feeds/chat only.
 * Equivalent to `resolveAuthority(m) === "client"`.
 */
export function isPresenceOnly(multiplayer: unknown): boolean {
  return resolveAuthority(multiplayer) === "client";
}

/** True for a single-player world — no adapter, or an explicit `offline()` one. Gates offline-only wiring like local whole-world save. */
export function isOffline(multiplayer: unknown): boolean {
  const adapter = adapterOf(multiplayer);
  return adapter === null || adapter.kind === "offline";
}

/**
 * Explicit single-player adapter. Solo games never need this — omitting `multiplayer` in the shell
 * `defineGame` already defaults to offline; pass it only where an adapter value is structurally required.
 *
 * @capability multiplayer-offline explicit solo adapter — omit `multiplayer` instead; offline is the shell default
 */
export function offline(): MultiplayerAdapterConfig {
  return { kind: "offline" };
}

const ADAPTER_KINDS = new Set(["convex", "ws", "socketio", "p2p", "lan", "offline"]);

function isAdapterConfig(value: unknown): value is MultiplayerAdapterConfig {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && ADAPTER_KINDS.has(kind);
}

export function adapterOf(multiplayer: unknown): MultiplayerAdapterConfig | null {
  if (isAdapterConfig(multiplayer)) return multiplayer;
  if (typeof multiplayer === "object" && multiplayer !== null) {
    const nested = (multiplayer as { adapter?: unknown }).adapter;
    if (isAdapterConfig(nested)) return nested;
  }
  return null;
}

export function multiplayerAdapterKind(multiplayer: unknown): string | null {
  return adapterOf(multiplayer)?.kind ?? null;
}

export type ServersPoolConfig = {
  maxServers: number;
  slotsPerServer: number;
  minPlayersToStart?: number;
  adapter: MultiplayerAdapterConfig;
};

export function servers(config: ServersPoolConfig) {
  return config;
}
