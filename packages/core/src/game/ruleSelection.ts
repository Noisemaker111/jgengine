/**
 * Seeded rule selection over a tagged pool.
 *
 * A {@link RuleDef} is a caller-owned selectable — a mutator, game mode, event, or challenge modifier
 * — carrying tags, an optional weight, compatibility (`requires`) and exclusion (`conflicts`)
 * constraints, and any {@link ParamLayer}s it contributes when active. {@link selectRules} draws a
 * requested count from the eligible pool using injected, deterministic randomness: the same seed and
 * pool always yield the same rules, so a host can reproduce a session from `{ seed, count }` alone and
 * every peer agrees without replicating the roll.
 *
 * Core never branches on known rule names — selection is driven entirely by tags and the caller's
 * constraint data, and a selected rule's behavior is read back through its `layers`/`payload`. That
 * keeps the seam genre-agnostic and lets games install rules through {@link createRuleRegistry}
 * without the primitive knowing what any mutator "means".
 */
import { pickWeighted } from "../random/pick";
import { seededStreams } from "../random/rng";
import { type ParamLayer, type LayerSelection } from "./paramLayers";

/**
 * A selectable rule over a tagged pool. `tags` classify it for include/exclude filtering and for
 * `requires`/`conflicts` matching (which match either another rule's id or one of its tags). `layers`
 * are the parameter layers this rule contributes when active; `payload` is opaque caller data.
 */
export interface RuleDef<TPayload = unknown> {
  readonly id: string;
  readonly tags?: readonly string[];
  /** Relative pick weight; non-positive or omitted is treated as `1`. */
  readonly weight?: number;
  /** Ids/tags that must already be selected for this rule to become eligible. */
  readonly requires?: readonly string[];
  /** Ids/tags that, if already selected (either direction), make this rule ineligible. */
  readonly conflicts?: readonly string[];
  /** Parameter layers contributed when this rule is active, read back via {@link RuleRegistry.layersFor}. */
  readonly layers?: readonly ParamLayer[];
  readonly payload?: TPayload;
}

/** Deterministic selection inputs — plain serializable data a host can persist and replay. */
export interface RuleSelectionConfig {
  readonly count: number;
  readonly seed: string | number;
  /** If set, only rules carrying at least one of these tags are eligible. */
  readonly includeTags?: readonly string[];
  /** Rules carrying any of these tags are excluded outright. */
  readonly excludeTags?: readonly string[];
  /** Rule ids force-selected first, in order; counts toward `count`. Unknown ids are ignored. */
  readonly locked?: readonly string[];
}

/** The result of a selection — the chosen rules and their ids (a serializable {@link LayerSelection}-style list). */
export interface RuleSelection<TPayload = unknown> {
  readonly rules: readonly RuleDef<TPayload>[];
  readonly ids: readonly string[];
}

function tokensOf(rule: RuleDef): readonly string[] {
  return [rule.id, ...(rule.tags ?? [])];
}

function passesTagFilter(rule: RuleDef, config: RuleSelectionConfig): boolean {
  const tags = rule.tags ?? [];
  if (config.excludeTags?.some((tag) => tags.includes(tag))) return false;
  if (config.includeTags && config.includeTags.length > 0) {
    return config.includeTags.some((tag) => tags.includes(tag));
  }
  return true;
}

function isCompatible(rule: RuleDef, selected: readonly RuleDef[]): boolean {
  const selectedTokens = new Set(selected.flatMap(tokensOf));
  if (rule.requires && !rule.requires.every((token) => selectedTokens.has(token))) return false;
  if (rule.conflicts?.some((token) => selectedTokens.has(token))) return false;
  const ruleTokens = new Set(tokensOf(rule));
  for (const other of selected) {
    if (other.conflicts?.some((token) => ruleTokens.has(token))) return false;
  }
  return true;
}

/**
 * Select up to `count` rules from `pool` deterministically from `config.seed`. Locked ids are placed
 * first (in order), then remaining slots are filled by weighted draw from tag-filtered, still-eligible
 * candidates, honoring `requires`/`conflicts` after each pick. Each slot draws from an independent
 * seed stream keyed by slot index, so a later slot's outcome never shifts an earlier one. Selection
 * stops early when no compatible candidate remains. Pure given `pool` + `config`.
 *
 * @capability rule-selection deterministically select rules from a tagged pool under compatibility/exclusion constraints
 */
export function selectRules<TPayload = unknown>(
  pool: readonly RuleDef<TPayload>[],
  config: RuleSelectionConfig,
): RuleSelection<TPayload> {
  const byId = new Map(pool.map((rule) => [rule.id, rule]));
  const chosen: RuleDef<TPayload>[] = [];
  const chosenIds = new Set<string>();

  for (const id of config.locked ?? []) {
    const rule = byId.get(id);
    if (rule && !chosenIds.has(id)) {
      chosen.push(rule);
      chosenIds.add(id);
    }
    if (chosen.length >= config.count) return { rules: chosen, ids: chosen.map((r) => r.id) };
  }

  const streams = seededStreams(config.seed);
  let slot = chosen.length;
  while (chosen.length < config.count) {
    const candidates = pool.filter(
      (rule) => !chosenIds.has(rule.id) && passesTagFilter(rule, config) && isCompatible(rule, chosen),
    );
    if (candidates.length === 0) break;
    const picked = pickWeighted(streams(`slot:${slot}`), candidates, (rule) =>
      rule.weight !== undefined && rule.weight > 0 ? rule.weight : 1,
    );
    if (!picked) break;
    chosen.push(picked);
    chosenIds.add(picked.id);
    slot += 1;
  }
  return { rules: chosen, ids: chosen.map((r) => r.id) };
}

/**
 * Reroll a prior selection: keep `keepIds` (the locked slots) and re-draw the rest under a fresh,
 * still-deterministic stream derived from `config.seed` and `salt`. The same seed + salt + keep set
 * reproduce the same reroll, so reroll history stays replayable.
 *
 * @capability rule-selection reroll unlocked slots of a selection deterministically from seed and salt
 */
export function rerollRules<TPayload = unknown>(
  pool: readonly RuleDef<TPayload>[],
  config: RuleSelectionConfig,
  keepIds: readonly string[],
  salt: string | number = 0,
): RuleSelection<TPayload> {
  return selectRules(pool, {
    ...config,
    locked: keepIds,
    seed: `${config.seed}:reroll:${salt}`,
  });
}

/** Registered pool of {@link RuleDef}s — the install seam games register mutators/modes/events into. */
export interface RuleRegistry<TPayload = unknown> {
  register(rule: RuleDef<TPayload>): void;
  has(id: string): boolean;
  get(id: string): RuleDef<TPayload> | undefined;
  all(): readonly RuleDef<TPayload>[];
  /** Run {@link selectRules} over the registered pool. */
  select(config: RuleSelectionConfig): RuleSelection<TPayload>;
  /**
   * Collect the parameter layers contributed by the given selected rule ids, in id order. Unknown ids
   * are skipped so stale/migrated selections resolve without throwing. This is the bridge from a
   * rule selection to a {@link ParamLayer} stack — core reads `.layers`, never a rule's name.
   */
  layersFor(ids: LayerSelection): readonly ParamLayer[];
}

/**
 * Create a {@link RuleRegistry}. Rules install through `register` (duplicate ids throw); selection and
 * `layersFor` are data-driven, so the core never branches on which mutators exist.
 *
 * @capability rule-selection register rules and bridge a selection to its contributed parameter layers
 */
export function createRuleRegistry<TPayload = unknown>(
  initial?: readonly RuleDef<TPayload>[],
): RuleRegistry<TPayload> {
  const rules = new Map<string, RuleDef<TPayload>>();
  const register = (rule: RuleDef<TPayload>): void => {
    if (rules.has(rule.id)) throw new Error(`rule "${rule.id}" is already registered`);
    rules.set(rule.id, rule);
  };
  if (initial) for (const rule of initial) register(rule);
  return {
    register,
    has: (id) => rules.has(id),
    get: (id) => rules.get(id),
    all: () => [...rules.values()],
    select: (config) => selectRules([...rules.values()], config),
    layersFor(ids) {
      const layers: ParamLayer[] = [];
      for (const id of ids) {
        const rule = rules.get(id);
        if (rule?.layers) layers.push(...rule.layers);
      }
      return layers;
    },
  };
}
