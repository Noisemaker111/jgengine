export type AbilityCastType = "instant" | "projectile" | "channel" | "targeted";

export type AbilitySlotState = "ready" | "cooldown" | "no-resource" | "just-cast";

export interface AbilitySlotConfig {
  id: string;
  cooldownMs: number;
  chargesMax?: number;
  resourceCost?: number;
  castType?: AbilityCastType;
  flashMs?: number;
}

export interface AbilitySlotSnapshot {
  id: string;
  state: AbilitySlotState;
  castType: AbilityCastType;
  resourceCost: number;
  charges: number;
  chargesMax: number;
  cooldownRemainingMs: number;
  cooldownFraction: number;
  justCast: boolean;
  ready: boolean;
}

export type AbilityCastReason = "unknown-slot" | "cooldown" | "no-resource";

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
  };
}

function deriveState(runtime: SlotRuntime, resourceAvailable: number): AbilitySlotState {
  if (runtime.flashRemainingMs > 0) return "just-cast";
  if (runtime.charges <= 0) return "cooldown";
  if (resourceAvailable < runtime.config.resourceCost) return "no-resource";
  return "ready";
}

function snapshotOf(runtime: SlotRuntime, resourceAvailable: number): AbilitySlotSnapshot {
  const { config } = runtime;
  const state = deriveState(runtime, resourceAvailable);
  const cooldownFraction =
    config.cooldownMs <= 0 ? 0 : Math.max(0, Math.min(1, runtime.rechargeRemainingMs / config.cooldownMs));
  return {
    id: config.id,
    state,
    castType: config.castType,
    resourceCost: config.resourceCost,
    charges: runtime.charges,
    chargesMax: config.chargesMax,
    cooldownRemainingMs: runtime.rechargeRemainingMs,
    cooldownFraction,
    justCast: runtime.flashRemainingMs > 0,
    ready: runtime.charges > 0 && resourceAvailable >= config.resourceCost,
  };
}

export function createAbilityKit(configs: readonly AbilitySlotConfig[]): AbilityKit {
  const runtimes = new Map<string, SlotRuntime>();
  const order: string[] = [];
  for (const config of configs) {
    const normalized = normalizeConfig(config);
    if (runtimes.has(normalized.id)) throw new Error(`duplicate ability slot: ${normalized.id}`);
    runtimes.set(normalized.id, {
      config: normalized,
      charges: normalized.chargesMax,
      rechargeRemainingMs: 0,
      flashRemainingMs: 0,
    });
    order.push(normalized.id);
  }

  function fail(slotId: string, reason: AbilityCastReason, resourceAvailable: number): AbilityCastResult {
    const runtime = runtimes.get(slotId);
    return { ok: false, reason, slot: runtime ? snapshotOf(runtime, resourceAvailable) : null };
  }

  function evaluate(slotId: string, resourceAvailable: number): AbilityCastResult {
    const runtime = runtimes.get(slotId);
    if (runtime === undefined) return fail(slotId, "unknown-slot", resourceAvailable);
    if (runtime.charges <= 0) return fail(slotId, "cooldown", resourceAvailable);
    if (resourceAvailable < runtime.config.resourceCost) return fail(slotId, "no-resource", resourceAvailable);
    return { ok: true, slot: snapshotOf(runtime, resourceAvailable) };
  }

  return {
    slots() {
      return order.slice();
    },
    config(slotId) {
      return runtimes.get(slotId)?.config ?? null;
    },
    state(slotId, resourceAvailable = Number.POSITIVE_INFINITY) {
      const runtime = runtimes.get(slotId);
      return runtime === undefined ? null : snapshotOf(runtime, resourceAvailable);
    },
    snapshot(resourceAvailable = Number.POSITIVE_INFINITY) {
      return order.map((slotId) => snapshotOf(runtimes.get(slotId)!, resourceAvailable));
    },
    canCast(slotId, resourceAvailable = Number.POSITIVE_INFINITY) {
      return evaluate(slotId, resourceAvailable);
    },
    cast(slotId, resourceAvailable = Number.POSITIVE_INFINITY) {
      const result = evaluate(slotId, resourceAvailable);
      if (!result.ok) return result;
      const runtime = runtimes.get(slotId)!;
      runtime.charges -= 1;
      if (runtime.rechargeRemainingMs <= 0) runtime.rechargeRemainingMs = runtime.config.cooldownMs;
      runtime.flashRemainingMs = runtime.config.flashMs;
      return { ok: true, slot: snapshotOf(runtime, resourceAvailable) };
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0) return;
      const dtMs = dtSeconds * 1000;
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
    reset(slotId) {
      const targets = slotId === undefined ? runtimes.values() : [runtimes.get(slotId)].filter((r): r is SlotRuntime => r !== undefined);
      for (const runtime of targets) {
        runtime.charges = runtime.config.chargesMax;
        runtime.rechargeRemainingMs = 0;
        runtime.flashRemainingMs = 0;
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
