/**
 * A registration seam for the effect ids that triggered rules reference. Saved content names an
 * effect by id; the game declares what that id means here (label for inspectors, optional param
 * schema note) so authored rules validate against a known vocabulary instead of stringly-invented,
 * un-inspectable callbacks. Mirrors the authored-trigger action registry for editor parity.
 */

import type { PredicateValue } from "./predicate";

export interface RuleEffectDefinition {
  id: string;
  label?: string;
  defaults?: Readonly<Record<string, PredicateValue>>;
}

const registry = new Map<string, RuleEffectDefinition>();

/**
 * Declare a rule effect id. Idempotent per id (last registration wins); call at module load next to
 * catalogs so authored content and inspectors share one vocabulary.
 *
 * @capability triggered-rules event-conditioned effects with declarative predicates, lifetimes, and stacking
 */
export function registerRuleEffect(definition: RuleEffectDefinition): void {
  registry.set(definition.id, definition);
}

/**
 * Look up a declared rule effect, or `undefined` when the id was never registered — lets callers
 * reject unknown effect references in authored content.
 *
 * @capability triggered-rules event-conditioned effects with declarative predicates, lifetimes, and stacking
 */
export function getRuleEffect(id: string): RuleEffectDefinition | undefined {
  return registry.get(id);
}

/** @capability triggered-rules event-conditioned effects with declarative predicates, lifetimes, and stacking */
export function listRuleEffects(): RuleEffectDefinition[] {
  return [...registry.values()];
}

/** @internal */
export function clearRuleEffects(): void {
  registry.clear();
}
