import type { LootEntry } from "./lootTable";
import type { LootModifier } from "./lootPipeline";

/** Caller-authored weighting curve; item ids, quality tiers and balance never live in the modifier. */
export interface TimeScaledRarityOptions {
  id?: string;
  ramp: (entry: LootEntry, hours: number) => number;
}

/**
 * Multiply weighted odds (or independent chances, clamped to one) by a caller-authored elapsed-time
 * curve. Keeps source tables unchanged and uses the existing pipeline's modifier provenance.
 * Elapsed time and multipliers must be finite and nonnegative; invalid curves reject the roll.
 *
 * @capability time-scaled-loot shape loot odds by elapsed hours with caller-authored curves and pipeline provenance
 */
export function timeScaledRarity<TCtx extends { elapsedMs: number }>(options: TimeScaledRarityOptions): LootModifier<TCtx> {
  return {
    id: options.id ?? "time-scaled-rarity",
    plan(plan, ctx) {
      if (!Number.isFinite(ctx.elapsedMs) || ctx.elapsedMs < 0) throw new RangeError("Loot elapsedMs must be finite and nonnegative");
      const hours = ctx.elapsedMs / 3_600_000;
      return { ...plan, entries: plan.entries.map(candidate => {
        const factor = options.ramp(candidate.entry, hours);
        if (!Number.isFinite(factor) || factor < 0) throw new RangeError("Loot time multiplier must be finite and nonnegative");
        const value = (plan.mode === "weighted" ? candidate.weight : candidate.chance ?? 0) * factor;
        if (!Number.isFinite(value)) throw new RangeError("Loot time weighting overflowed");
        return plan.mode === "weighted" ? { ...candidate, weight: value } : { ...candidate, chance: Math.min(1, value) };
      }) };
    },
  };
}
