export type FactionRelation = "hostile" | "neutral" | "friendly";

export interface FactionDef {
  id: string;
  relations?: Readonly<Record<string, FactionRelation>>;
  towardSelf?: FactionRelation;
  towardOthers?: FactionRelation;
}

export interface FactionGraphConfig {
  factions: readonly FactionDef[];
  symmetric?: boolean;
  unaligned?: FactionRelation;
}

export interface FactionGraph {
  relationBetween(observer: string | null | undefined, other: string | null | undefined): FactionRelation;
  isHostile(observer: string | null | undefined, other: string | null | undefined): boolean;
  isFriendly(observer: string | null | undefined, other: string | null | undefined): boolean;
  isNeutral(observer: string | null | undefined, other: string | null | undefined): boolean;
  has(factionId: string): boolean;
  ids(): string[];
}

export function createFactionGraph(config: FactionGraphConfig): FactionGraph {
  const symmetric = config.symmetric ?? true;
  const unaligned = config.unaligned ?? "neutral";
  const defs = new Map<string, FactionDef>();
  for (const def of config.factions) defs.set(def.id, def);

  function relationBetween(observer: string | null | undefined, other: string | null | undefined): FactionRelation {
    if (observer == null || other == null) return unaligned;
    const from = defs.get(observer);
    const to = defs.get(other);
    if (from === undefined || to === undefined) return unaligned;
    if (observer === other) return from.towardSelf ?? "friendly";
    const direct = from.relations?.[other];
    if (direct !== undefined) return direct;
    if (symmetric) {
      const mirrored = to.relations?.[observer];
      if (mirrored !== undefined) return mirrored;
    }
    return from.towardOthers ?? "neutral";
  }

  return {
    relationBetween,
    isHostile: (observer, other) => relationBetween(observer, other) === "hostile",
    isFriendly: (observer, other) => relationBetween(observer, other) === "friendly",
    isNeutral: (observer, other) => relationBetween(observer, other) === "neutral",
    has: (factionId) => defs.has(factionId),
    ids: () => [...defs.keys()],
  };
}

export interface FactionRoster {
  assign(entityId: string, factionId: string | null): void;
  factionOf(entityId: string): string | null;
  relationBetweenEntities(observer: string, other: string): FactionRelation;
  isHostile(observer: string, other: string): boolean;
  isFriendly(observer: string, other: string): boolean;
  members(factionId: string): string[];
  hostilesOf(observer: string, candidates: Iterable<string>): string[];
  remove(entityId: string): void;
  clear(): void;
}

export function createFactionRoster(graph: FactionGraph): FactionRoster {
  const membership = new Map<string, string>();

  function factionOf(entityId: string): string | null {
    return membership.get(entityId) ?? null;
  }

  function relationBetweenEntities(observer: string, other: string): FactionRelation {
    return graph.relationBetween(factionOf(observer), factionOf(other));
  }

  return {
    assign(entityId, factionId) {
      if (factionId === null) membership.delete(entityId);
      else membership.set(entityId, factionId);
    },
    factionOf,
    relationBetweenEntities,
    isHostile: (observer, other) => relationBetweenEntities(observer, other) === "hostile",
    isFriendly: (observer, other) => relationBetweenEntities(observer, other) === "friendly",
    members(factionId) {
      const out: string[] = [];
      for (const [entityId, id] of membership) if (id === factionId) out.push(entityId);
      return out;
    },
    hostilesOf(observer, candidates) {
      const out: string[] = [];
      for (const id of candidates) {
        if (id !== observer && relationBetweenEntities(observer, id) === "hostile") out.push(id);
      }
      return out;
    },
    remove(entityId) {
      membership.delete(entityId);
    },
    clear() {
      membership.clear();
    },
  };
}
