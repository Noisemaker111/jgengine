import type { CollisionEvent } from "./physicsWorld";

export interface DamageZoneDef {
  id: string;
  thresholds: readonly number[];
  detachStage?: number;
}

export interface DamageZoneState {
  id: string;
  accumulated: number;
  stage: number;
  detached: boolean;
}

export interface DamageTransition {
  zone: string;
  stage: number;
  previousStage: number;
  detached: boolean;
  disabled: boolean;
  accumulated: number;
  total: number;
}

export interface DamageModelConfig {
  zones: readonly DamageZoneDef[];
  disableAt?: number;
  onStage?: (transition: DamageTransition) => void;
  onDetach?: (zoneId: string, accumulated: number) => void;
}

function stageFor(thresholds: readonly number[], accumulated: number): number {
  let stage = 0;
  for (const t of thresholds) {
    if (accumulated >= t) stage += 1;
    else break;
  }
  return stage;
}

/**
 * Coarse crash-damage model (issue #86 — stages, not soft-body). Each zone accumulates contact impulse
 * fed from G3's `onCollision` `CollisionEvent`; crossing a threshold bumps the zone to the next discrete
 * stage (the caller swaps the visual/collider), an optional `detachStage` ejects a part as debris once,
 * and a total-impulse `disableAt` flips the whole body to a disabled state. `absorb` returns a transition
 * only when something actually changed, so it doubles as the event source for HUD/feed.
 */
export class DamageModel {
  private readonly zones = new Map<string, { def: DamageZoneDef; state: DamageZoneState }>();
  private readonly order: string[] = [];
  private readonly disableAt: number | null;
  private readonly onStage?: (transition: DamageTransition) => void;
  private readonly onDetach?: (zoneId: string, accumulated: number) => void;
  private totalImpulse = 0;
  private disabledFlag = false;

  constructor(config: DamageModelConfig) {
    for (const def of config.zones) {
      this.zones.set(def.id, { def, state: { id: def.id, accumulated: 0, stage: 0, detached: false } });
      this.order.push(def.id);
    }
    this.disableAt = config.disableAt ?? null;
    this.onStage = config.onStage;
    this.onDetach = config.onDetach;
  }

  get total(): number {
    return this.totalImpulse;
  }

  get disabled(): boolean {
    return this.disabledFlag;
  }

  stageOf(zoneId: string): number {
    return this.zones.get(zoneId)?.state.stage ?? 0;
  }

  states(): readonly DamageZoneState[] {
    return this.order.map((id) => {
      const s = this.zones.get(id)!.state;
      return { id: s.id, accumulated: s.accumulated, stage: s.stage, detached: s.detached };
    });
  }

  absorb(zoneId: string, impulse: number): DamageTransition | null {
    const entry = this.zones.get(zoneId);
    if (entry === undefined || impulse <= 0) return null;
    const { def, state } = entry;
    const previousStage = state.stage;
    const wasDisabled = this.disabledFlag;
    state.accumulated += impulse;
    this.totalImpulse += impulse;
    state.stage = stageFor(def.thresholds, state.accumulated);

    let detachedNow = false;
    if (
      def.detachStage !== undefined &&
      !state.detached &&
      state.stage >= def.detachStage
    ) {
      state.detached = true;
      detachedNow = true;
      this.onDetach?.(zoneId, state.accumulated);
    }

    if (this.disableAt !== null && this.totalImpulse >= this.disableAt) this.disabledFlag = true;

    const changed = state.stage !== previousStage || detachedNow || this.disabledFlag !== wasDisabled;
    if (!changed) return null;

    const transition: DamageTransition = {
      zone: zoneId,
      stage: state.stage,
      previousStage,
      detached: state.detached,
      disabled: this.disabledFlag,
      accumulated: state.accumulated,
      total: this.totalImpulse,
    };
    this.onStage?.(transition);
    return transition;
  }

  /**
   * Route a raw {@link CollisionEvent} into a zone by a caller-supplied selector (front/rear/side from
   * `nx`/`nz`, or which body index took the hit). The event's `impulse` feeds `absorb`.
   */
  routeCollision(
    event: CollisionEvent,
    resolveZone: (event: CollisionEvent) => string | null,
  ): DamageTransition | null {
    const zone = resolveZone(event);
    if (zone === null) return null;
    return this.absorb(zone, Math.abs(event.impulse));
  }

  reset(): void {
    for (const { state } of this.zones.values()) {
      state.accumulated = 0;
      state.stage = 0;
      state.detached = false;
    }
    this.totalImpulse = 0;
    this.disabledFlag = false;
  }
}

export function createDamageModel(config: DamageModelConfig): DamageModel {
  return new DamageModel(config);
}
