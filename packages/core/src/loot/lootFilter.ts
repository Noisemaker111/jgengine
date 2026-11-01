import { evaluatePredicate, type Predicate } from "../rules/predicate";

export interface LootFilterItem {
  rarity: string;
  baseType: string;
  affixTier?: number;
}

export interface LootFilterRule {
  id: string;
  /** Over the facts `rarity`, `baseType` and `affixTier` (0 when the item has none); omitted matches every item. */
  when?: Predicate;
  hide?: boolean;
  color?: string;
  beam?: boolean;
  label?: string;
}

export interface LootFilterOverride {
  hidden?: boolean;
  color?: string;
  beam?: boolean;
  label?: string;
}

/**
 * First matching rule wins (PoE/Last Epoch block semantics) — later rules
 * never override an earlier match. Returns overrides only; fields the rule
 * doesn't set are left for the caller's baseline (rarity style) to fill in.
 *
 * @capability loot-filter filter and highlight drops by rarity/name rules
 */
export function evaluateLootFilter(
  rules: readonly LootFilterRule[],
  item: LootFilterItem,
): LootFilterOverride {
  const facts = { rarity: item.rarity, baseType: item.baseType, affixTier: item.affixTier ?? 0 };
  for (const rule of rules) {
    if (!evaluatePredicate(rule.when, facts)) continue;
    const override: LootFilterOverride = {};
    if (rule.hide !== undefined) override.hidden = rule.hide;
    if (rule.color !== undefined) override.color = rule.color;
    if (rule.beam !== undefined) override.beam = rule.beam;
    if (rule.label !== undefined) override.label = rule.label;
    return override;
  }
  return {};
}

/** Validating factory — rule ids must be unique so authoring mistakes fail loudly. */
export function lootFilter(rules: readonly LootFilterRule[]): readonly LootFilterRule[] {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new Error(`loot filter rule id "${rule.id}" is duplicated`);
    seen.add(rule.id);
  }
  return rules;
}
