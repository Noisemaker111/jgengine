import type { WeaponHandlingFrame } from "./weaponHandling";

/** Camera-space position `[x, y, z]` in metres: `+x` right, `+y` up, `-z` forward. */
export type ViewmodelOffset = readonly [number, number, number];

/**
 * How one weapon sits in first person. Offsets are camera-space metres, angles are radians, FOVs are
 * degrees. Every field is optional; two weapons differ by the ones they set.
 */
export interface WeaponPresentationTuning {
  /** Viewmodel anchor at the hip (default `[0.34, -0.26, -0.72]`). */
  hip?: ViewmodelOffset;
  /** Viewmodel anchor fully aimed; put the sight on the camera axis (default `[0, -0.07, -0.55]`). */
  ads?: ViewmodelOffset;
  /** Viewmodel FOV in degrees, independent of the world FOV; omit to draw the viewmodel at the world FOV. */
  viewmodelFov?: { hip?: number; ads?: number };
  /** World FOV multiplier at full ADS, e.g. `0.8` for a light zoom (default `1`). */
  adsZoom?: number;
  /** Viewmodel lag behind look motion. */
  sway?: {
    /** Radians of lag per rad/s of look speed (default `0.02`). */
    perRadPerSec?: number;
    /** Largest lag, rad (default `0.08`). */
    max?: number;
    /** How fast lag follows its target, 1/s (default `12`). */
    response?: number;
    /** Lag multiplier at full ADS (default `0.3`). */
    adsScale?: number;
  };
  /** Walk bob driven by the movement probe's speed and `bobPhase`. */
  bob?: {
    /** Side and vertical amplitude in metres at `fullSpeed` (default `[0.012, 0.01]`). */
    amplitude?: readonly [number, number];
    /** Ground speed that gives the full amplitude, m/s (default `4`). */
    fullSpeed?: number;
    /** Bob multiplier at full ADS (default `0.25`). */
    adsScale?: number;
  };
  /** Viewmodel reaction to the handling's recoil offset. */
  kick?: {
    /** Metres pushed back per radian of recoil (default `1.2`). */
    back?: number;
    /** Viewmodel muzzle rise per radian of recoil (default `1.5`). */
    rise?: number;
  };
}

/** One frame of inputs: look motion, the movement probe, and the weapon's handling readout. */
export interface WeaponPresentationInput {
  /** Look yaw speed, rad/s, positive turning left (the same sign as a camera yaw that grows left). */
  lookYawRate: number;
  /** Look pitch speed, rad/s, positive looking up. */
  lookPitchRate: number;
  /** Horizontal ground speed, m/s (e.g. `EntityRenderCues.speed`). */
  speed: number;
  /** `0..1` walk-cycle phase (e.g. `EntityRenderCues.bobPhase`). */
  bobPhase: number;
  handling: WeaponHandlingFrame;
}

/**
 * Where the viewmodel and camera go this frame. First person applies all of it; third person and
 * over-the-shoulder read `lookPitch`/`lookYaw`, `aimPitch`/`aimYaw` and `adsProgress` from the same frame.
 */
export interface WeaponPose {
  /** Viewmodel anchor, camera-space metres. */
  offset: [number, number, number];
  /** Viewmodel rotation about its anchor, rad: `pitch > 0` muzzle up, `yaw > 0` muzzle left, `roll > 0` tilts left. */
  pitch: number;
  yaw: number;
  roll: number;
  /** Viewmodel FOV in degrees, or `null` to use the world FOV. */
  viewmodelFov: number | null;
  /** Multiplier for the world FOV (ADS zoom). */
  fovScale: number;
  /** Offset to add to the camera look, rad: aim kick plus view punch. `lookYaw > 0` pulls right. */
  lookPitch: number;
  lookYaw: number;
  /** Offset shots follow, rad; a third-person rig or upper-body aim reads this. */
  aimPitch: number;
  aimYaw: number;
  /** `0` hip … `1` fully aimed. */
  adsProgress: number;
}

/** Serializable presentation state: the current sway lag. */
export interface WeaponPresentationState {
  swayPitch: number;
  swayYaw: number;
}

/** Turns a {@link WeaponHandlingFrame} plus look and movement into a viewmodel and camera pose. */
export interface WeaponPresentation {
  /** Advance sway by `dt` and return the pose. The returned object is reused between calls. */
  update(dt: number, input: WeaponPresentationInput): WeaponPose;
  pose(): WeaponPose;
  retune(next: WeaponPresentationTuning): void;
  snapshot(): WeaponPresentationState;
  restore(state: WeaponPresentationState): void;
  reset(): void;
}

/** Default hip anchor, matching the shell's built-in viewmodel. */
export const DEFAULT_VIEWMODEL_HIP: ViewmodelOffset = [0.34, -0.26, -0.72];
/** Default ADS anchor: the built-in viewmodel's top rail on the camera axis. */
export const DEFAULT_VIEWMODEL_ADS: ViewmodelOffset = [0, -0.07, -0.55];

const TAU = Math.PI * 2;
const DEFAULT_BOB = [0.012, 0.01] as const;

function lerp(hip: number, aimed: number, ads: number): number {
  return hip * (1 - ads) + aimed * ads;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Creates a {@link WeaponPresentation}: per-weapon viewmodel offset, ADS pose and viewmodel FOV, sway
 * and inertia from look speed, bob from the movement probe, and a recoil kick, all driven by the same
 * handling frame third-person and over-the-shoulder rigs read. Deterministic and allocation-free per update.
 * @capability weapon-presentation per-weapon viewmodel offset, ADS pose, viewmodel FOV, sway, bob and recoil kick from a weapon handling frame
 */
export function createWeaponPresentation(initial: WeaponPresentationTuning = {}): WeaponPresentation {
  let tuning = initial;
  const state: WeaponPresentationState = { swayPitch: 0, swayYaw: 0 };
  const out: WeaponPose = {
    offset: [...(tuning.hip ?? DEFAULT_VIEWMODEL_HIP)],
    pitch: 0,
    yaw: 0,
    roll: 0,
    viewmodelFov: tuning.viewmodelFov?.hip ?? null,
    fovScale: 1,
    lookPitch: 0,
    lookYaw: 0,
    aimPitch: 0,
    aimYaw: 0,
    adsProgress: 0,
  };

  return {
    update(dt, input) {
      const step = Math.max(0, dt);
      const handling = input.handling;
      const ads = Math.max(0, Math.min(1, handling.adsProgress));

      const sway = tuning.sway;
      const swayMax = sway?.max ?? 0.08;
      const swayScale = lerp(1, sway?.adsScale ?? 0.3, ads);
      const per = sway?.perRadPerSec ?? 0.02;
      const targetYaw = clamp(-input.lookYawRate * per, swayMax) * swayScale;
      const targetPitch = clamp(-input.lookPitchRate * per, swayMax) * swayScale;
      const follow = 1 - Math.exp(-(sway?.response ?? 12) * step);
      state.swayYaw += (targetYaw - state.swayYaw) * follow;
      state.swayPitch += (targetPitch - state.swayPitch) * follow;

      const bob = tuning.bob;
      const [bobX, bobY] = bob?.amplitude ?? DEFAULT_BOB;
      const bobScale = Math.min(1, Math.max(0, input.speed) / Math.max(1e-6, bob?.fullSpeed ?? 4)) * lerp(1, bob?.adsScale ?? 0.25, ads);
      const phase = input.bobPhase * TAU;

      const recoil = Math.hypot(handling.aimPitch + handling.cameraPitch, handling.aimYaw + handling.cameraYaw);
      const hip = tuning.hip ?? DEFAULT_VIEWMODEL_HIP;
      const aimed = tuning.ads ?? DEFAULT_VIEWMODEL_ADS;
      out.offset[0] = lerp(hip[0], aimed[0], ads) + Math.sin(phase) * bobX * bobScale;
      out.offset[1] = lerp(hip[1], aimed[1], ads) - Math.abs(Math.sin(phase)) * bobY * bobScale;
      out.offset[2] = lerp(hip[2], aimed[2], ads) + recoil * (tuning.kick?.back ?? 1.2);
      out.pitch = state.swayPitch + recoil * (tuning.kick?.rise ?? 1.5);
      out.yaw = state.swayYaw;
      out.roll = state.swayYaw * 0.5;

      const hipFov = tuning.viewmodelFov?.hip ?? tuning.viewmodelFov?.ads;
      const adsFov = tuning.viewmodelFov?.ads ?? hipFov;
      out.viewmodelFov = hipFov === undefined || adsFov === undefined ? null : lerp(hipFov, adsFov, ads);
      out.fovScale = lerp(1, tuning.adsZoom ?? 1, ads);
      out.lookPitch = handling.aimPitch + handling.cameraPitch;
      out.lookYaw = handling.aimYaw + handling.cameraYaw;
      out.aimPitch = handling.aimPitch;
      out.aimYaw = handling.aimYaw;
      out.adsProgress = ads;
      return out;
    },
    pose: () => out,
    retune(next) {
      tuning = next;
    },
    snapshot: () => ({ ...state }),
    restore(next) {
      state.swayPitch = next.swayPitch;
      state.swayYaw = next.swayYaw;
    },
    reset() {
      state.swayPitch = 0;
      state.swayYaw = 0;
    },
  };
}

/**
 * Scale for a viewmodel drawn at `viewmodelFov` through a camera at `worldFov` (both degrees): multiply
 * the viewmodel's camera-space x and y by this and it projects as if rendered with its own FOV, without
 * a second camera or render pass.
 */
export function viewmodelFovScale(worldFov: number, viewmodelFov: number): number {
  const toHalf = (deg: number) => Math.tan((Math.max(1, Math.min(179, deg)) * Math.PI) / 360);
  return toHalf(worldFov) / toHalf(viewmodelFov);
}
