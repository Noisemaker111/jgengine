import type { InputFrame } from "../runtime/inputSnapshot";

/** A player currently joined to a hosted world — the unit a shared-world loop iterates instead of `ctx.player`. Frozen by the registry (see {@link ConnectedPlayers.get}); fields are `readonly` so a caller can't edit its own copy and assume the change stuck. */
export interface ConnectedPlayer {
  readonly userId: string;
  readonly isNew: boolean;
  readonly input: InputFrame | null;
}

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
  setInput(userId: string, frame: InputFrame): void;
  input(userId: string): InputFrame | null;
}

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
