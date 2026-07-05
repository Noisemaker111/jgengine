export type MultiplayerTopology = "shared" | "lobbies" | "private";

export type MultiplayerAdapterConfig =
  | { kind: "convex"; topology?: MultiplayerTopology }
  | { kind: "ws"; topology?: MultiplayerTopology }
  | { kind: "offline" };

export function convex(config?: { topology?: MultiplayerTopology }): MultiplayerAdapterConfig {
  return { kind: "convex", topology: config?.topology ?? "shared" };
}

export function ws(config?: { topology?: MultiplayerTopology }): MultiplayerAdapterConfig {
  return { kind: "ws", topology: config?.topology ?? "shared" };
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
