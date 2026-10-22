import { devtools } from "../devtools/devtools";
import type { AxisInput } from "../input/axisInput";
import type { KinematicVehicleModifiers, KinematicVehicleTuning } from "./kinematicVehicle";

/**
 * Handling change one damage zone applies at its *last* stage. Multiplier fields read `1` = undamaged,
 * and a zone part-way through its stages gets the fraction between; `steerPull` and `drag` are additive
 * and reach their full value only at the last stage.
 */
export interface VehicleDamageEffect {
  /** Tire grip multiplier at full damage (`< 1` loses grip). */
  gripScale?: number;
  /** Drive-force multiplier at full damage. */
  engineScale?: number;
  brakeScale?: number;
  topSpeedScale?: number;
  /** Steering bias in radians at full damage — a bent frame that pulls one way. */
  steerPull?: number;
  /** Extra coast drag per second at full damage. */
  drag?: number;
}

/**
 * One damageable zone: a fixed local body point, the impulse thresholds that step it through its
 * stages, the bounded dent it shows, and the handling it costs. There is no mesh editing — a zone's
 * deformation is one displacement it can never exceed, so the visual can never grow without limit.
 */
export interface VehicleDamageZone {
  id: string;
  /** Local body point in metres (x right, y up, z forward); picks the zone nearest an impact and anchors the dent. */
  at: readonly [number, number, number];
  /** Impulse thresholds; the count is the zone's stage count, and the last stage is fully damaged. */
  thresholds: readonly number[];
  /** Dent displacement in metres at the last stage, scaled by stage. Omit for a zone that only changes handling. */
  deform?: readonly [number, number, number];
  /** Stage at which the part comes off (the renderer hides or drops it); omit to never detach. */
  detachStage?: number;
  /** Handling change at the last stage, reached proportionally across the stages. */
  effect?: VehicleDamageEffect;
}

/** Live state of one zone, as a HUD or a save reads it. */
export interface VehicleDamageZoneState {
  id: string;
  accumulated: number;
  stage: number;
  detached: boolean;
}

/** Serializable damage state: {@link VehicleDamage.restore} needs only this. */
export interface VehicleDamageState {
  zones: VehicleDamageZoneState[];
  total: number;
  disabled: boolean;
}

/** A zone crossing a threshold this tick — the event a HUD feed, a smoke puff or a camera shake keys off. */
export interface VehicleDamageTransition {
  zone: string;
  stage: number;
  previousStage: number;
  detached: boolean;
  disabled: boolean;
  total: number;
}

/** A zone's current dent: a bounded local displacement and whether the part has come off. */
export interface VehicleDeformation {
  zoneId: string;
  stage: number;
  /** Local displacement in metres, never larger than the zone's `deform`. */
  offset: readonly [number, number, number];
  /** The part has come off — the renderer hides or drops it. */
  detached: boolean;
}

/** Every zone's handling cost summed into one set of numbers (all fields present, defaults filled). */
export interface VehicleDamageEffectResolved {
  gripScale: number;
  engineScale: number;
  brakeScale: number;
  topSpeedScale: number;
  steerPull: number;
  drag: number;
}

/** Everything {@link createVehicleDamage} needs. */
export interface VehicleDamageConfig {
  zones: readonly VehicleDamageZone[];
  /** Total accumulated impulse across every zone that disables the vehicle; omit to never disable. */
  disableAt?: number;
  /** Called on each threshold crossing, for HUD/feed/audio. */
  onTransition?: (transition: VehicleDamageTransition) => void;
  /** Register a devtools probe under this name so the perf overlay shows the damage summary. */
  devtoolsName?: string;
}

/**
 * Fixed-zone crash damage for a vehicle: impacts accumulate into discrete stages, stages change handling
 * and show a bounded dent, and a part can come off at a set stage. Data-driven and bounded by
 * construction — the zone set is authored, each zone's deformation is one capped displacement, and no
 * mesh is edited. Serializes through {@link snapshot}/{@link restore}, so a save, a replay or a host
 * correction resumes mid-crash.
 */
export interface VehicleDamage {
  /**
   * Route an impulse to the zone nearest a local body hit point (x right, y up, z forward) and return
   * the transitions it caused — empty when nothing crossed a threshold. The caller rotates a world
   * impact into body space; this module never reads the world.
   */
  hit(local: readonly [number, number, number], impulse: number): readonly VehicleDamageTransition[];
  /** Add impulse straight to a named zone; null for an unknown zone or a non-positive impulse. */
  impact(zoneId: string, impulse: number): VehicleDamageTransition | null;
  stageOf(zoneId: string): number;
  zones(): readonly VehicleDamageZoneState[];
  /** Summed handling change across every zone at its current stage. */
  effect(): VehicleDamageEffectResolved;
  /** Bounded visual deformation, one entry per zone that has taken a stage — the render hook. */
  deformation(): readonly VehicleDeformation[];
  total(): number;
  disabled(): boolean;
  /**
   * Per-tick modifiers the sim applies for one frame. Use this for a scratch or a reset that should not
   * rebuild the tuning; for lasting damage call {@link damagedTuning} and `retune` once per change.
   */
  modifiers(): KinematicVehicleModifiers;
  snapshot(): VehicleDamageState;
  restore(next: VehicleDamageState): void;
  reset(): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const NO_EFFECT: VehicleDamageEffectResolved = {
  gripScale: 1,
  engineScale: 1,
  brakeScale: 1,
  topSpeedScale: 1,
  steerPull: 0,
  drag: 0,
};

function stageFor(thresholds: readonly number[], accumulated: number): number {
  let stage = 0;
  for (const threshold of thresholds) {
    if (accumulated >= threshold) stage += 1;
    else break;
  }
  return stage;
}

/**
 * Fixed-zone crash damage (issue #86's stage model) wired to handling and visuals: see {@link VehicleDamage}.
 *
 * @capability vehicle-damage fixed-zone crash damage that changes handling and shows a bounded dent, serializable
 */
export function createVehicleDamage(config: VehicleDamageConfig): VehicleDamage {
  const order: string[] = [];
  const defs = new Map<string, VehicleDamageZone>();
  const states = new Map<string, VehicleDamageZoneState>();
  for (const zone of config.zones) {
    if (defs.has(zone.id)) throw new Error(`duplicate damage zone: ${zone.id}`);
    defs.set(zone.id, zone);
    states.set(zone.id, { id: zone.id, accumulated: 0, stage: 0, detached: false });
    order.push(zone.id);
  }
  const disableAt = config.disableAt ?? null;
  let totalImpulse = 0;
  let disabledFlag = false;

  function absorb(zoneId: string, impulse: number): VehicleDamageTransition | null {
    const def = defs.get(zoneId);
    const state = states.get(zoneId);
    if (def === undefined || state === undefined || !(impulse > 0)) return null;
    const previousStage = state.stage;
    const wasDisabled = disabledFlag;
    state.accumulated += impulse;
    totalImpulse += impulse;
    state.stage = Math.min(def.thresholds.length, stageFor(def.thresholds, state.accumulated));
    let detachedNow = false;
    if (def.detachStage !== undefined && !state.detached && state.stage >= def.detachStage) {
      state.detached = true;
      detachedNow = true;
    }
    if (disableAt !== null && totalImpulse >= disableAt) disabledFlag = true;
    if (state.stage === previousStage && !detachedNow && disabledFlag === wasDisabled) return null;
    const transition: VehicleDamageTransition = {
      zone: zoneId,
      stage: state.stage,
      previousStage,
      detached: state.detached,
      disabled: disabledFlag,
      total: totalImpulse,
    };
    config.onTransition?.(transition);
    return transition;
  }

  function factorOf(def: VehicleDamageZone, stage: number): number {
    const maxStage = def.thresholds.length;
    return maxStage <= 0 ? 0 : Math.min(1, stage / maxStage);
  }

  function resolveEffect(): VehicleDamageEffectResolved {
    const out: VehicleDamageEffectResolved = { ...NO_EFFECT };
    for (const id of order) {
      const def = defs.get(id)!;
      const effect = def.effect;
      if (effect === undefined) continue;
      const factor = factorOf(def, states.get(id)!.stage);
      if (factor <= 0) continue;
      out.gripScale *= 1 + ((effect.gripScale ?? 1) - 1) * factor;
      out.engineScale *= 1 + ((effect.engineScale ?? 1) - 1) * factor;
      out.brakeScale *= 1 + ((effect.brakeScale ?? 1) - 1) * factor;
      out.topSpeedScale *= 1 + ((effect.topSpeedScale ?? 1) - 1) * factor;
      out.steerPull += (effect.steerPull ?? 0) * factor;
      out.drag += (effect.drag ?? 0) * factor;
    }
    return out;
  }

  const unregister =
    config.devtoolsName === undefined ? null : devtools.probes.register(config.devtoolsName, probeLine);

  function probeLine(): string {
    let worst = 0;
    let detached = 0;
    for (const id of order) {
      const state = states.get(id)!;
      if (state.stage > worst) worst = state.stage;
      if (state.detached) detached += 1;
    }
    return `${order.length} zones ${worst} stages ${detached} detached ${totalImpulse.toFixed(0)} impulse${disabledFlag ? " disabled" : ""}`;
  }

  return {
    hit(local, impulse) {
      if (!(impulse > 0)) return [];
      let best: string | null = null;
      let bestSq = Number.POSITIVE_INFINITY;
      for (const id of order) {
        const at = defs.get(id)!.at;
        const dx = local[0] - at[0];
        const dy = local[1] - at[1];
        const dz = local[2] - at[2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bestSq) {
          bestSq = distSq;
          best = id;
        }
      }
      if (best === null) return [];
      const transition = absorb(best, impulse);
      return transition === null ? [] : [transition];
    },
    impact: (zoneId, impulse) => absorb(zoneId, impulse),
    stageOf: (zoneId) => states.get(zoneId)?.stage ?? 0,
    zones: () => order.map((id) => ({ ...states.get(id)! })),
    effect: resolveEffect,
    deformation() {
      const out: VehicleDeformation[] = [];
      for (const id of order) {
        const def = defs.get(id)!;
        const state = states.get(id)!;
        if (state.stage <= 0) continue;
        const factor = factorOf(def, state.stage);
        const dent = def.deform;
        out.push({
          zoneId: id,
          stage: state.stage,
          offset:
            dent === undefined
              ? [0, 0, 0]
              : [dent[0] * factor, dent[1] * factor, dent[2] * factor],
          detached: state.detached,
        });
      }
      return out;
    },
    total: () => totalImpulse,
    disabled: () => disabledFlag,
    modifiers() {
      const effect = resolveEffect();
      return {
        topSpeedScale: effect.topSpeedScale,
        accelScale: effect.engineScale,
        brakeScale: effect.brakeScale,
        gripScale: effect.gripScale,
      };
    },
    snapshot: () => ({
      zones: order.map((id) => ({ ...states.get(id)! })),
      total: totalImpulse,
      disabled: disabledFlag,
    }),
    restore(next) {
      for (const saved of next.zones) {
        const state = states.get(saved.id);
        if (state === undefined) continue;
        state.accumulated = saved.accumulated;
        state.stage = Math.min(defs.get(saved.id)!.thresholds.length, Math.max(0, saved.stage));
        state.detached = saved.detached;
      }
      totalImpulse = next.total;
      disabledFlag = next.disabled;
    },
    reset() {
      for (const id of order) {
        const state = states.get(id)!;
        state.accumulated = 0;
        state.stage = 0;
        state.detached = false;
      }
      totalImpulse = 0;
      disabledFlag = false;
    },
    dispose() {
      unregister?.();
    },
  };
}

/**
 * Bake a damage effect into a tuning — the lasting-damage path. Hand the result to the sim's `retune`,
 * which keeps the vehicle's momentum; the base tuning is not mutated, so a repair is the same call with
 * the undamaged base.
 */
export function damagedTuning(
  base: KinematicVehicleTuning,
  effect: VehicleDamageEffectResolved,
): KinematicVehicleTuning {
  return {
    ...base,
    engineAccel: base.engineAccel * effect.engineScale,
    brakeAccel: base.brakeAccel * effect.brakeScale,
    topSpeed: base.topSpeed * effect.topSpeedScale,
    gripStrength: base.gripStrength * effect.gripScale,
    coastDeceleration: (base.coastDeceleration ?? 0) + effect.drag,
  };
}

/** Apply a damage `steerPull` to a steer axis, clamped to the input range — a bent frame pulling one way. */
export function damagedAxis(axis: AxisInput, effect: VehicleDamageEffectResolved): AxisInput {
  if (effect.steerPull === 0) return axis;
  return { ...axis, steer: Math.max(-1, Math.min(1, axis.steer + effect.steerPull)) };
}
