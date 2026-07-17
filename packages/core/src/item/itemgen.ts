import { pickUniform, pickWeighted } from "../random/pick";

/**
 * One selectable option in a generation step's pool: a stable `id` used in provenance and pinning,
 * the payload `value` a chosen option contributes, and an optional relative `weight` (default 1).
 */
export interface GenOption<V = unknown> {
  id: string;
  value: V;
  weight?: number;
}

/**
 * Read-only view of the choices resolved so far, threaded into a later step's pool, constraint,
 * weight function, or transform so a decision can depend on earlier picks (dependent choice).
 */
export interface GenChoices {
  /** Whether a step has resolved to a (non-skipped) option. */
  has(step: string): boolean;
  /** The chosen option id for a step, or undefined if unresolved or skipped. */
  optionId(step: string): string | undefined;
  /** The chosen option value for a step, or undefined if unresolved or skipped. */
  value<V = unknown>(step: string): V | undefined;
}

/**
 * A step's candidate options: a fixed list, or a function of the choices resolved so far so pools
 * can narrow to earlier picks (a slot pool that depends on a chosen category).
 */
export type GenPool<V = unknown> = readonly GenOption<V>[] | ((choices: GenChoices) => readonly GenOption<V>[]);

/**
 * One decision point in a {@link GenSchema}: pick a single option from a pool, honoring an optional
 * constraint, dependent weighting, selection mode, and optionality. Steps resolve in array order.
 */
export interface GenStep<V = unknown> {
  id: string;
  pool: GenPool<V>;
  /** `"weighted"` (default) picks proportional to weight; `"uniform"` ignores weight and picks evenly. */
  select?: "weighted" | "uniform";
  /** Constraint: only options for which this returns true are eligible, given the earlier choices. */
  accept?: (option: GenOption<V>, choices: GenChoices) => boolean;
  /** Override an option's weight as a function of earlier choices; falls back to `option.weight ?? 1`. */
  weightOf?: (option: GenOption<V>, choices: GenChoices) => number;
  /** When no option is eligible, skip this step instead of failing or backtracking. */
  optional?: boolean;
}

/**
 * Mutation surface a {@link GenTransform} uses to derive numeric fields after choices resolve.
 * Every `set`/`add`/`mul` is captured as a {@link GenFieldRecord}, and `rng` is the same injected
 * stream the choices drew from, so rolled derivations stay deterministic and explainable.
 */
export interface TransformApi {
  readonly choices: GenChoices;
  readonly rng: () => number;
  /** Current value of a field, or 0 if unset. */
  get(field: string): number;
  /** Replace a field's value, recording the change. */
  set(field: string, value: number, note?: string): void;
  /** Add to a field's value, recording the change. */
  add(field: string, amount: number, note?: string): void;
  /** Multiply a field's value, recording the change. */
  mul(field: string, factor: number, note?: string): void;
}

/**
 * A named derivation over the numeric field bag, applied in schema order after all choices resolve
 * (affix rolls, level scaling, budget spend). Each field mutation it makes is recorded as provenance.
 */
export interface GenTransform {
  id: string;
  apply: (api: TransformApi) => void;
}

/**
 * The resolved-but-unvalidated draft passed to each {@link GenValidator}: the step choices, their
 * values, and the transformed fields. Returning false from any validator rerolls the whole
 * generation up to the attempt budget.
 */
export interface GenDraft {
  choices: Readonly<Record<string, string>>;
  values: Readonly<Record<string, unknown>>;
  fields: Readonly<Record<string, number>>;
}

/** A final-assembly check over a {@link GenDraft}; false triggers a whole-pipeline reroll. */
export type GenValidator = (draft: GenDraft) => boolean;

/**
 * Provenance for one resolved step: which option stuck, its effective weight, how many options were
 * eligible after constraints, and how many eligible options backtracking rejected before this one.
 * A skipped optional step is recorded with an empty `optionId`.
 */
export interface GenChoiceRecord {
  step: string;
  optionId: string;
  weight: number;
  eligible: number;
  rerolls: number;
}

/** Provenance for one field mutation a transform made: which transform, field, op, and before/after. */
export interface GenFieldRecord {
  transform: string;
  field: string;
  op: "set" | "add" | "mul";
  from: number;
  to: number;
  note?: string;
}

/**
 * The full explanation of a generated result: how many whole-pipeline attempts it took, every step
 * choice, and every field mutation. Plain, serializable data for UI, debugging, balancing, and
 * regeneration.
 */
export interface GenProvenance {
  attempts: number;
  choices: readonly GenChoiceRecord[];
  fields: readonly GenFieldRecord[];
}

/**
 * A successful generation: the step-to-option map, step-to-value map, transformed numeric fields,
 * and the {@link GenProvenance} that explains them. Entirely serializable; round-trips through
 * save/load and multiplayer sync unchanged.
 */
export interface GenResult {
  choices: Readonly<Record<string, string>>;
  values: Readonly<Record<string, unknown>>;
  fields: Readonly<Record<string, number>>;
  provenance: GenProvenance;
}

/**
 * The outcome of {@link generate}: either a successful {@link GenResult}, or a failure carrying the
 * reason (`"unsatisfiable"` — constraints left no valid assignment; `"rejected"` — validators kept
 * rejecting drafts) and the attempts spent.
 */
export type GenOutcome =
  | { ok: true; result: GenResult }
  | { ok: false; reason: "unsatisfiable" | "rejected"; attempts: number };

/**
 * A caller-defined generation schema over plain data: ordered choice steps, optional field
 * transforms, optional validators, and bounded reroll/backtracking budgets. Genre-agnostic — it
 * carries no built-in notion of rarity, element, weapon, or name; those are caller step and option ids.
 */
export interface GenSchema {
  steps: readonly GenStep[];
  transforms?: readonly GenTransform[];
  validate?: readonly GenValidator[];
  /** Max whole-pipeline attempts when a validator rejects a draft (default 24). */
  maxAttempts?: number;
  /** Max option picks the backtracking search may spend satisfying constraints in one attempt (default 1024). */
  maxPicks?: number;
}

/** Per-call options for {@link generate}. */
export interface GenerateOptions {
  /** Force a step to a specific option id, consuming no rng for it (a requested rarity or family). */
  pin?: Readonly<Record<string, string>>;
}

interface Chosen {
  step: string;
  optionId: string;
  value: unknown;
  weight: number;
  eligible: number;
  rerolls: number;
  skipped: boolean;
}

function makeChoicesView(chosen: readonly Chosen[]): GenChoices {
  const find = (step: string): Chosen | undefined => {
    for (const c of chosen) if (c.step === step && !c.skipped) return c;
    return undefined;
  };
  return {
    has: (step) => find(step) !== undefined,
    optionId: (step) => find(step)?.optionId,
    value: <V,>(step: string) => find(step)?.value as V | undefined,
  };
}

function poolFor<V>(pool: GenPool<V>, choices: GenChoices): readonly GenOption<V>[] {
  return typeof pool === "function" ? pool(choices) : pool;
}

/**
 * Run a caller-defined {@link GenSchema} against an injected `rng` into a deterministic, serializable
 * {@link GenResult} with full provenance. Composes weighted/uniform choice, dependent choice,
 * constraints with bounded backtracking, field transforms, and validation reroll over plain data —
 * the generic seam procedural loot, affix, and modular-part rollers assemble on. Identical schema,
 * seed, and pins reproduce an identical result across server/client and save/load.
 *
 * @capability item-generation compose constraints, weighted pools, transforms, and provenance into a deterministic generated item
 */
export function generate(schema: GenSchema, rng: () => number, options: GenerateOptions = {}): GenOutcome {
  const maxAttempts = schema.maxAttempts ?? 24;
  const maxPicks = schema.maxPicks ?? 1024;
  const pin = options.pin;
  let lastReason: "unsatisfiable" | "rejected" = "unsatisfiable";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const chosen: Chosen[] = [];
    const view = makeChoicesView(chosen);
    let picks = 0;

    const weightGetter = (step: GenStep) => (option: GenOption) =>
      step.weightOf !== undefined ? step.weightOf(option, view) : option.weight ?? 1;

    const solve = (index: number): boolean => {
      if (index >= schema.steps.length) return true;
      const step = schema.steps[index]!;
      const pinId = pin?.[step.id];
      if (pinId !== undefined) {
        const option = poolFor(step.pool, view).find((candidate) => candidate.id === pinId);
        if (option === undefined) return false;
        chosen.push({
          step: step.id,
          optionId: option.id,
          value: option.value,
          weight: weightGetter(step)(option),
          eligible: 1,
          rerolls: 0,
          skipped: false,
        });
        if (solve(index + 1)) return true;
        chosen.pop();
        return false;
      }

      const accept = step.accept;
      let remaining = poolFor(step.pool, view).filter(
        (option) => accept === undefined || accept(option, view),
      );
      const eligibleCount = remaining.length;
      if (eligibleCount === 0) {
        if (step.optional !== true) return false;
        chosen.push({ step: step.id, optionId: "", value: undefined, weight: 0, eligible: 0, rerolls: 0, skipped: true });
        if (solve(index + 1)) return true;
        chosen.pop();
        return false;
      }

      let tried = 0;
      while (remaining.length > 0) {
        if (picks >= maxPicks) return false;
        picks += 1;
        const picked =
          step.select === "uniform"
            ? pickUniform(rng, remaining)
            : pickWeighted(rng, remaining, weightGetter(step));
        if (picked === undefined) return false;
        chosen.push({
          step: step.id,
          optionId: picked.id,
          value: picked.value,
          weight: weightGetter(step)(picked),
          eligible: eligibleCount,
          rerolls: tried,
          skipped: false,
        });
        if (solve(index + 1)) return true;
        chosen.pop();
        remaining = remaining.filter((option) => option !== picked);
        tried += 1;
      }
      return false;
    };

    if (!solve(0)) {
      lastReason = "unsatisfiable";
      continue;
    }

    const choices: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const choiceRecords: GenChoiceRecord[] = [];
    for (const entry of chosen) {
      choiceRecords.push({
        step: entry.step,
        optionId: entry.optionId,
        weight: entry.weight,
        eligible: entry.eligible,
        rerolls: entry.rerolls,
      });
      if (entry.skipped) continue;
      choices[entry.step] = entry.optionId;
      values[entry.step] = entry.value;
    }

    const fields: Record<string, number> = {};
    const fieldRecords: GenFieldRecord[] = [];
    const record = (transform: string, op: GenFieldRecord["op"], field: string, from: number, to: number, note?: string) => {
      fields[field] = to;
      const entry: GenFieldRecord = { transform, field, op, from, to };
      if (note !== undefined) entry.note = note;
      fieldRecords.push(entry);
    };
    for (const transform of schema.transforms ?? []) {
      const api: TransformApi = {
        choices: view,
        rng,
        get: (field) => fields[field] ?? 0,
        set: (field, value, note) => record(transform.id, "set", field, fields[field] ?? 0, value, note),
        add: (field, amount, note) => record(transform.id, "add", field, fields[field] ?? 0, (fields[field] ?? 0) + amount, note),
        mul: (field, factor, note) => record(transform.id, "mul", field, fields[field] ?? 0, (fields[field] ?? 0) * factor, note),
      };
      transform.apply(api);
    }

    const draft: GenDraft = { choices, values, fields };
    const validators = schema.validate ?? [];
    if (!validators.every((validate) => validate(draft))) {
      lastReason = "rejected";
      continue;
    }

    return {
      ok: true,
      result: { choices, values, fields, provenance: { attempts: attempt, choices: choiceRecords, fields: fieldRecords } },
    };
  }

  return { ok: false, reason: lastReason, attempts: maxAttempts };
}
