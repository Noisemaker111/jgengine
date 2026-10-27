import type { WorldSolid } from "../world/worldSolids";

/** One difficulty of a summoned boss: the survivor level it asks for and the tribute it eats. */
export interface BossArenaTier {
  id: string;
  /** Survivor level the summoner needs. */
  minLevel: number;
  /** Item id → count the summon takes from the summoner. */
  tribute: Readonly<Record<string, number>>;
}

/** How a summoned boss fight runs: tiers, the portal, who may come in, and how long the winners stay. */
export interface BossArenaOptions {
  tiers: readonly BossArenaTier[];
  /** Seconds the portal counts down before it takes everyone in range. Default `25`. */
  portalSeconds?: number;
  /** Survivors one fight admits. Default `10`. */
  maxSurvivors?: number;
  /** Companions (tames, pets, summons) one fight admits. Default `20`. */
  maxCompanions?: number;
  /** Companions heavier than this stay behind (ARK's drag weight). Default: no limit. */
  maxCompanionWeight?: number;
  /** Seconds the winners stay in the arena before they are sent back. Default `60`. */
  victorySeconds?: number;
  /** Seconds before an unfinished fight is lost. Default: no limit. */
  timeLimitSeconds?: number;
}

/** Where a fight stands: nothing summoned, the portal counting down, the fight, or the winners' wait. */
export type BossArenaPhase = "idle" | "portal" | "fight" | "victory";

/** Someone the portal could take in: a survivor, or a companion, and where they stood to be sent back to. */
export interface ArenaCandidate {
  id: string;
  kind: "survivor" | "companion";
  /** Where they stood when taken; they go back here. */
  at: readonly [number, number, number];
  /** A companion's weight, checked against `maxCompanionWeight`. */
  weight?: number;
}

/** Serializable fight state. */
export interface BossArenaState {
  phase: BossArenaPhase;
  tier: string | null;
  /** Game time the portal closes or the winners' wait ends; null otherwise. */
  until: number | null;
  /** Game time the fight began; null outside a fight. */
  startedAt: number | null;
  survivors: string[];
  companions: string[];
  /** Id → where it is sent back to. */
  returns: Record<string, readonly [number, number, number]>;
}

/** What a tribute check found: what is missing, and how many levels short the summoner is. */
export interface TributeCheck {
  ok: boolean;
  missing: { item: string; need: number; have: number }[];
  levelShort: number;
}

/** What the summoner carries, for a tribute: how many of an item, and taking them. */
export interface TributeSource {
  count(item: string): number;
  take(item: string, count: number): void;
}

/** Who goes back where, when a fight ends. */
export interface ArenaReturn {
  id: string;
  kind: "survivor" | "companion";
  to: readonly [number, number, number];
}

/** Things that happened on one step of the arena clock. */
export type BossArenaEvent =
  /** The portal took everyone in range in; the game moves them and spawns the boss. */
  | { type: "entered"; tier: string; admitted: ArenaCandidate[]; refused: { id: string; reason: "full" | "heavy" }[] }
  /** The portal closed with no survivor in range: the tribute is gone, as in ARK. */
  | { type: "closed"; tier: string }
  | { type: "won"; tier: string; survivors: string[]; companions: string[] }
  /** Every survivor is gone, or time ran out: the companions left inside are lost with the fight. */
  | { type: "lost"; tier: string; reason: "wiped" | "time"; companions: string[] }
  /** The winners' wait is over: send each back where they came from. */
  | { type: "returned"; tier: string; returns: ArenaReturn[] };

/** What the arena clock asks the game each step. */
export interface BossArenaHooks {
  /** Whether the boss still lives. */
  bossAlive(): boolean;
  /** Everyone in the portal's range right now: read when it closes. */
  gather(): readonly ArenaCandidate[];
}

/** A summoned boss fight: tribute, portal, the fight, the winners' wait, the trip home. */
export interface BossArena {
  /** Whether a summoner with these items and level could summon `tier` now. */
  check(tier: string, have: (item: string) => number, level: number): TributeCheck;
  /** Take the tribute and open the portal. Fails without taking anything when the arena is busy or a tribute or level is short. */
  summon(tier: string, from: TributeSource, level: number, now: number): { ok: true } | { ok: false; reason: "busy" | "unknown" | "tribute"; check?: TributeCheck };
  /** Advance the clock. */
  tick(now: number, hooks: BossArenaHooks): BossArenaEvent[];
  /** Someone left the fight (a survivor died, a companion was killed): they are no longer sent back. */
  leave(id: string): void;
  /** Whether `id` is in the fight now. */
  inside(id: string): boolean;
  /** Seconds left on the portal or the winners' wait or the time limit; null when nothing counts down. */
  secondsLeft(now: number): number | null;
  state(): Readonly<BossArenaState>;
  snapshot(): BossArenaState;
  restore(state: BossArenaState): void;
  reset(): void;
}

const DEFAULTS = { portalSeconds: 25, maxSurvivors: 10, maxCompanions: 20, victorySeconds: 60 };

function idle(): BossArenaState {
  return { phase: "idle", tier: null, until: null, startedAt: null, survivors: [], companions: [], returns: {} };
}

/**
 * A summoned boss fight as ARK runs its obelisk bosses. The summoner pays a tier's tribute (and needs
 * its level); a portal counts down, then takes every survivor and companion in range up to the caps
 * into the arena, each remembered where they stood. The fight is won when the boss dies, after which
 * the winners stay `victorySeconds` and are sent back; it is lost when no survivor is left inside (or
 * time runs out), and the companions still inside are lost with it. The game owns the bodies,
 * teleports and the boss; this owns the rules and the clock. Deterministic in `now`; serializable.
 *
 * @capability boss-arena summoned boss fights: tribute and level gates, a portal that takes survivors and companions in, win, wipe and the trip home
 */
export function createBossArena(options: BossArenaOptions): BossArena {
  const tiers = new Map(options.tiers.map((tier) => [tier.id, tier]));
  if (tiers.size !== options.tiers.length) throw new Error("boss arena tier ids must be unique");
  const portalSeconds = options.portalSeconds ?? DEFAULTS.portalSeconds;
  const maxSurvivors = options.maxSurvivors ?? DEFAULTS.maxSurvivors;
  const maxCompanions = options.maxCompanions ?? DEFAULTS.maxCompanions;
  const victorySeconds = options.victorySeconds ?? DEFAULTS.victorySeconds;
  let state = idle();

  function check(tierId: string, have: (item: string) => number, level: number): TributeCheck {
    const tier = tiers.get(tierId);
    if (tier === undefined) return { ok: false, missing: [], levelShort: 0 };
    const missing = Object.entries(tier.tribute)
      .map(([item, need]) => ({ item, need, have: have(item) }))
      .filter((entry) => entry.have < entry.need);
    const levelShort = Math.max(0, tier.minLevel - level);
    return { ok: missing.length === 0 && levelShort === 0, missing, levelShort };
  }

  function admit(candidates: readonly ArenaCandidate[]) {
    const admitted: ArenaCandidate[] = [];
    const refused: { id: string; reason: "full" | "heavy" }[] = [];
    let survivors = 0;
    let companions = 0;
    for (const candidate of candidates) {
      if (candidate.kind === "survivor") {
        if (survivors >= maxSurvivors) refused.push({ id: candidate.id, reason: "full" });
        else {
          survivors += 1;
          admitted.push(candidate);
        }
        continue;
      }
      if (options.maxCompanionWeight !== undefined && (candidate.weight ?? 0) > options.maxCompanionWeight) refused.push({ id: candidate.id, reason: "heavy" });
      else if (companions >= maxCompanions) refused.push({ id: candidate.id, reason: "full" });
      else {
        companions += 1;
        admitted.push(candidate);
      }
    }
    return { admitted, refused };
  }

  return {
    check,
    summon(tierId, from, level, now) {
      if (state.phase !== "idle") return { ok: false, reason: "busy" };
      const tier = tiers.get(tierId);
      if (tier === undefined) return { ok: false, reason: "unknown" };
      const result = check(tierId, (item) => from.count(item), level);
      if (!result.ok) return { ok: false, reason: "tribute", check: result };
      for (const [item, count] of Object.entries(tier.tribute)) from.take(item, count);
      state = { ...idle(), phase: "portal", tier: tierId, until: now + portalSeconds };
      return { ok: true };
    },
    tick(now, hooks) {
      const tier = state.tier;
      if (tier === null) return [];
      if (state.phase === "portal" && now >= (state.until ?? now)) {
        const { admitted, refused } = admit(hooks.gather());
        if (!admitted.some((candidate) => candidate.kind === "survivor")) {
          state = idle();
          return [{ type: "closed", tier }];
        }
        state = {
          phase: "fight",
          tier,
          until: null,
          startedAt: now,
          survivors: admitted.filter((entry) => entry.kind === "survivor").map((entry) => entry.id),
          companions: admitted.filter((entry) => entry.kind === "companion").map((entry) => entry.id),
          returns: Object.fromEntries(admitted.map((entry) => [entry.id, [entry.at[0], entry.at[1], entry.at[2]] as const])),
        };
        return [{ type: "entered", tier, admitted, refused }];
      }
      if (state.phase === "fight") {
        if (!hooks.bossAlive()) {
          state = { ...state, phase: "victory", until: now + victorySeconds };
          return [{ type: "won", tier, survivors: [...state.survivors], companions: [...state.companions] }];
        }
        const timedOut = options.timeLimitSeconds !== undefined && now - (state.startedAt ?? now) >= options.timeLimitSeconds;
        if (state.survivors.length === 0 || timedOut) {
          const companions = [...state.companions];
          state = idle();
          return [{ type: "lost", tier, reason: timedOut ? "time" : "wiped", companions }];
        }
        return [];
      }
      if (state.phase === "victory" && now >= (state.until ?? now)) {
        const kinds = new Map<string, "survivor" | "companion">([...state.survivors.map((id) => [id, "survivor"] as const), ...state.companions.map((id) => [id, "companion"] as const)]);
        const returns = [...kinds].flatMap(([id, kind]) => {
          const to = state.returns[id];
          return to === undefined ? [] : [{ id, kind, to }];
        });
        state = idle();
        return [{ type: "returned", tier, returns }];
      }
      return [];
    },
    leave(id) {
      state = {
        ...state,
        survivors: state.survivors.filter((entry) => entry !== id),
        companions: state.companions.filter((entry) => entry !== id),
        returns: Object.fromEntries(Object.entries(state.returns).filter(([entry]) => entry !== id)),
      };
    },
    inside(id) {
      return (state.phase === "fight" || state.phase === "victory") && (state.survivors.includes(id) || state.companions.includes(id));
    },
    secondsLeft(now) {
      if (state.until !== null) return Math.max(0, state.until - now);
      if (state.phase === "fight" && options.timeLimitSeconds !== undefined) return Math.max(0, (state.startedAt ?? now) + options.timeLimitSeconds - now);
      return null;
    },
    state: () => state,
    snapshot: () => structuredClone(state),
    restore(saved) {
      state = { ...idle(), ...structuredClone(saved) };
    },
    reset() {
      state = idle();
    },
  };
}

/** Where the arena stands in the world and how high its walls rise. */
export interface ArenaWallOptions {
  center: readonly [number, number];
  /** Radius of the open floor inside the wall, metres. */
  radius: number;
  height: number;
  /** Wall thickness, metres. Default `4`. */
  thickness?: number;
  /** Straight pieces round the ring. Default `32`. */
  sides?: number;
  /** Ground height under a point; the wall stands on the lowest ground of each piece. */
  ground: (x: number, z: number) => number;
}

/**
 * The ring wall that keeps a fight in its arena: `sides` solid slabs round the floor, each standing on
 * the lowest ground under it so no gap opens on a slope. Feed it to `ctx.world.solids.set`.
 *
 * @capability arena-wall solid ring wall round a circular arena floor, following the ground
 */
export function arenaWall(options: ArenaWallOptions): WorldSolid[] {
  const thickness = options.thickness ?? 4;
  const sides = Math.max(3, Math.round(options.sides ?? 32));
  const ring = options.radius + thickness / 2;
  // Each slab spans its side plus a little, so the corners close.
  const length = 2 * ring * Math.tan(Math.PI / sides) + thickness * 0.5;
  const out: WorldSolid[] = [];
  for (let side = 0; side < sides; side += 1) {
    const angle = ((side + 0.5) / sides) * Math.PI * 2;
    const x = options.center[0] + Math.cos(angle) * ring;
    const z = options.center[1] + Math.sin(angle) * ring;
    const along = [-Math.sin(angle), Math.cos(angle)] as const;
    const half = length / 2;
    const base = Math.min(options.ground(x, z), options.ground(x + along[0] * half, z + along[1] * half), options.ground(x - along[0] * half, z - along[1] * half));
    out.push({
      center: [x, base + options.height / 2 - 1, z],
      halfExtents: [half, options.height / 2 + 1, thickness / 2],
      // Local x runs along the slab: rotationY maps local +x to (cos, -sin) in XZ.
      rotationY: -Math.atan2(along[1], along[0]),
    });
  }
  return out;
}
