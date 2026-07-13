export interface RepairMaterial {
  item: string;
  perPoint: number;
}

export interface RepairSpec {
  materials: readonly RepairMaterial[];
  station?: string;
  qualityLossPerRepair?: number;
}

export interface DurabilitySpec {
  max: number;
  wearPerUse?: number;
  wearPerHit?: number;
  disableAtZero?: boolean;
  repair?: RepairSpec;
}

export interface DurabilityState {
  current: number;
  max: number;
}

export type WearKind = "use" | "hit";

export interface RepairCost {
  item: string;
  count: number;
}

export interface RepairQuote {
  materials: readonly RepairCost[];
  restored: number;
  state: DurabilityState;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function createDurability(spec: DurabilitySpec): DurabilityState {
  const max = Math.max(0, spec.max);
  return { current: max, max };
}

export function durabilityFraction(state: DurabilityState): number {
  return state.max <= 0 ? 0 : clamp(state.current / state.max, 0, 1);
}

export function isBroken(state: DurabilityState): boolean {
  return state.current <= 0;
}

export function isDisabled(spec: DurabilitySpec, state: DurabilityState): boolean {
  return isBroken(state) && spec.disableAtZero !== false;
}

export function wearAmount(spec: DurabilitySpec, kind: WearKind): number {
  return kind === "use" ? spec.wearPerUse ?? 0 : spec.wearPerHit ?? 0;
}

/**
 * Apply wear to an item, tracking breakage and repair eligibility.
 *
 * @capability durability track item wear, breakage, and repair
 */
export function applyWear(state: DurabilityState, amount: number): DurabilityState {
  if (amount <= 0) return state;
  return { current: clamp(state.current - amount, 0, state.max), max: state.max };
}

export function wear(spec: DurabilitySpec, state: DurabilityState, kind: WearKind, times = 1): DurabilityState {
  return applyWear(state, wearAmount(spec, kind) * Math.max(0, times));
}

export function canRepairAt(spec: DurabilitySpec, stationId?: string): boolean {
  const repair = spec.repair;
  if (repair === undefined) return false;
  return repair.station === undefined || repair.station === stationId;
}

export function repairQuote(
  spec: DurabilitySpec,
  state: DurabilityState,
  options?: { to?: number; station?: string },
): RepairQuote | null {
  const repair = spec.repair;
  if (repair === undefined) return null;
  if (repair.station !== undefined && repair.station !== options?.station) return null;

  const loss = repair.qualityLossPerRepair ?? 0;
  const newMax = Math.max(1, state.max - loss);
  const capped = Math.min(state.current, newMax);
  const target = clamp(options?.to ?? newMax, capped, newMax);
  const restored = Math.max(0, target - capped);

  const materials = repair.materials.map((m) => ({ item: m.item, count: Math.ceil(m.perPoint * restored) }));
  return { materials, restored, state: { current: target, max: newMax } };
}

export interface DurabilityTracker {
  init(instanceId: string, spec: DurabilitySpec): DurabilityState;
  get(instanceId: string): DurabilityState | null;
  set(instanceId: string, state: DurabilityState): void;
  wear(instanceId: string, spec: DurabilitySpec, kind: WearKind, times?: number): DurabilityState | null;
  isDisabled(instanceId: string, spec: DurabilitySpec): boolean;
  remove(instanceId: string): void;
}

export function createDurabilityTracker(): DurabilityTracker {
  const states = new Map<string, DurabilityState>();
  return {
    init(instanceId, spec) {
      const state = createDurability(spec);
      states.set(instanceId, state);
      return state;
    },
    get(instanceId) {
      return states.get(instanceId) ?? null;
    },
    set(instanceId, state) {
      states.set(instanceId, state);
    },
    wear(instanceId, spec, kind, times) {
      const current = states.get(instanceId);
      if (current === undefined) return null;
      const next = wear(spec, current, kind, times);
      states.set(instanceId, next);
      return next;
    },
    isDisabled(instanceId, spec) {
      const state = states.get(instanceId);
      return state !== undefined && isDisabled(spec, state);
    },
    remove(instanceId) {
      states.delete(instanceId);
    },
  };
}
