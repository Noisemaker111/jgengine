import type { InputFrame } from "../runtime/inputSnapshot";

/** A player currently joined to a hosted world — the unit a shared-world loop iterates instead of `ctx.player`. Frozen by the registry (see {@link ConnectedPlayers.get}); fields are `readonly` so a caller can't edit its own copy and assume the change stuck. */
export interface ConnectedPlayer {
  readonly userId: string;
  readonly isNew: boolean;
  /** This player's latest {@link InputFrame}, written by the host each time the client sends input; `null` until the first frame arrives. The per-player movement seam reads it in `onTick`. */
  readonly input: InputFrame | null;
}

/**
 * The set of players connected to one hosted world. A single-player game uses `ctx.player`; a shared-world loop
 * reads `ctx.game.players` so `onTick` can advance every connected hero, not just the one local player. The host
 * (`HostedGameRunner`) drives `join`/`leave`/`setInput`; game code reads `list`/`ids`/`has`/`count`/`input`.
 */
export interface ConnectedPlayers {
  join(userId: string, isNew: boolean): void;
  leave(userId: string): boolean;
  has(userId: string): boolean;
  /** Returns a frozen `ConnectedPlayer` — mutating it (or reassigning `.input`) throws instead of corrupting the registry. */
  get(userId: string): ConnectedPlayer | null;
  /** Frozen `ConnectedPlayer` entries, same immutability contract as {@link get}. */
  list(): readonly ConnectedPlayer[];
  ids(): readonly string[];
  count(): number;
  /** Record a player's latest input frame (host-driven); a no-op for a player that hasn't joined. */
  setInput(userId: string, frame: InputFrame): void;
  /** This player's latest input frame, or `null` if they haven't joined or no frame has arrived yet. */
  input(userId: string): InputFrame | null;
}

/** Build an empty {@link ConnectedPlayers} registry — the host joins/leaves players; the game loop reads them. */
export function createConnectedPlayers(): ConnectedPlayers {
  const players = new Map<string, ConnectedPlayer>();
  return {
    join(userId, isNew) {
      players.set(userId, Object.freeze({ userId, isNew, input: null }));
    },
    leave: (userId) => players.delete(userId),
    has: (userId) => players.has(userId),
    get: (userId) => players.get(userId) ?? null,
    list: () => Array.from(players.values()),
    ids: () => Array.from(players.keys()),
    count: () => players.size,
    setInput(userId, frame) {
      const player = players.get(userId);
      if (player !== undefined) players.set(userId, Object.freeze({ ...player, input: frame }));
    },
    input: (userId) => players.get(userId)?.input ?? null,
  };
}
