import { pickWeighted } from "../random/pick";
import type { Drop, LootEntry, LootTableDef } from "./lootTable";

/**
 * One eligible entry inside a {@link LootRollPlan}: the original table entry plus its live
 * eligibility and effective weight/chance. Modifiers rewrite these fields; the source `entry`
 * object is never mutated, so table definitions stay shared and reusable.
 */
export interface LootPlanEntry {
  entry: LootEntry;
  index: number;
  weight: number;
  chance?: number;
  eligible: boolean;
}

/**
 * The mutable roll plan a stage derives from its table before rolling. Modifiers transform this —
 * gating entries, reweighting them, or changing the roll count — instead of touching table defs.
 */
export interface LootRollPlan {
  tableId: string | null;
  mode: "weighted" | "independent";
  rolls: number;
  entries: LootPlanEntry[];
}

/**
 * A registered, id-tagged loot policy applied to one stage. `plan` transforms eligibility, weights,
 * and roll counts before rolling (luck, difficulty, gating); `drops` post-processes the rolled drops
 * (quantity multipliers, dedupe, caps). Neither hook mutates table definitions, and the id is recorded
 * in provenance so a resolved drop can be traced back to the policies that shaped it.
 */
export interface LootModifier<TCtx = unknown> {
  id: string;
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

export interface LootStage<TCtx = unknown> {
  id: string;
  table: string | LootTableDef;
  /** Fold mode; defaults to `"contribute"`. */
  kind?: LootStageKind;
  when?: (ctx: TCtx) => boolean;
  /** Modifiers applied in order to this stage's roll. */
  modifiers?: LootModifier<TCtx>[];
}

export interface LootPipelineDef<TCtx = unknown> {
  id: string;
  /** Stages run in array order — the deterministic resolution order. */
  stages: LootStage<TCtx>[];
  stack?: boolean;
  maxDrops?: number;
}

export interface LootResolveContext<TCtx = unknown> {
  ctx: TCtx;
  /** Injected randomness — seed it for deterministic, server-authoritative replay. */
  rng: () => number;
  seed?: number | string;
}

/** Why one drop is in the result: the stage/table/entry that produced it, its weights, and the modifiers that shaped it. */
export interface LootDropProvenance {
  stageId: string;
  tableId: string | null;
  entryIndex: number;
  item?: string;
  currency?: string;
  originalWeight?: number;
  effectiveWeight?: number;
  originalChance?: number;
  effectiveChance?: number;
  modifiers: string[];
}

export type LootStageStatus = "rolled" | "skipped" | "empty" | "replaced" | "fell-through";

export interface LootStageTrace {
  stageId: string;
  tableId: string | null;
  kind: LootStageKind;
  status: LootStageStatus;
  reason?: string;
  modifiers: string[];
  dropCount: number;
}

export interface LootResolution {
  drops: Drop[];
  provenance: LootDropProvenance[];
  stages: LootStageTrace[];
  seed?: number | string;
}

export interface LootPipeline<TCtx = unknown> {
  readonly id: string;
  resolve(context: LootResolveContext<TCtx>): LootResolution;
}

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
      const picked = pickWeighted(rng, plan.entries, (candidate) => (candidate.eligible ? candidate.weight : 0));
      if (picked === undefined) continue;
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

/** @capability loot-pipeline validate a composable loot-resolution pipeline definition */
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
