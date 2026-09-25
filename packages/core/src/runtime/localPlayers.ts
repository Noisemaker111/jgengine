import type { GameContext } from "./gameContext";
import { createInputSnapshot, type InputSnapshot } from "./inputSnapshot";

/** One local seat on a shared screen: a stable slot id, the user id the game spawns for it, and the device driving it. */
export interface LocalPlayerSlot {
  readonly slotId: string;
  readonly index: number;
  readonly userId: string;
  /** Device that claimed the seat (`"gamepad:1"`), `null` for the primary seat before a device claims it. */
  readonly deviceId: string | null;
}

/** Retunable seat policy. */
export interface LocalPlayersConfig {
  /** Seats on this screen, including the primary (default `1`: every device drives the primary player). */
  maxSlots: number;
  /**
   * Whether the first device to press something claims the primary seat alongside keyboard and touch
   * (`"first"`, default), or the primary stays keyboard/touch-only and every pad opens a new seat (`"none"`).
   */
  claimPrimary?: "first" | "none";
}

/** Options for {@link createLocalPlayers}. */
export interface LocalPlayersOptions extends LocalPlayersConfig {
  /** User id of seat 0 — `ctx.player.userId`. */
  primaryUserId: string;
  /** Input of seat 0 — `ctx.input`; other seats get their own snapshot. */
  primaryInput?: InputSnapshot;
  /** User id for seat `index >= 1` (default `` `${primaryUserId}:p${index + 1}` ``). */
  userIdFor?: (index: number) => string;
}

/** Result of {@link LocalPlayers.assign}. */
export interface LocalPlayerAssignment {
  slot: LocalPlayerSlot;
  /** True when this call opened the seat: spawn its entity through `onNewPlayer`. */
  joined: boolean;
}

/** Serializable seat table. */
export interface LocalPlayersSnapshot {
  maxSlots: number;
  claimPrimary: "first" | "none";
  slots: LocalPlayerSlot[];
}

/** Seats for couch co-op: devices hot-join into slots, each slot has its own input. */
export interface LocalPlayers {
  /** Seat for a device that just produced input: its existing seat, the primary seat, a newly opened seat, or `null` when full. */
  assign(deviceId: string): LocalPlayerAssignment | null;
  /** Free a seat other than the primary; its device may hot-join again. */
  release(slotId: string): boolean;
  slots(): readonly LocalPlayerSlot[];
  slot(slotId: string): LocalPlayerSlot | null;
  slotForDevice(deviceId: string): LocalPlayerSlot | null;
  /** The seat's user id and input, or `null` for an unknown seat. Seat 0 returns `ctx.player`'s id and `ctx.input`. */
  local(slotId: string): { userId: string; input: InputSnapshot } | null;
  /** Called after every assign that changes the table, release, restore and retune; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  config(): Required<LocalPlayersConfig>;
  /** Change seat count or claim policy mid-game; seats above a lowered `maxSlots` stay until released. */
  retune(next: LocalPlayersConfig): void;
  snapshot(): LocalPlayersSnapshot;
  restore(snapshot: LocalPlayersSnapshot): void;
}

const PRIMARY_SLOT = "slot:0";

/**
 * Seat table for local multiplayer on one screen.
 * @capability local-players Couch co-op seats: devices hot-join into slots, each with its own user id and input snapshot.
 */
export function createLocalPlayers(options: LocalPlayersOptions): LocalPlayers {
  const userIdFor = options.userIdFor ?? ((index: number) => `${options.primaryUserId}:p${index + 1}`);
  const primaryInput = options.primaryInput ?? createInputSnapshot();
  let config: Required<LocalPlayersConfig> = {
    maxSlots: Math.max(1, Math.floor(options.maxSlots)),
    claimPrimary: options.claimPrimary ?? "first",
  };
  let slots: LocalPlayerSlot[] = [];
  const inputs = new Map<string, InputSnapshot>();
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  const primarySlot = (deviceId: string | null): LocalPlayerSlot =>
    Object.freeze({ slotId: PRIMARY_SLOT, index: 0, userId: options.primaryUserId, deviceId });
  const reset = (next: readonly LocalPlayerSlot[]) => {
    slots = next.map((slot) => Object.freeze({ ...slot }));
    if (!slots.some((slot) => slot.index === 0)) slots.unshift(primarySlot(null));
    slots.sort((a, b) => a.index - b.index);
    for (const slotId of [...inputs.keys()]) {
      if (!slots.some((slot) => slot.slotId === slotId)) inputs.delete(slotId);
    }
  };
  reset([]);

  const inputFor = (slot: LocalPlayerSlot): InputSnapshot => {
    if (slot.index === 0) return primaryInput;
    let input = inputs.get(slot.slotId);
    if (input === undefined) {
      input = createInputSnapshot();
      inputs.set(slot.slotId, input);
    }
    return input;
  };

  return {
    assign(deviceId) {
      const existing = slots.find((slot) => slot.deviceId === deviceId);
      if (existing !== undefined) return { slot: existing, joined: false };
      if (config.claimPrimary === "first" || config.maxSlots === 1) {
        const primary = slots[0]!;
        if (primary.deviceId === null) {
          slots[0] = primarySlot(deviceId);
          changed();
          return { slot: slots[0], joined: false };
        }
        if (config.maxSlots === 1) return { slot: primary, joined: false };
      }
      if (slots.length >= config.maxSlots) return null;
      let index = 1;
      while (slots.some((slot) => slot.index === index)) index += 1;
      const slot: LocalPlayerSlot = Object.freeze({ slotId: `slot:${index}`, index, userId: userIdFor(index), deviceId });
      slots = [...slots, slot].sort((a, b) => a.index - b.index);
      changed();
      return { slot, joined: true };
    },
    release(slotId) {
      if (slotId === PRIMARY_SLOT) return false;
      const next = slots.filter((slot) => slot.slotId !== slotId);
      if (next.length === slots.length) return false;
      slots = next;
      inputs.delete(slotId);
      changed();
      return true;
    },
    slots: () => slots,
    slot: (slotId) => slots.find((slot) => slot.slotId === slotId) ?? null,
    slotForDevice: (deviceId) => slots.find((slot) => slot.deviceId === deviceId) ?? null,
    local(slotId) {
      const slot = slots.find((candidate) => candidate.slotId === slotId);
      return slot === undefined ? null : { userId: slot.userId, input: inputFor(slot) };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    config: () => config,
    retune(next) {
      config = { maxSlots: Math.max(1, Math.floor(next.maxSlots)), claimPrimary: next.claimPrimary ?? config.claimPrimary };
      changed();
    },
    snapshot() {
      return { ...config, slots: slots.map((slot) => ({ ...slot })) };
    },
    restore(snapshot) {
      config = { maxSlots: Math.max(1, Math.floor(snapshot.maxSlots)), claimPrimary: snapshot.claimPrimary };
      reset(snapshot.slots);
      changed();
    },
  };
}

const LOCAL_PLAYERS = new WeakMap<GameContext, LocalPlayers>();

/**
 * The seat table of a game context, created on first use with one seat for `ctx.player` and `ctx.input`.
 * The shell retunes it from `defineGame({ localPlayers })` and hot-joins pads into it.
 */
export function localPlayers(ctx: GameContext): LocalPlayers {
  let players = LOCAL_PLAYERS.get(ctx);
  if (players === undefined) {
    players = createLocalPlayers({ maxSlots: 1, primaryUserId: ctx.player.userId, primaryInput: ctx.input });
    LOCAL_PLAYERS.set(ctx, players);
  }
  return players;
}
