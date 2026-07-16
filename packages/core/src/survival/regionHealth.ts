import type { Moodle, MoodleSeverity } from "./moodle";

export interface HealthRegionConfig {
  id: string;
  label: string;
  max: number;
  /** A vital part (head, thorax): the entity dies when it empties. Defaults to false. */
  vital?: boolean;
  /** Extra multiplier on incoming damage — a head takes more per hit. Defaults to 1. */
  vulnerability?: number;
}

export interface AilmentConfig {
  id: string;
  label: string;
  /** The part this injury belongs to; drain (bleed) applies here. */
  region?: string;
  severity?: MoodleSeverity;
  icon?: string;
  /** Health lost per game-second per stack while untreated (bleed, infection). */
  drainPerSecond?: number;
  /** Can queue multiple instances (three bleeds stack); otherwise re-applying refreshes. */
  stacking?: boolean;
  /** Treatment item ids that clear this injury — bandage, tourniquet, splint. */
  treatedBy?: readonly string[];
}

export interface MultiRegionHealthConfig {
  regions: readonly HealthRegionConfig[];
  /** Ailment catalog keyed by id — the queue references these. */
  ailments?: Record<string, AilmentConfig>;
}

export interface RegionHealthState {
  id: string;
  label: string;
  current: number;
  max: number;
  fraction: number;
  vital: boolean;
}

export interface AilmentInstance {
  id: string;
  stacks: number;
}

export interface DamageResult {
  region: RegionHealthState;
  /** Damage actually applied after vulnerability. */
  applied: number;
  dead: boolean;
}

export interface TreatResult {
  /** Ailment ids fully or partially cleared by the item. */
  treated: readonly string[];
}

/** Health tracked per body region (head, torso, limbs), each with its own damage, bleed, and treatment state. */
export interface MultiRegionHealth {
  damage(regionId: string, amount: number): DamageResult;
  heal(regionId: string, amount: number): RegionHealthState;
  region(regionId: string): RegionHealthState;
  regions(): RegionHealthState[];
  /** 0..1 aggregate across all parts (share-weighted by max). */
  overall(): number;
  /** Queue an ailment from the catalog; stacking ailments increment, others refresh. */
  applyAilment(ailmentId: string): void;
  /** Clear ailments treated by an item id; one item clears one stack of each match. */
  treat(itemId: string): TreatResult;
  /** Apply ailment drains over game-time `dt`; may kill via a vital part. */
  tick(dt: number): { dead: boolean };
  ailments(): AilmentInstance[];
  /** Wounds as moodles for the shared status stack (#78 shares #90's moodle display). */
  ailmentMoodles(): Moodle[];
  readonly dead: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

interface RegionRuntime {
  config: HealthRegionConfig;
  current: number;
}

/**
 * Per-region/limb health tracked separately, so each body part takes and heals damage on its own.
 *
 * @capability limb-health per-body-part/region health tracked separately
 */
export function createMultiRegionHealth(config: MultiRegionHealthConfig): MultiRegionHealth {
  if (config.regions.length === 0) {
    throw new Error("createMultiRegionHealth: regions must be non-empty");
  }
  const regions = new Map<string, RegionRuntime>();
  const order: string[] = [];
  for (const region of config.regions) {
    regions.set(region.id, { config: region, current: region.max });
    order.push(region.id);
  }
  const catalog = config.ailments ?? {};
  const queue = new Map<string, number>();
  let dead = false;

  const requireRegion = (id: string): RegionRuntime => {
    const runtime = regions.get(id);
    if (runtime === undefined) throw new Error(`unknown health region "${id}"`);
    return runtime;
  };

  const toState = (runtime: RegionRuntime): RegionHealthState => ({
    id: runtime.config.id,
    label: runtime.config.label,
    current: runtime.current,
    max: runtime.config.max,
    fraction: runtime.config.max > 0 ? runtime.current / runtime.config.max : 0,
    vital: runtime.config.vital ?? false,
  });

  const applyDamage = (runtime: RegionRuntime, amount: number): number => {
    const before = runtime.current;
    runtime.current = clamp(runtime.current - amount, 0, runtime.config.max);
    if ((runtime.config.vital ?? false) && runtime.current <= 0) dead = true;
    return before - runtime.current;
  };

  return {
    damage(regionId, amount) {
      const runtime = requireRegion(regionId);
      const scaled = Math.max(0, amount) * (runtime.config.vulnerability ?? 1);
      const applied = applyDamage(runtime, scaled);
      return { region: toState(runtime), applied, dead };
    },
    heal(regionId, amount) {
      const runtime = requireRegion(regionId);
      runtime.current = clamp(runtime.current + Math.max(0, amount), 0, runtime.config.max);
      return toState(runtime);
    },
    region(regionId) {
      return toState(requireRegion(regionId));
    },
    regions() {
      return order.map((id) => toState(regions.get(id)!));
    },
    overall() {
      let current = 0;
      let max = 0;
      for (const runtime of regions.values()) {
        current += runtime.current;
        max += runtime.config.max;
      }
      return max > 0 ? current / max : 0;
    },
    applyAilment(ailmentId) {
      const def = catalog[ailmentId];
      if (def === undefined) throw new Error(`unknown ailment "${ailmentId}"`);
      const current = queue.get(ailmentId) ?? 0;
      queue.set(ailmentId, def.stacking ?? false ? current + 1 : 1);
    },
    treat(itemId) {
      const treated: string[] = [];
      for (const [ailmentId, stacks] of queue) {
        const def = catalog[ailmentId];
        if (def === undefined) continue;
        if (!(def.treatedBy ?? []).includes(itemId)) continue;
        treated.push(ailmentId);
        if (stacks <= 1) queue.delete(ailmentId);
        else queue.set(ailmentId, stacks - 1);
      }
      return { treated };
    },
    tick(dt) {
      if (dt > 0) {
        for (const [ailmentId, stacks] of queue) {
          const def = catalog[ailmentId];
          if (def === undefined || def.drainPerSecond === undefined) continue;
          const target = def.region ?? order[0]!;
          const runtime = regions.get(target);
          if (runtime === undefined) continue;
          applyDamage(runtime, def.drainPerSecond * stacks * dt);
        }
      }
      return { dead };
    },
    ailments() {
      return [...queue].map(([id, stacks]) => ({ id, stacks }));
    },
    ailmentMoodles() {
      const out: Moodle[] = [];
      for (const [ailmentId, stacks] of queue) {
        const def = catalog[ailmentId];
        if (def === undefined) continue;
        const untreated = (def.treatedBy ?? []).length > 0;
        out.push({
          id: ailmentId,
          label: def.label,
          severity: def.severity ?? "warning",
          source: "ailment",
          stacks,
          ...(def.icon === undefined ? {} : { icon: def.icon }),
          ...(untreated ? { note: `needs ${def.treatedBy![0]}` } : {}),
        });
      }
      return out;
    },
    get dead() {
      return dead;
    },
  };
}
