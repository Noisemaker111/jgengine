export type MultiplayerTopology = "shared" | "lobbies" | "private";

export type MultiplayerAdapterConfig =
  | { kind: "convex"; topology?: MultiplayerTopology }
  | { kind: "ws"; topology?: MultiplayerTopology; url?: string }
  | { kind: "socketio"; topology?: MultiplayerTopology; url?: string }
  | { kind: "p2p"; topology?: MultiplayerTopology; room?: string }
  | { kind: "lan"; topology?: MultiplayerTopology; port?: number; path?: string }
  | { kind: "offline" };

export function convex(config?: { topology?: MultiplayerTopology }): MultiplayerAdapterConfig {
  return { kind: "convex", topology: config?.topology ?? "shared" };
}

export function ws(config?: { topology?: MultiplayerTopology; url?: string }): MultiplayerAdapterConfig {
  return { kind: "ws", topology: config?.topology ?? "shared", url: config?.url };
}

export function fly(config: { app: string; topology?: MultiplayerTopology; path?: string }): MultiplayerAdapterConfig {
  return {
    kind: "ws",
    topology: config.topology ?? "shared",
    url: `wss://${config.app}.fly.dev${config.path ?? "/ws"}`,
  };
}

export function socketIo(config?: { topology?: MultiplayerTopology; url?: string }): MultiplayerAdapterConfig {
  return { kind: "socketio", topology: config?.topology ?? "shared", url: config?.url };
}

export function p2p(config?: { topology?: MultiplayerTopology; room?: string }): MultiplayerAdapterConfig {
  return { kind: "p2p", topology: config?.topology ?? "private", room: config?.room };
}

export function lan(config?: {
  topology?: MultiplayerTopology;
  port?: number;
  path?: string;
}): MultiplayerAdapterConfig {
  return { kind: "lan", topology: config?.topology ?? "shared", port: config?.port, path: config?.path };
}

export function offline(): MultiplayerAdapterConfig {
  return { kind: "offline" };
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
