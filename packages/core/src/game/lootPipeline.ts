import type { Drop, LootEntry, LootTableDef } from "./lootTable";

/**
 * One eligible entry inside a {@link LootRollPlan}: the original table entry plus its live
 * eligibility and effective weight/chance. Modifiers rewrite these fields; the source `entry`
 * object is never mutated, so table definitions stay shared and reusable.
 */
export interface LootPlanEntry {
  /** The untouched source entry from the table this stage rolls. */
  entry: LootEntry;
  /** Position of `entry` in the source table, carried through to provenance. */
  index: number;
  /** Effective relative pick weight (weighted mode). Starts at the entry's declared weight. */
  weight: number;
  /** Effective per-entry drop probability (independent mode). Starts at the entry's declared chance. */
  chance?: number;
  /** When `false`, the entry is gated out of this roll — excluded from the weighted total or the independent pass. */
  eligible: boolean;
}

/**
 * The mutable roll plan a stage derives from its table before rolling. Modifiers transform this —
 * gating entries, reweighting them, or changing the roll count — instead of touching table defs.
 */
export interface LootRollPlan {
  /** Source table id (for provenance) or `null` when the stage rolled an inline, unnamed table. */
  tableId: string | null;
  /** Weighted vs independent roll mode, inherited from the source table. */
  mode: "weighted" | "independent";
  /** Number of rolls to perform; a quantity modifier can raise or lower this. */
  rolls: number;
  /** The candidate entries with their live eligibility and effective weights/chances. */
  entries: LootPlanEntry[];
}

/**
 * A registered, id-tagged loot policy applied to one stage. `plan` transforms eligibility, weights,
 * and roll counts before rolling (luck, difficulty, gating); `drops` post-processes the rolled drops
 * (quantity multipliers, dedupe, caps). Neither hook mutates table definitions, and the id is recorded
 * in provenance so a resolved drop can be traced back to the policies that shaped it.
 */
export interface LootModifier<TCtx = unknown> {
  /** Stable identifier recorded in {@link LootDropProvenance.modifiers} and stage traces. */
  id: string;
  /** Rewrite the roll plan (eligibility, effective weights, roll count). Return the plan to apply. */
  plan?: (plan: LootRollPlan, ctx: TCtx) => LootRollPlan;
  /** Post-process this stage's rolled drops (scale counts, dedupe, cap). Return the drops to keep. */
  drops?: (drops: Drop[], ctx: TCtx) => Drop[];
}

/**
 * How a stage folds its rolled drops into the accumulating result: `"contribute"` appends,
 * `"fallback"` rolls only when nothing has dropped yet, `"replace"` discards prior drops and
 * overrides with its own (quest/boss overrides).
 */
export type LootStageKind = "contribute" | "fallback" | "replace";

/**
 * One ordered step in a {@link LootPipelineDef}: a source pool (a table id or inline table), an
 * optional context gate, a fold mode, and the modifiers that reshape its roll. Stages compose the
 * genre concepts — world pool, dedicated pool, luck, pity — without any of them living in core.
 */
export interface LootStage<TCtx = unknown> {
  /** Stable stage identifier recorded in provenance and traces. */
  id: string;
  /** Source pool: a table id resolved against the pipeline's resolver, or an inline table definition. */
  table: string | LootTableDef;
  /** Fold mode; defaults to `"contribute"`. */
  kind?: LootStageKind;
  /** Context gate — when it returns `false` the stage is skipped and traced with reason `"gate-false"`. */
  when?: (ctx: TCtx) => boolean;
  /** Modifiers applied in order to this stage's roll. */
  modifiers?: LootModifier<TCtx>[];
}

/**
 * A named, ordered loot-resolution pipeline: the stages to run plus result-shaping policy
 * (duplicate stacking, a total drop cap). Serializable except for its stage gate/modifier functions,
 * mirroring how {@link LootTableDef} entries may carry a `generate` function.
 */
export interface LootPipelineDef<TCtx = unknown> {
  id: string;
  /** Stages run in array order — the deterministic resolution order. */
  stages: LootStage<TCtx>[];
  /** When `true`, drops of the same item/currency are merged into one entry with summed counts. */
  stack?: boolean;
  /** Optional hard cap on the number of resolved drops; extras are trimmed and the cap is traced. */
  maxDrops?: number;
}

/** The caller-owned context, injected RNG, and optional seed threaded through a single resolution. */
export interface LootResolveContext<TCtx = unknown> {
  /** Caller-owned, typed resolution context read by stage gates and modifiers. */
  ctx: TCtx;
  /** Injected randomness — seed it for deterministic, server-authoritative replay. */
  rng: () => number;
  /** Optional seed value recorded verbatim in {@link LootResolution.seed} for replay bookkeeping. */
  seed?: number | string;
}

/** Why one drop is in the result: the stage/table/entry that produced it, its weights, and the modifiers that shaped it. */
export interface LootDropProvenance {
  /** Stage that produced the drop. */
  stageId: string;
  /** Source table id, or `null` for an inline table. */
  tableId: string | null;
  /** Index of the winning entry in its source table. */
  entryIndex: number;
  /** The granted item id, when the drop is an item. */
  item?: string;
  /** The granted currency id, when the drop is currency. */
  currency?: string;
  /** The entry's declared weight before modifiers (weighted mode). */
  originalWeight?: number;
  /** The entry's effective weight after modifiers (weighted mode). */
  effectiveWeight?: number;
  /** The entry's declared chance before modifiers (independent mode). */
  originalChance?: number;
  /** The entry's effective chance after modifiers (independent mode). */
  effectiveChance?: number;
  /** Ids of the modifiers that ran on the producing stage, in application order. */
  modifiers: string[];
}

/** The disposition of a stage after resolution — did it roll, get gated, fall through, override, or find nothing. */
export type LootStageStatus = "rolled" | "skipped" | "empty" | "replaced" | "fell-through";

/** Per-stage record of what happened during resolution, for debugging and replay auditing. */
export interface LootStageTrace {
  stageId: string;
  tableId: string | null;
  kind: LootStageKind;
  status: LootStageStatus;
  /** Human-readable reason for a non-`"rolled"` status (e.g. `"gate-false"`, `"empty-pool"`, `"prior-drops-present"`). */
  reason?: string;
  /** Ids of modifiers applied on this stage. */
  modifiers: string[];
  /** Drops this stage contributed to the final result. */
  dropCount: number;
}

/** The fully serializable outcome of a resolution: the drops, their provenance, per-stage traces, and the replay seed. */
export interface LootResolution {
  drops: Drop[];
  provenance: LootDropProvenance[];
  stages: LootStageTrace[];
  seed?: number | string;
}

/** A resolved, reusable loot pipeline. Call {@link LootPipeline.resolve} with a per-drop context and RNG. */
export interface LootPipeline<TCtx = unknown> {
  readonly id: string;
  resolve(context: LootResolveContext<TCtx>): LootResolution;
}

/** Dependencies a pipeline needs at build time — chiefly how to turn a table id into its definition. */
export interface LootPipelineDeps {
  /** Resolve a table id to its definition. Required only when stages reference tables by id. */
  resolveTable?: (id: string) => LootTableDef | undefined;
}

function tableModeOf(def: LootTableDef): "weighted" | "independent" {
  return def.mode ?? "weighted";
}

function buildPlan(def: LootTableDef): LootRollPlan {
  return {
    tableId: def.id,
    mode: tableModeOf(def),
    rolls: def.rolls ?? 1,
    entries: def.entries.map((entry, index) => {
      const planEntry: LootPlanEntry = { entry, index, weight: entry.weight ?? 0, eligible: true };
      if (entry.chance !== undefined) planEntry.chance = entry.chance;
      return planEntry;
    }),
  };
}

function resolveCount(count: number | [number, number], rng: () => number): number {
  if (typeof count === "number") return count;
  const [min, max] = count;
  return min + Math.floor(rng() * (max - min + 1));
}

function dropFromEntry(entry: LootEntry, count: number, rng: () => number): Drop {
  if (entry.generate !== undefined) return { item: entry.generate(rng), count };
  return entry.item !== undefined ? { item: entry.item, count } : { currency: entry.currency, count };
}

interface RolledDrop {
  drop: Drop;
  planEntry: LootPlanEntry;
}

/** Pick one eligible plan entry by effective weight, mirroring `createLootRegistry`'s weighted algorithm and RNG order. */
function pickWeighted(entries: LootPlanEntry[], rng: () => number): LootPlanEntry | null {
  const eligible = entries.filter((candidate) => candidate.eligible && candidate.weight > 0);
  if (eligible.length === 0) return null;
  const total = eligible.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = rng() * total;
  for (const candidate of eligible) {
    roll -= candidate.weight;
    if (roll < 0) return candidate;
  }
  return eligible[eligible.length - 1] ?? null;
}

/** Roll a prepared plan into drops, consuming `rng` in the same order as the base loot table primitive. */
function rollPlan(plan: LootRollPlan, rng: () => number): RolledDrop[] {
  const rolled: RolledDrop[] = [];
  for (let roll = 0; roll < plan.rolls; roll += 1) {
    if (plan.mode === "independent") {
      for (const planEntry of plan.entries) {
        if (!planEntry.eligible) continue;
        if (rng() < (planEntry.chance ?? 0)) {
          const count = resolveCount(planEntry.entry.count, rng);
          rolled.push({ drop: dropFromEntry(planEntry.entry, count, rng), planEntry });
        }
      }
    } else {
      const picked = pickWeighted(plan.entries, rng);
      if (picked === null) continue;
      const count = resolveCount(picked.entry.count, rng);
      rolled.push({ drop: dropFromEntry(picked.entry, count, rng), planEntry: picked });
    }
  }
  return rolled;
}

function stackDrops(drops: Drop[]): Drop[] {
  const order: string[] = [];
  const byKey = new Map<string, Drop>();
  for (const drop of drops) {
    const key = drop.item !== undefined ? `item:${drop.item}` : `currency:${drop.currency}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { ...drop });
      order.push(key);
    } else {
      existing.count += drop.count;
    }
  }
  return order.map((key) => byKey.get(key)!);
}

function assertValidPipeline<TCtx>(def: LootPipelineDef<TCtx>): void {
  if (def.stages.length === 0) {
    throw new Error(`loot pipeline "${def.id}" must have at least one stage`);
  }
  const seen = new Set<string>();
  for (const stage of def.stages) {
    if (seen.has(stage.id)) {
      throw new Error(`loot pipeline "${def.id}" has duplicate stage id "${stage.id}"`);
    }
    seen.add(stage.id);
  }
  if (def.maxDrops !== undefined && (!Number.isInteger(def.maxDrops) || def.maxDrops < 0)) {
    throw new Error(`loot pipeline "${def.id}" maxDrops must be a non-negative integer`);
  }
}

/**
 * Validate a loot pipeline definition and return it unchanged, for use with {@link createLootPipeline}.
 *
 * @capability loot-pipeline validate a composable loot-resolution pipeline definition
 */
export function defineLootPipeline<TCtx = unknown>(def: LootPipelineDef<TCtx>): LootPipelineDef<TCtx> {
  assertValidPipeline(def);
  return def;
}

/**
 * Build a composable loot-resolution pipeline: ordered source pools, context gates, fallbacks when a
 * pool yields nothing, roll modifiers (luck, quantity, difficulty) applied as registered policies, and
 * full provenance for every drop (stage, table, entry, original vs effective weights, modifier ids, seed).
 * Rolling consumes the injected RNG in the same order as the base loot table, so a seeded resolution is
 * deterministic and server-authoritatively replayable. Genre concepts (world, dedicated, boss, luck,
 * rarity, pity) stay out of core and ship as stage/modifier compositions.
 *
 * @capability loot-pipeline compose ordered loot pools with fallbacks, roll modifiers, and provenance
 */
export function createLootPipeline<TCtx = unknown>(
  def: LootPipelineDef<TCtx>,
  deps: LootPipelineDeps = {},
): LootPipeline<TCtx> {
  assertValidPipeline(def);

  function resolveStageTable(stage: LootStage<TCtx>): LootTableDef {
    if (typeof stage.table !== "string") return stage.table;
    const resolved = deps.resolveTable?.(stage.table);
    if (resolved === undefined) {
      throw new Error(
        `loot pipeline "${def.id}" stage "${stage.id}" references unknown table "${stage.table}"`,
      );
    }
    return resolved;
  }

  return {
    id: def.id,
    resolve({ ctx, rng, seed }) {
      let drops: Drop[] = [];
      let provenance: LootDropProvenance[] = [];
      const traces: LootStageTrace[] = [];

      for (const stage of def.stages) {
        const kind = stage.kind ?? "contribute";
        const modifierIds = (stage.modifiers ?? []).map((modifier) => modifier.id);

        if (stage.when !== undefined && !stage.when(ctx)) {
          traces.push({ stageId: stage.id, tableId: null, kind, status: "skipped", reason: "gate-false", modifiers: modifierIds, dropCount: 0 });
          continue;
        }
        if (kind === "fallback" && drops.length > 0) {
          traces.push({ stageId: stage.id, tableId: null, kind, status: "fell-through", reason: "prior-drops-present", modifiers: modifierIds, dropCount: 0 });
          continue;
        }

        const tableDef = resolveStageTable(stage);
        let plan = buildPlan(tableDef);
        for (const modifier of stage.modifiers ?? []) {
          if (modifier.plan !== undefined) plan = modifier.plan(plan, ctx);
        }

        const rolled = rollPlan(plan, rng);
        let stageDrops = rolled.map((entry) => entry.drop);
        for (const modifier of stage.modifiers ?? []) {
          if (modifier.drops !== undefined) stageDrops = modifier.drops(stageDrops, ctx);
        }

        // Provenance tracks the rolled entries and their lineage; drop-only modifiers (dedupe/cap) may
        // reshape counts, so provenance is emitted from the rolls that still carry entry indices.
        const stageProvenance: LootDropProvenance[] = rolled.map((entry) => {
          const record: LootDropProvenance = {
            stageId: stage.id,
            tableId: plan.tableId,
            entryIndex: entry.planEntry.index,
            modifiers: modifierIds,
          };
          if (entry.drop.item !== undefined) record.item = entry.drop.item;
          if (entry.drop.currency !== undefined) record.currency = entry.drop.currency;
          const source = entry.planEntry.entry;
          if (plan.mode === "weighted") {
            record.originalWeight = source.weight ?? 0;
            record.effectiveWeight = entry.planEntry.weight;
          } else {
            record.originalChance = source.chance ?? 0;
            record.effectiveChance = entry.planEntry.chance ?? 0;
          }
          return record;
        });

        const status: LootStageStatus =
          stageDrops.length === 0 ? "empty" : kind === "replace" ? "replaced" : "rolled";
        const trace: LootStageTrace = {
          stageId: stage.id,
          tableId: plan.tableId,
          kind,
          status,
          modifiers: modifierIds,
          dropCount: stageDrops.length,
        };
        if (status === "empty") trace.reason = "empty-pool";
        traces.push(trace);

        if (stageDrops.length === 0) continue;
        if (kind === "replace") {
          drops = stageDrops;
          provenance = stageProvenance;
        } else {
          drops = [...drops, ...stageDrops];
          provenance = [...provenance, ...stageProvenance];
        }
      }

      if (def.stack === true) drops = stackDrops(drops);
      if (def.maxDrops !== undefined && drops.length > def.maxDrops) {
        drops = drops.slice(0, def.maxDrops);
        provenance = provenance.slice(0, def.maxDrops);
        traces.push({ stageId: "@cap", tableId: null, kind: "contribute", status: "skipped", reason: `capped-at-${def.maxDrops}`, modifiers: [], dropCount: 0 });
      }

      const resolution: LootResolution = { drops, provenance, stages: traces };
      if (seed !== undefined) resolution.seed = seed;
      return resolution;
    },
  };
}
