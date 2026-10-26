export interface LootFilterItem {
  rarity: string;
  baseType: string;
  affixTier?: number;
}

export interface LootFilterCondition {
  rarity?: string | readonly string[];
  baseType?: string | readonly string[];
  minAffixTier?: number;
  maxAffixTier?: number;
}

export interface LootFilterRule {
  id: string;
  when: LootFilterCondition;
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

function matchesOneOf(value: string, expected: string | readonly string[] | undefined): boolean {
  if (expected === undefined) return true;
  return typeof expected === "string" ? expected === value : expected.includes(value);
}

function matchesCondition(when: LootFilterCondition, item: LootFilterItem): boolean {
  if (!matchesOneOf(item.rarity, when.rarity)) return false;
  if (!matchesOneOf(item.baseType, when.baseType)) return false;
  if (when.minAffixTier !== undefined && (item.affixTier ?? 0) < when.minAffixTier) return false;
  if (when.maxAffixTier !== undefined && (item.affixTier ?? 0) > when.maxAffixTier) return false;
  return true;
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
  for (const rule of rules) {
    if (!matchesCondition(rule.when, item)) continue;
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
