import type { GameContext } from "./gameContext";
import { createInputSnapshot, type InputSnapshot } from "./inputSnapshot";
import { ContextMap } from "@jgengine/core/runtime/contextIdentity";

export interface LocalPlayerSlot {
  readonly slotId: string;
  readonly index: number;
  readonly userId: string;
  readonly deviceId: string | null;
}

export interface LocalPlayersConfig {
  maxSlots: number;
  claimPrimary?: "first" | "none";
}

export interface LocalPlayersOptions extends LocalPlayersConfig {
  primaryUserId: string;
  primaryInput?: InputSnapshot;
  userIdFor?: (index: number) => string;
}

export interface LocalPlayerAssignment {
  slot: LocalPlayerSlot;
  joined: boolean;
}

export interface LocalPlayersSnapshot {
  maxSlots: number;
  claimPrimary: "first" | "none";
  slots: LocalPlayerSlot[];
}

export interface LocalPlayers {
  assign(deviceId: string): LocalPlayerAssignment | null;
  release(slotId: string): boolean;
  slots(): readonly LocalPlayerSlot[];
  slot(slotId: string): LocalPlayerSlot | null;
  slotForDevice(deviceId: string): LocalPlayerSlot | null;
  local(slotId: string): { userId: string; input: InputSnapshot } | null;
  subscribe(listener: () => void): () => void;
  config(): Required<LocalPlayersConfig>;
  retune(next: LocalPlayersConfig): void;
  snapshot(): LocalPlayersSnapshot;
  restore(snapshot: LocalPlayersSnapshot): void;
}

const PRIMARY_SLOT = "slot:0";

/** @capability local-players Couch co-op seats: devices hot-join into slots, each with its own user id and input snapshot. */
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

const LOCAL_PLAYERS = new ContextMap<LocalPlayers>();

export function localPlayers(ctx: GameContext): LocalPlayers {
  let players = LOCAL_PLAYERS.get(ctx);
  if (players === undefined) {
    players = createLocalPlayers({ maxSlots: 1, primaryUserId: ctx.player.userId, primaryInput: ctx.input });
    LOCAL_PLAYERS.set(ctx, players);
  }
  return players;
}
