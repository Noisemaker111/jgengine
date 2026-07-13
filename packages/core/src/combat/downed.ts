export type DownedPhase = "alive" | "downed" | "dead";

export interface DownedConfig {
  bleedoutSeconds: number;
  reviveSeconds?: number;
  reviveHealthFraction?: number;
  banner?: { expireSeconds: number };
}

export interface DownedEntry {
  phase: DownedPhase;
  bleedoutRemaining: number;
  reviveProgress: number;
  bannerRemaining: number | null;
}

export type DownedEventKind =
  | "downed"
  | "revived"
  | "reviving"
  | "died"
  | "banner.created"
  | "banner.expired"
  | "respawned";

export interface DownedEvent {
  kind: DownedEventKind;
  instanceId: string;
  reason?: string;
  reviveHealthFraction?: number;
}

export interface DownedState {
  down(instanceId: string): DownedEvent | null;
  revive(instanceId: string, dt: number): DownedEvent | null;
  interruptRevive(instanceId: string): void;
  finish(instanceId: string, reason?: string): DownedEvent | null;
  tick(dt: number): DownedEvent[];
  respawnFromBanner(instanceId: string): DownedEvent | null;
  phase(instanceId: string): DownedPhase;
  get(instanceId: string): DownedEntry | null;
  clear(instanceId: string): void;
  snapshot(): Record<string, DownedEntry>;
}

/**
 * A downed/bleed-out state that ticks toward death and that teammates can revive before the timer runs out.
 *
 * @capability downed-revive a downed/bleed-out state teammates can revive before death
 */
export function createDownedState(config: DownedConfig): DownedState {
  const bleedoutSeconds = Math.max(0, config.bleedoutSeconds);
  const reviveSeconds = config.reviveSeconds !== undefined ? Math.max(0, config.reviveSeconds) : 0;
  const reviveHealthFraction = config.reviveHealthFraction ?? 1;
  const bannerSeconds = config.banner?.expireSeconds;

  const entries = new Map<string, DownedEntry>();

  function toDead(instanceId: string, entry: DownedEntry, reason: string, events: DownedEvent[]): void {
    entry.phase = "dead";
    entry.bleedoutRemaining = 0;
    entry.reviveProgress = 0;
    events.push({ kind: "died", instanceId, reason });
    if (bannerSeconds !== undefined) {
      entry.bannerRemaining = bannerSeconds;
      events.push({ kind: "banner.created", instanceId });
    } else {
      entry.bannerRemaining = null;
    }
  }

  return {
    down(instanceId) {
      const existing = entries.get(instanceId);
      if (existing !== undefined && existing.phase === "downed") return null;
      entries.set(instanceId, {
        phase: "downed",
        bleedoutRemaining: bleedoutSeconds,
        reviveProgress: 0,
        bannerRemaining: null,
      });
      return { kind: "downed", instanceId };
    },
    revive(instanceId, dt) {
      const entry = entries.get(instanceId);
      if (entry === undefined || entry.phase !== "downed" || dt <= 0) return null;
      entry.reviveProgress += dt;
      if (entry.reviveProgress >= reviveSeconds) {
        entry.phase = "alive";
        entry.reviveProgress = 0;
        entry.bleedoutRemaining = 0;
        return { kind: "revived", instanceId, reviveHealthFraction };
      }
      return { kind: "reviving", instanceId };
    },
    interruptRevive(instanceId) {
      const entry = entries.get(instanceId);
      if (entry !== undefined && entry.phase === "downed") entry.reviveProgress = 0;
    },
    finish(instanceId, reason) {
      const entry = entries.get(instanceId);
      if (entry === undefined || entry.phase !== "downed") return null;
      const events: DownedEvent[] = [];
      toDead(instanceId, entry, reason ?? "finished", events);
      return events[0] ?? null;
    },
    tick(dt) {
      if (dt <= 0) return [];
      const events: DownedEvent[] = [];
      for (const [instanceId, entry] of entries) {
        if (entry.phase === "downed") {
          entry.bleedoutRemaining -= dt;
          if (entry.bleedoutRemaining <= 0) toDead(instanceId, entry, "bleedout", events);
        } else if (entry.phase === "dead" && entry.bannerRemaining !== null) {
          entry.bannerRemaining -= dt;
          if (entry.bannerRemaining <= 0) {
            entry.bannerRemaining = null;
            events.push({ kind: "banner.expired", instanceId });
          }
        }
      }
      return events;
    },
    respawnFromBanner(instanceId) {
      const entry = entries.get(instanceId);
      if (entry === undefined || entry.phase !== "dead" || entry.bannerRemaining === null) return null;
      entry.phase = "alive";
      entry.bannerRemaining = null;
      entry.bleedoutRemaining = 0;
      entry.reviveProgress = 0;
      return { kind: "respawned", instanceId, reviveHealthFraction };
    },
    phase: (instanceId) => entries.get(instanceId)?.phase ?? "alive",
    get: (instanceId) => {
      const entry = entries.get(instanceId);
      return entry === undefined ? null : { ...entry };
    },
    clear: (instanceId) => {
      entries.delete(instanceId);
    },
    snapshot: () => {
      const out: Record<string, DownedEntry> = {};
      for (const [instanceId, entry] of entries) out[instanceId] = { ...entry };
      return out;
    },
  };
}
