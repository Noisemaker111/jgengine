/** A player currently joined to a hosted world — the unit a shared-world loop iterates instead of `ctx.player`. */
export interface ConnectedPlayer {
  userId: string;
  isNew: boolean;
}

/**
 * The set of players connected to one hosted world. A single-player game uses `ctx.player`; a shared-world loop
 * reads `ctx.game.players` so `onTick` can advance every connected hero, not just the one local player. The host
 * (`HostedGameRunner`) drives `join`/`leave`; game code reads `list`/`ids`/`has`/`count`.
 */
export interface ConnectedPlayers {
  join(userId: string, isNew: boolean): void;
  leave(userId: string): boolean;
  has(userId: string): boolean;
  get(userId: string): ConnectedPlayer | null;
  list(): readonly ConnectedPlayer[];
  ids(): readonly string[];
  count(): number;
}

/** Build an empty {@link ConnectedPlayers} registry — the host joins/leaves players; the game loop reads them. */
export function createConnectedPlayers(): ConnectedPlayers {
  const players = new Map<string, ConnectedPlayer>();
  return {
    join(userId, isNew) {
      players.set(userId, { userId, isNew });
    },
    leave: (userId) => players.delete(userId),
    has: (userId) => players.has(userId),
    get: (userId) => players.get(userId) ?? null,
    list: () => Array.from(players.values()),
    ids: () => Array.from(players.keys()),
    count: () => players.size,
  };
}
