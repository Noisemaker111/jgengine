/**
 * A registration seam for the effect ids that triggered rules reference. Saved content names an
 * effect by id; the game declares what that id means here (label for inspectors, optional param
 * schema note) so authored rules validate against a known vocabulary instead of stringly-invented,
 * un-inspectable callbacks. Mirrors the authored-trigger action registry for editor parity.
 */

import type { PredicateValue } from "./predicate";

/** A declared effect a triggered rule may reference. Behavior lives in the game; this is metadata. */
export interface RuleEffectDefinition {
  /** Effect id used in {@link TriggeredRule.effect} references. */
  id: string;
  /** Human label for debug/inspector surfaces. */
  label?: string;
  /** Default params merged under a rule's own params, for authoring convenience. */
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

/**
 * Every declared rule effect, for populating inspector dropdowns and validating a content set.
 *
 * @capability triggered-rules event-conditioned effects with declarative predicates, lifetimes, and stacking
 */
export function listRuleEffects(): RuleEffectDefinition[] {
  return [...registry.values()];
}

/** Clear the rule-effect registry — tests only. @internal */
export function clearRuleEffects(): void {
  registry.clear();
}
