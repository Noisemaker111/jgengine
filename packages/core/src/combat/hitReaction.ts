import type { EntityPosition } from "../scene/entityStore";

export interface CameraShake {
  amplitude: number;
  decay: number;
}

export interface HitReactionConfig {
  hitstopMs: number;
  knockback: number;
  vertical?: number;
  shake?: CameraShake;
  /** Trauma (0..1) fed to a trauma² camera-shake channel — the calibrated alternative to `shake`. */
  trauma?: number;
  /** Slow-mo factor during hitstop (e.g. 0.05 = 5% speed); read by the game's own time-scale system, not applied here. */
  timescale?: number;
}

export interface HitReactionInput {
  attackerPos: EntityPosition;
  targetPos: EntityPosition;
  power?: number;
}

export interface HitReaction {
  hitstopMs: number;
  impulse: [number, number, number];
  shake: CameraShake | null;
  trauma: number | null;
  timescale: number | null;
}

/** A calibrated `resolveHitReaction` config for a named impact event — hitstop + trauma so feel works with zero tuning. */
export interface ImpactPreset {
  hitstopMs: number;
  trauma: number;
  timescale?: number;
  knockback?: number;
  vertical?: number;
}

/**
 * Calibrated per-event impact feel — hitstop and trauma numbers harvested
 * from a shipped game-feel reference, not hand-invented per game. `explosion`
 * and `playerHit` are "heavy hit" events (60–90ms hitstop @ 0.05 timescale);
 * `pickup`/`jumpLand` are light events with no hitstop. Trauma is later
 * clamped to 1.0 by `resolveHitReaction`.
 *
 * @capability impact-feel calibrated hitstop + trauma preset for a named impact event
 */
export const impactPresets = {
  pickup: { hitstopMs: 0, trauma: 0.15 },
  jumpLand: { hitstopMs: 0, trauma: 0.2 },
  enemyKilled: { hitstopMs: 40, trauma: 0.3 },
  playerHit: { hitstopMs: 70, trauma: 0.4, timescale: 0.05 },
  explosion: { hitstopMs: 90, trauma: 0.7, timescale: 0.05 },
} as const satisfies Record<string, ImpactPreset>;

/** A named key into {@link impactPresets} (`"pickup" | "jumpLand" | "enemyKilled" | "playerHit" | "explosion"`). */
export type ImpactPresetName = keyof typeof impactPresets;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function configFromPreset(name: ImpactPresetName): HitReactionConfig {
  const preset: ImpactPreset = impactPresets[name];
  return {
    hitstopMs: preset.hitstopMs,
    knockback: preset.knockback ?? 0,
    trauma: preset.trauma,
    ...(preset.vertical === undefined ? {} : { vertical: preset.vertical }),
    ...(preset.timescale === undefined ? {} : { timescale: preset.timescale }),
  };
}

/**
 * Resolves hit feel (hitstop, knockback impulse, camera shake) from either a
 * named `impactPresets` event (`resolveHitReaction("explosion", input)`) or a
 * raw `HitReactionConfig` override.
 *
 * @capability impact-feel resolve hitstop/knockback/shake feel from an impact preset or raw config
 */
export function resolveHitReaction(
  config: HitReactionConfig | ImpactPresetName,
  input: HitReactionInput,
): HitReaction {
  const resolved = typeof config === "string" ? configFromPreset(config) : config;
  const power = input.power ?? 1;
  const dx = input.targetPos[0] - input.attackerPos[0];
  const dz = input.targetPos[2] - input.attackerPos[2];
  const planar = Math.hypot(dx, dz);
  const nx = planar === 0 ? 0 : dx / planar;
  const nz = planar === 0 ? 0 : dz / planar;
  const magnitude = resolved.knockback * power;
  const shake = resolved.shake === undefined
    ? null
    : { amplitude: resolved.shake.amplitude * power, decay: resolved.shake.decay };
  const trauma = resolved.trauma === undefined ? null : clamp01(resolved.trauma * power);
  return {
    hitstopMs: resolved.hitstopMs,
    impulse: [nx * magnitude, (resolved.vertical ?? 0) * power, nz * magnitude],
    shake,
    trauma,
    timescale: resolved.timescale ?? null,
  };
}

export function applyImpulse(position: EntityPosition, impulse: [number, number, number]): EntityPosition {
  return [position[0] + impulse[0], position[1] + impulse[1], position[2] + impulse[2]];
}
