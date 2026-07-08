import { createCommitController, type CommitController, type CommitMode } from "./commit";

export type { CommitMode, CommitController } from "./commit";

export interface PoolConfig {
  id: string;
  max: number;
  start?: number;
}

export interface PoolState {
  id: string;
  current: number;
  max: number;
}

export interface TurnState {
  round: number;
  order: readonly string[];
  activeIndex: number;
  active: string | null;
  phaseIndex: number;
  phase: string | null;
}

export interface TurnLoopHooks {
  onTurnStart?: (participant: string, state: TurnState) => void;
  onTurnEnd?: (participant: string, state: TurnState) => void;
  onRoundStart?: (round: number, state: TurnState) => void;
  onPoolChange?: (participant: string, pool: PoolState) => void;
  onChange?: () => void;
}

export interface TurnLoopConfig {
  order: readonly string[];
  phases?: readonly string[];
  pools?: readonly PoolConfig[];
  commit?: { mode: CommitMode };
  hooks?: TurnLoopHooks;
}

export interface TurnLoopSnapshot {
  round: number;
  order: string[];
  activeIndex: number;
  phaseIndex: number;
  pools: Record<string, Record<string, number>>;
}

export interface TurnLoop<TAction = unknown> {
  readonly commit: CommitController<TAction>;
  state(): TurnState;
  order(): readonly string[];
  active(): string | null;
  phase(): string | null;
  round(): number;
  setOrder(order: readonly string[], keepActive?: boolean): TurnState;
  addParticipant(id: string, atIndex?: number): TurnState;
  removeParticipant(id: string): TurnState;
  advancePhase(): TurnState;
  advanceTurn(): TurnState;
  advanceRound(): TurnState;
  pools(participantId: string): PoolState[];
  pool(participantId: string, poolId: string): PoolState | null;
  canSpend(participantId: string, poolId: string, amount?: number): boolean;
  spend(participantId: string, poolId: string, amount?: number): boolean;
  gain(participantId: string, poolId: string, amount: number): boolean;
  refill(participantId: string, poolId?: string): void;
  capture(): TurnLoopSnapshot;
  restore(snapshot: TurnLoopSnapshot): void;
}

export function createTurnLoop<TAction = unknown>(config: TurnLoopConfig): TurnLoop<TAction> {
  const poolConfigs = config.pools ?? [];
  const phases = config.phases ?? [];
  const hooks = config.hooks ?? {};
  const commit = createCommitController<TAction>({
    mode: config.commit?.mode ?? "immediate",
    participants: config.order,
  });

  let order = [...config.order];
  let round = 1;
  let activeIndex = order.length > 0 ? 0 : -1;
  let phaseIndex = 0;
  const pools = new Map<string, Map<string, PoolState>>();

  function resetPools(participantId: string): void {
    const set = new Map<string, PoolState>();
    for (const pc of poolConfigs) {
      set.set(pc.id, { id: pc.id, current: pc.start ?? pc.max, max: pc.max });
    }
    pools.set(participantId, set);
  }

  function resetPoolsAndNotify(participantId: string): void {
    resetPools(participantId);
    if (hooks.onPoolChange !== undefined) {
      for (const pool of pools.get(participantId)!.values()) hooks.onPoolChange(participantId, { ...pool });
    }
  }

  function ensurePools(participantId: string): Map<string, PoolState> {
    const existing = pools.get(participantId);
    if (existing !== undefined) return existing;
    resetPools(participantId);
    return pools.get(participantId)!;
  }

  for (const id of order) resetPools(id);

  function active(): string | null {
    return activeIndex >= 0 && activeIndex < order.length ? order[activeIndex]! : null;
  }

  function phase(): string | null {
    return phases.length > 0 ? phases[phaseIndex] ?? null : null;
  }

  function state(): TurnState {
    return {
      round,
      order: [...order],
      activeIndex,
      active: active(),
      phaseIndex: phases.length > 0 ? phaseIndex : 0,
      phase: phase(),
    };
  }

  function changed(next: TurnState): TurnState {
    hooks.onChange?.();
    return next;
  }

  function advanceTurn(): TurnState {
    if (order.length === 0) {
      activeIndex = -1;
      return changed(state());
    }
    const outgoing = active();
    if (outgoing !== null) hooks.onTurnEnd?.(outgoing, state());
    phaseIndex = 0;
    let wrapped = false;
    if (activeIndex < 0) {
      activeIndex = 0;
    } else if (activeIndex >= order.length - 1) {
      activeIndex = 0;
      round += 1;
      wrapped = true;
    } else {
      activeIndex += 1;
    }
    if (wrapped) hooks.onRoundStart?.(round, state());
    const current = active();
    if (current !== null) resetPoolsAndNotify(current);
    if (current !== null) hooks.onTurnStart?.(current, state());
    return changed(state());
  }

  function advancePhase(): TurnState {
    if (phases.length === 0) return advanceTurn();
    if (phaseIndex >= phases.length - 1) return advanceTurn();
    phaseIndex += 1;
    return changed(state());
  }

  function advanceRound(): TurnState {
    if (order.length === 0) {
      round += 1;
      return changed(state());
    }
    const outgoing = active();
    if (outgoing !== null) hooks.onTurnEnd?.(outgoing, state());
    round += 1;
    activeIndex = 0;
    phaseIndex = 0;
    hooks.onRoundStart?.(round, state());
    for (const id of order) resetPoolsAndNotify(id);
    const current = active();
    if (current !== null) hooks.onTurnStart?.(current, state());
    return changed(state());
  }

  function setOrder(next: readonly string[], keepActive = false): TurnState {
    const previousActive = active();
    order = [...next];
    for (const id of order) if (!pools.has(id)) resetPools(id);
    for (const id of [...pools.keys()]) if (!order.includes(id)) pools.delete(id);
    if (order.length === 0) {
      activeIndex = -1;
    } else if (keepActive && previousActive !== null && order.includes(previousActive)) {
      activeIndex = order.indexOf(previousActive);
    } else {
      activeIndex = Math.min(Math.max(activeIndex, 0), order.length - 1);
    }
    return changed(state());
  }

  function addParticipant(id: string, atIndex?: number): TurnState {
    if (order.includes(id)) return state();
    const index = atIndex === undefined ? order.length : Math.min(Math.max(atIndex, 0), order.length);
    order.splice(index, 0, id);
    resetPools(id);
    if (activeIndex < 0) activeIndex = 0;
    else if (index <= activeIndex) activeIndex += 1;
    return changed(state());
  }

  function removeParticipant(id: string): TurnState {
    const index = order.indexOf(id);
    if (index < 0) return state();
    order.splice(index, 1);
    pools.delete(id);
    if (order.length === 0) {
      activeIndex = -1;
    } else if (index < activeIndex) {
      activeIndex -= 1;
    } else if (activeIndex >= order.length) {
      activeIndex = 0;
    }
    return changed(state());
  }

  return {
    commit,
    state,
    order: () => [...order],
    active,
    phase,
    round: () => round,
    setOrder,
    addParticipant,
    removeParticipant,
    advancePhase,
    advanceTurn,
    advanceRound,
    pools: (participantId) => [...ensurePools(participantId).values()].map((p) => ({ ...p })),
    pool: (participantId, poolId) => {
      const p = ensurePools(participantId).get(poolId);
      return p === undefined ? null : { ...p };
    },
    canSpend: (participantId, poolId, amount = 1) => {
      const p = ensurePools(participantId).get(poolId);
      return p !== undefined && p.current >= amount;
    },
    spend: (participantId, poolId, amount = 1) => {
      const p = ensurePools(participantId).get(poolId);
      if (p === undefined || p.current < amount) return false;
      p.current -= amount;
      hooks.onPoolChange?.(participantId, { ...p });
      hooks.onChange?.();
      return true;
    },
    gain: (participantId, poolId, amount) => {
      const p = ensurePools(participantId).get(poolId);
      if (p === undefined) return false;
      p.current = Math.min(p.max, p.current + amount);
      hooks.onPoolChange?.(participantId, { ...p });
      hooks.onChange?.();
      return true;
    },
    refill: (participantId, poolId) => {
      const set = ensurePools(participantId);
      if (poolId === undefined) {
        for (const p of set.values()) {
          p.current = p.max;
          hooks.onPoolChange?.(participantId, { ...p });
        }
        hooks.onChange?.();
        return;
      }
      const p = set.get(poolId);
      if (p !== undefined) {
        p.current = p.max;
        hooks.onPoolChange?.(participantId, { ...p });
        hooks.onChange?.();
      }
    },
    capture: () => {
      const poolSnapshot: Record<string, Record<string, number>> = {};
      for (const [participantId, set] of pools) {
        const entry: Record<string, number> = {};
        for (const [poolId, p] of set) entry[poolId] = p.current;
        poolSnapshot[participantId] = entry;
      }
      return { round, order: [...order], activeIndex, phaseIndex, pools: poolSnapshot };
    },
    restore: (snapshot) => {
      round = snapshot.round;
      order = [...snapshot.order];
      activeIndex = snapshot.activeIndex;
      phaseIndex = snapshot.phaseIndex;
      pools.clear();
      for (const id of order) resetPools(id);
      for (const [participantId, entry] of Object.entries(snapshot.pools)) {
        const set = pools.get(participantId) ?? new Map<string, PoolState>();
        for (const [poolId, current] of Object.entries(entry)) {
          const existing = set.get(poolId);
          if (existing !== undefined) existing.current = current;
          else {
            const pc = poolConfigs.find((c) => c.id === poolId);
            set.set(poolId, { id: poolId, current, max: pc?.max ?? current });
          }
        }
        pools.set(participantId, set);
      }
      hooks.onChange?.();
    },
  };
}
