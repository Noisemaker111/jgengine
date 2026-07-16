export interface CosmeticLoadoutDef {
  slots: Record<string, string>;
}

export interface CosmeticsChangedEvent {
  userId: string;
  slots: Record<string, string>;
}

export interface CosmeticsEvents {
  emit(name: "cosmetics.changed", payload: CosmeticsChangedEvent): void;
}

export interface CosmeticsDeps {
  events?: CosmeticsEvents;
}

export interface Cosmetics {
  register(defs: Record<string, CosmeticLoadoutDef>): void;
  has(loadoutId: string): boolean;
  apply(userId: string, loadoutId: string): { reason: string } | null;
  equip(userId: string, slot: string, cosmeticId: string | null): void;
  get(userId: string): Readonly<Record<string, string>>;
  snapshot(userId: string): Record<string, string>;
  hydrate(userId: string, state: Record<string, string>): void;
  /** Snapshot every user's equipped slots for a whole-world save. */
  snapshotAll(): Record<string, Record<string, string>>;
  /** Restore every user's equipped slots from a {@link snapshotAll} payload. */
  hydrateAll(state: Record<string, Record<string, string>>): void;
}

const EMPTY_SLOTS: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Equip cosmetic skins and customizations by slot, independent of gameplay stats.
 *
 * @capability cosmetics equip cosmetic skins and customizations by slot
 */
export function createCosmetics(deps: CosmeticsDeps = {}): Cosmetics {
  const definitions = new Map<string, CosmeticLoadoutDef>();
  const equipped = new Map<string, Record<string, string>>();

  function slotsOf(userId: string): Record<string, string> {
    let slots = equipped.get(userId);
    if (slots === undefined) {
      slots = {};
      equipped.set(userId, slots);
    }
    return slots;
  }

  function notify(userId: string): void {
    deps.events?.emit("cosmetics.changed", { userId, slots: { ...slotsOf(userId) } });
  }

  return {
    register(defs) {
      for (const [loadoutId, def] of Object.entries(defs)) definitions.set(loadoutId, def);
    },
    has(loadoutId) {
      return definitions.has(loadoutId);
    },
    apply(userId, loadoutId) {
      const def = definitions.get(loadoutId);
      if (def === undefined) return { reason: `unknown cosmetic loadout "${loadoutId}"` };
      const slots = slotsOf(userId);
      Object.assign(slots, def.slots);
      notify(userId);
      return null;
    },
    equip(userId, slot, cosmeticId) {
      const slots = slotsOf(userId);
      if (cosmeticId === null) delete slots[slot];
      else slots[slot] = cosmeticId;
      notify(userId);
    },
    get(userId) {
      return equipped.get(userId) ?? EMPTY_SLOTS;
    },
    snapshot(userId) {
      return { ...slotsOf(userId) };
    },
    hydrate(userId, state) {
      equipped.set(userId, { ...state });
    },
    snapshotAll() {
      const out: Record<string, Record<string, string>> = {};
      for (const [userId, slots] of equipped) out[userId] = { ...slots };
      return out;
    },
    hydrateAll(state) {
      equipped.clear();
      for (const [userId, slots] of Object.entries(state)) equipped.set(userId, { ...slots });
    },
  };
}
