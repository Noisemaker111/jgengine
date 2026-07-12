export type MultiplayerTopology = "shared" | "lobbies" | "private";

/**
 * Where the world simulation is authoritative. `"client"` (default) keeps the historical model — each client runs
 * its own `onTick` and syncs only presence/feeds/chat. `"server"` opts into host-authoritative replication: the
 * host runs the loop, and the shell mirrors the server's world into the local `ctx` instead of simulating locally.
 */
export type MultiplayerAuthority = "server" | "client";

export type MultiplayerAdapterConfig =
  | { kind: "convex"; topology?: MultiplayerTopology; authority?: MultiplayerAuthority }
  | { kind: "ws"; topology?: MultiplayerTopology; url?: string; authority?: MultiplayerAuthority }
  | { kind: "socketio"; topology?: MultiplayerTopology; url?: string; authority?: MultiplayerAuthority }
  | { kind: "p2p"; topology?: MultiplayerTopology; room?: string; authority?: MultiplayerAuthority }
  | { kind: "lan"; topology?: MultiplayerTopology; port?: number; path?: string; authority?: MultiplayerAuthority }
  | { kind: "offline" };

export function convex(config?: { topology?: MultiplayerTopology; authority?: MultiplayerAuthority }): MultiplayerAdapterConfig {
  return { kind: "convex", topology: config?.topology ?? "shared", authority: config?.authority };
}

export function ws(config?: { topology?: MultiplayerTopology; url?: string; authority?: MultiplayerAuthority }): MultiplayerAdapterConfig {
  return { kind: "ws", topology: config?.topology ?? "shared", url: config?.url, authority: config?.authority };
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
  const adapter = adapterOf(multiplayer);
  return adapter !== null && "authority" in adapter && adapter.authority === "server";
}

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
