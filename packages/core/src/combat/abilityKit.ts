export type AbilityCastType = "instant" | "projectile" | "channel" | "targeted";

export type AbilitySlotState = "ready" | "cooldown" | "no-resource" | "just-cast";

export interface AbilitySlotConfig {
  id: string;
  cooldownMs: number;
  chargesMax?: number;
  resourceCost?: number;
  castType?: AbilityCastType;
  flashMs?: number;
  /** Shared cooldown groups this slot participates in — ids declared in `AbilityKitOptions.groups`. */
  groups?: readonly string[];
}

/** A cooldown shared across every member slot: casting any member starts it, and no member can cast while it runs. One group that every slot joins is an MMO global cooldown. */
export interface AbilityCooldownGroup {
  id: string;
  cooldownMs: number;
}

/**
 * A spendable resource pool (mana, energy, rage) bound to an ability kit. When bound, `cast` deducts a
 * slot's `resourceCost` on success and `state`/`snapshot`/`canCast` reflect affordability without a
 * per-call `resourceAvailable` argument — the cast path actually spends instead of only gating (#357).
 */
export interface AbilityResource {
  /** Current spendable amount, read fresh on each cast/snapshot. */
  available(): number;
  /** Deduct `cost` from the pool after a successful cast. */
  spend(cost: number): void;
}

export interface AbilityKitOptions {
  groups?: readonly AbilityCooldownGroup[];
  /** Bind a resource pool so casting charges `resourceCost` and snapshots reflect affordability automatically. Passing an explicit `resourceAvailable` to a method overrides the bound pool for that call and never auto-spends. */
  resource?: AbilityResource;
}

export interface AbilitySlotSnapshot {
  id: string;
  state: AbilitySlotState;
  castType: AbilityCastType;
  resourceCost: number;
  charges: number;
  chargesMax: number;
  /** Max of the slot's own recharge and any blocking group cooldown. */
  cooldownRemainingMs: number;
  cooldownFraction: number;
  /** Remaining ms on the slowest of the slot's shared cooldown groups; 0 when unblocked. */
  groupRemainingMs: number;
  justCast: boolean;
  ready: boolean;
}

export type AbilityCastReason = "unknown-slot" | "cooldown" | "group-cooldown" | "no-resource";

export interface AbilitySlotRetune {
  cooldownMs?: number;
  resourceCost?: number;
}

export type AbilityCastResult =
  | { ok: true; slot: AbilitySlotSnapshot }
  | { ok: false; reason: AbilityCastReason; slot: AbilitySlotSnapshot | null };

export interface AbilityKit {
  slots(): readonly string[];
  config(slotId: string): AbilitySlotConfig | null;
  state(slotId: string, resourceAvailable?: number): AbilitySlotSnapshot | null;
  snapshot(resourceAvailable?: number): AbilitySlotSnapshot[];
  canCast(slotId: string, resourceAvailable?: number): AbilityCastResult;
  cast(slotId: string, resourceAvailable?: number): AbilityCastResult;
  tick(dtSeconds: number): void;
  /** Remaining ms on a shared cooldown group; 0 when ready, null for an unknown group. */
  groupRemaining(groupId: string): number | null;
  reset(slotId?: string): void;
  retuneSlot(slotId: string, patch: AbilitySlotRetune): boolean;
}

const DEFAULT_FLASH_MS = 220;

interface SlotRuntime {
  config: Required<AbilitySlotConfig>;
  charges: number;
  rechargeRemainingMs: number;
  flashRemainingMs: number;
}

function normalizeConfig(config: AbilitySlotConfig): Required<AbilitySlotConfig> {
  return {
    id: config.id,
    cooldownMs: Math.max(0, config.cooldownMs),
    chargesMax: Math.max(1, config.chargesMax ?? 1),
    resourceCost: Math.max(0, config.resourceCost ?? 0),
    castType: config.castType ?? "instant",
    flashMs: Math.max(0, config.flashMs ?? DEFAULT_FLASH_MS),
    groups: config.groups ?? [],
  };
}

interface GroupBlock {
  remainingMs: number;
  fraction: number;
}

function deriveState(runtime: SlotRuntime, resourceAvailable: number, group: GroupBlock): AbilitySlotState {
  if (runtime.flashRemainingMs > 0) return "just-cast";
  if (runtime.charges <= 0) return "cooldown";
  if (group.remainingMs > 0) return "cooldown";
  if (resourceAvailable < runtime.config.resourceCost) return "no-resource";
  return "ready";
}

function snapshotOf(runtime: SlotRuntime, resourceAvailable: number, group: GroupBlock): AbilitySlotSnapshot {
  const { config } = runtime;
  const state = deriveState(runtime, resourceAvailable, group);
  const ownFraction =
    config.cooldownMs <= 0 ? 0 : Math.max(0, Math.min(1, runtime.rechargeRemainingMs / config.cooldownMs));
  return {
    id: config.id,
    state,
    castType: config.castType,
    resourceCost: config.resourceCost,
    charges: runtime.charges,
    chargesMax: config.chargesMax,
    cooldownRemainingMs: Math.max(runtime.rechargeRemainingMs, group.remainingMs),
    cooldownFraction: Math.max(ownFraction, group.fraction),
    groupRemainingMs: group.remainingMs,
    justCast: runtime.flashRemainingMs > 0,
    ready: runtime.charges > 0 && group.remainingMs <= 0 && resourceAvailable >= config.resourceCost,
  };
}

export function createAbilityKit(configs: readonly AbilitySlotConfig[], options: AbilityKitOptions = {}): AbilityKit {
  const boundResource = options.resource;
  function currentResource(explicit: number | undefined): number {
    if (explicit !== undefined) return explicit;
    return boundResource === undefined ? Number.POSITIVE_INFINITY : boundResource.available();
  }
  const groupCooldowns = new Map<string, number>();
  const groupRemaining = new Map<string, number>();
  for (const group of options.groups ?? []) {
    if (groupCooldowns.has(group.id)) throw new Error(`duplicate cooldown group: ${group.id}`);
    groupCooldowns.set(group.id, Math.max(0, group.cooldownMs));
    groupRemaining.set(group.id, 0);
  }

  const runtimes = new Map<string, SlotRuntime>();
  const order: string[] = [];
  for (const config of configs) {
    const normalized = normalizeConfig(config);
    if (runtimes.has(normalized.id)) throw new Error(`duplicate ability slot: ${normalized.id}`);
    for (const groupId of normalized.groups) {
      if (!groupCooldowns.has(groupId)) {
        throw new Error(`ability slot "${normalized.id}" references unknown cooldown group "${groupId}"`);
      }
    }
    runtimes.set(normalized.id, {
      config: normalized,
      charges: normalized.chargesMax,
      rechargeRemainingMs: 0,
      flashRemainingMs: 0,
    });
    order.push(normalized.id);
  }

  function groupBlockOf(runtime: SlotRuntime): GroupBlock {
    let remainingMs = 0;
    let fraction = 0;
    for (const groupId of runtime.config.groups) {
      const remaining = groupRemaining.get(groupId) ?? 0;
      if (remaining <= remainingMs) continue;
      remainingMs = remaining;
      const cooldownMs = groupCooldowns.get(groupId) ?? 0;
      fraction = cooldownMs <= 0 ? 0 : Math.max(0, Math.min(1, remaining / cooldownMs));
    }
    return { remainingMs, fraction };
  }

  function fail(slotId: string, reason: AbilityCastReason, resourceAvailable: number): AbilityCastResult {
    const runtime = runtimes.get(slotId);
    return { ok: false, reason, slot: runtime ? snapshotOf(runtime, resourceAvailable, groupBlockOf(runtime)) : null };
  }

  function evaluate(slotId: string, resourceAvailable: number): AbilityCastResult {
    const runtime = runtimes.get(slotId);
    if (runtime === undefined) return fail(slotId, "unknown-slot", resourceAvailable);
    if (runtime.charges <= 0) return fail(slotId, "cooldown", resourceAvailable);
    if (groupBlockOf(runtime).remainingMs > 0) return fail(slotId, "group-cooldown", resourceAvailable);
    if (resourceAvailable < runtime.config.resourceCost) return fail(slotId, "no-resource", resourceAvailable);
    return { ok: true, slot: snapshotOf(runtime, resourceAvailable, groupBlockOf(runtime)) };
  }

  return {
    slots() {
      return order.slice();
    },
    config(slotId) {
      return runtimes.get(slotId)?.config ?? null;
    },
    state(slotId, resourceAvailable) {
      const runtime = runtimes.get(slotId);
      return runtime === undefined ? null : snapshotOf(runtime, currentResource(resourceAvailable), groupBlockOf(runtime));
    },
    snapshot(resourceAvailable) {
      const available = currentResource(resourceAvailable);
      return order.map((slotId) => {
        const runtime = runtimes.get(slotId)!;
        return snapshotOf(runtime, available, groupBlockOf(runtime));
      });
    },
    canCast(slotId, resourceAvailable) {
      return evaluate(slotId, currentResource(resourceAvailable));
    },
    cast(slotId, resourceAvailable) {
      const result = evaluate(slotId, currentResource(resourceAvailable));
      if (!result.ok) return result;
      const runtime = runtimes.get(slotId)!;
      runtime.charges -= 1;
      if (runtime.rechargeRemainingMs <= 0) runtime.rechargeRemainingMs = runtime.config.cooldownMs;
      runtime.flashRemainingMs = runtime.config.flashMs;
      for (const groupId of runtime.config.groups) {
        groupRemaining.set(groupId, groupCooldowns.get(groupId) ?? 0);
      }
      if (resourceAvailable === undefined && boundResource !== undefined && runtime.config.resourceCost > 0) {
        boundResource.spend(runtime.config.resourceCost);
      }
      return { ok: true, slot: snapshotOf(runtime, currentResource(resourceAvailable), groupBlockOf(runtime)) };
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0) return;
      const dtMs = dtSeconds * 1000;
      for (const [groupId, remaining] of groupRemaining) {
        if (remaining > 0) groupRemaining.set(groupId, Math.max(0, remaining - dtMs));
      }
      for (const runtime of runtimes.values()) {
        if (runtime.flashRemainingMs > 0) runtime.flashRemainingMs = Math.max(0, runtime.flashRemainingMs - dtMs);
        if (runtime.charges >= runtime.config.chargesMax) {
          runtime.rechargeRemainingMs = 0;
          continue;
        }
        if (runtime.config.cooldownMs <= 0) {
          runtime.charges = runtime.config.chargesMax;
          runtime.rechargeRemainingMs = 0;
          continue;
        }
        let remaining = runtime.rechargeRemainingMs <= 0 ? runtime.config.cooldownMs : runtime.rechargeRemainingMs;
        remaining -= dtMs;
        while (remaining <= 0 && runtime.charges < runtime.config.chargesMax) {
          runtime.charges += 1;
          remaining += runtime.config.cooldownMs;
        }
        runtime.rechargeRemainingMs = runtime.charges >= runtime.config.chargesMax ? 0 : remaining;
      }
    },
    groupRemaining(groupId) {
      return groupCooldowns.has(groupId) ? groupRemaining.get(groupId) ?? 0 : null;
    },
    reset(slotId) {
      const targets = slotId === undefined ? runtimes.values() : [runtimes.get(slotId)].filter((r): r is SlotRuntime => r !== undefined);
      for (const runtime of targets) {
        runtime.charges = runtime.config.chargesMax;
        runtime.rechargeRemainingMs = 0;
        runtime.flashRemainingMs = 0;
      }
      if (slotId === undefined) {
        for (const groupId of groupRemaining.keys()) groupRemaining.set(groupId, 0);
      }
    },
    retuneSlot(slotId, patch) {
      const runtime = runtimes.get(slotId);
      if (runtime === undefined) return false;
      if (patch.cooldownMs !== undefined) runtime.config.cooldownMs = Math.max(0, patch.cooldownMs);
      if (patch.resourceCost !== undefined) runtime.config.resourceCost = Math.max(0, patch.resourceCost);
      return true;
    },
  };
}
