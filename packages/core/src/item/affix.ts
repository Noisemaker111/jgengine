import { pickWeighted } from "../world/scatterItems";

export type AffixOp = "add" | "mul";

export interface AffixDef {
  id: string;
  stat: string;
  op?: AffixOp;
  roll: number | [number, number];
  weight: number;
  namePart?: { position: "prefix" | "suffix"; text: string };
}

export interface AffixPool {
  id: string;
  affixes: readonly AffixDef[];
}

export interface RarityTier {
  id: string;
  weight: number;
  affixCount: number | [number, number];
  statScale?: number;
  namePart?: string;
  pools?: readonly string[];
}

export interface ItemBaseDef {
  id: string;
  name: string;
  baseStats: Record<string, number>;
  pools: readonly string[];
}

export interface RollerConfig {
  pools: readonly AffixPool[];
  rarities: readonly RarityTier[];
}

export interface RolledAffix {
  id: string;
  stat: string;
  op: AffixOp;
  value: number;
}

export interface RolledItem {
  baseId: string;
  rarity: string;
  name: string;
  affixes: readonly RolledAffix[];
  stats: Record<string, number>;
}

export { seededRng } from "../random/rng";

function resolveRoll(roll: number | [number, number], rng: () => number): number {
  if (typeof roll === "number") return roll;
  const [min, max] = roll;
  return min + rng() * (max - min);
}

function resolveCount(count: number | [number, number], rng: () => number): number {
  if (typeof count === "number") return count;
  const [min, max] = count;
  return min + Math.floor(rng() * (max - min + 1));
}

function assertConfig(config: RollerConfig): void {
  if (config.rarities.length === 0) throw new Error("affix roller must have at least one rarity tier");
  for (const tier of config.rarities) {
    if (!(tier.weight > 0)) throw new Error(`rarity "${tier.id}" weight must be positive`);
  }
}

export interface AffixRoller {
  rollRarity(rng: () => number): RarityTier;
  roll(base: ItemBaseDef, rarityId: string, rng: () => number): RolledItem;
  rollRandom(base: ItemBaseDef, rng: () => number): RolledItem;
}

export function createAffixRoller(config: RollerConfig): AffixRoller {
  assertConfig(config);
  const poolById = new Map(config.pools.map((p) => [p.id, p] as const));
  const rarityById = new Map(config.rarities.map((r) => [r.id, r] as const));
  const rarityEntries = config.rarities.map((value) => ({ value, weight: value.weight }));

  function candidatesFor(base: ItemBaseDef, rarity: RarityTier): AffixDef[] {
    const allowed = rarity.pools;
    const out: AffixDef[] = [];
    for (const poolId of base.pools) {
      if (allowed !== undefined && !allowed.includes(poolId)) continue;
      const pool = poolById.get(poolId);
      if (pool === undefined) continue;
      for (const affix of pool.affixes) out.push(affix);
    }
    return out;
  }

  function drawAffixes(candidates: AffixDef[], count: number, rng: () => number): RolledAffix[] {
    const remaining = candidates.slice();
    const drawn: RolledAffix[] = [];
    const target = Math.min(count, remaining.length);
    for (let i = 0; i < target; i++) {
      const picked = pickWeighted(
        remaining.map((value) => ({ value, weight: value.weight })),
        rng(),
      );
      if (picked === null) break;
      remaining.splice(remaining.indexOf(picked), 1);
      drawn.push({ id: picked.id, stat: picked.stat, op: picked.op ?? "add", value: resolveRoll(picked.roll, rng) });
    }
    return drawn;
  }

  function computeStats(base: ItemBaseDef, rarity: RarityTier, affixes: readonly RolledAffix[]): Record<string, number> {
    const scale = rarity.statScale ?? 1;
    const stats: Record<string, number> = {};
    for (const [key, value] of Object.entries(base.baseStats)) stats[key] = value * scale;
    for (const affix of affixes) {
      if (affix.op === "add") stats[affix.stat] = (stats[affix.stat] ?? 0) + affix.value;
    }
    for (const affix of affixes) {
      if (affix.op === "mul") stats[affix.stat] = (stats[affix.stat] ?? 0) * affix.value;
    }
    return stats;
  }

  function composeName(base: ItemBaseDef, rarity: RarityTier, affixes: readonly RolledAffix[]): string {
    const prefix = affixes.find((a) => affixNameFor(a)?.position === "prefix");
    const suffix = affixes.find((a) => affixNameFor(a)?.position === "suffix");
    const parts: string[] = [];
    if (rarity.namePart !== undefined) parts.push(rarity.namePart);
    if (prefix !== undefined) parts.push(affixNameFor(prefix)!.text);
    parts.push(base.name);
    if (suffix !== undefined) parts.push(affixNameFor(suffix)!.text);
    return parts.join(" ");
  }

  const nameByAffixId = new Map<string, { position: "prefix" | "suffix"; text: string }>();
  for (const pool of config.pools) {
    for (const affix of pool.affixes) if (affix.namePart !== undefined) nameByAffixId.set(affix.id, affix.namePart);
  }
  function affixNameFor(affix: RolledAffix): { position: "prefix" | "suffix"; text: string } | undefined {
    return nameByAffixId.get(affix.id);
  }

  return {
    rollRarity(rng) {
      const picked = pickWeighted(rarityEntries, rng());
      return picked ?? config.rarities[config.rarities.length - 1]!;
    },
    roll(base, rarityId, rng) {
      const rarity = rarityById.get(rarityId);
      if (rarity === undefined) throw new Error(`unknown rarity tier: ${rarityId}`);
      const count = resolveCount(rarity.affixCount, rng);
      const affixes = drawAffixes(candidatesFor(base, rarity), count, rng);
      return {
        baseId: base.id,
        rarity: rarity.id,
        name: composeName(base, rarity, affixes),
        affixes,
        stats: computeStats(base, rarity, affixes),
      };
    },
    rollRandom(base, rng) {
      return this.roll(base, this.rollRarity(rng).id, rng);
    },
  };
}
