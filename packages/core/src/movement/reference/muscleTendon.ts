/** One joint a muscle–tendon unit crosses, in the extension-angle convention of {@link MuscleSpec}. */
export interface MuscleJointSpan {
  joint: "hip" | "knee" | "ankle";
  /** `+1` when the muscle extends the joint (raises its extension angle), `−1` when it flexes it. */
  direction: 1 | -1;
  /** Moment arm at its maximum, m. */
  r0: number;
  /** Extension angle (rad) of the maximum moment arm; `null` for a constant arm (the hip). */
  phiMax: number | null;
  /** Extension angle (rad) at which the unit's length is `lopt + lslack`. */
  phiRef: number;
  /** Pennation and path factor on length change. */
  rho: number;
}

/** A Hill-type muscle–tendon unit. */
export interface MuscleSpec {
  name: string;
  /** Maximum isometric force, N. */
  fmax: number;
  /** Optimal fibre length, m. */
  lopt: number;
  /** Tendon slack length, m. */
  lslack: number;
  /** Maximum shortening speed, optimal lengths per second. */
  vmax: number;
  spans: readonly MuscleJointSpan[];
}

/**
 * Shared contractile and elastic constants of the muscle model of H. Geyer, A. Seyfarth and R. Blickhan
 * ("Positive force feedback in bouncing gaits?", *Proc. R. Soc. B* 270, 2003), as listed in Appendix II of Geyer & Herr
 * (2010): activation time constant 10 ms, force–length width 0.56·lopt with residual force 0.05, eccentric enhancement
 * 1.5 and shape factor 5, tendon reference strain 0.04.
 */
export const HILL_CONSTANTS = { tau: 0.01, width: 0.56, residual: 0.05, eccentric: 1.5, shape: 5, tendonStrain: 0.04 } as const;

/** Live state of one muscle. */
export interface MuscleState {
  activation: number;
  /** Contractile-element (fibre) length, m. */
  lce: number;
  /** Fibre velocity, m/s (positive lengthening). */
  vce: number;
  /** Tendon (and unit) force, N. */
  force: number;
}

/**
 * Length change of the unit from its reference, m, at extension angles `phi` (by joint).
 * @internal
 */
export function muscleLengthChange(spec: MuscleSpec, phi: Record<"hip" | "knee" | "ankle", number>): number {
  let dl = 0;
  for (const span of spec.spans) {
    const angle = phi[span.joint];
    const change = span.phiMax === null ? angle - span.phiRef : Math.sin(angle - span.phiMax) - Math.sin(span.phiRef - span.phiMax);
    dl -= span.direction * span.rho * span.r0 * change;
  }
  return dl;
}

/**
 * Moment arm of a span at extension angle `phi`, m.
 * @internal
 */
export function momentArm(span: MuscleJointSpan, phi: number): number {
  return span.phiMax === null ? span.r0 : span.r0 * Math.cos(phi - span.phiMax);
}

const C_LOG = Math.log(HILL_CONSTANTS.residual);

function forceLength(lce: number, lopt: number): number {
  const x = Math.abs((lce - lopt) / (lopt * HILL_CONSTANTS.width));
  return Math.exp(C_LOG * x * x * x);
}

/** Fibre velocity (normalised to lopt·vmax, positive lengthening) that yields force–velocity factor `f`. */
function inverseForceVelocity(f: number): number {
  const { eccentric: n, shape: k } = HILL_CONSTANTS;
  if (f <= 1) return (Math.max(0, f) - 1) / (1 + k * Math.max(0, f));
  const capped = Math.min(f, n - 1e-3);
  return -(capped - 1) / (7.56 * k * (capped - n) - (n - 1));
}

/**
 * Fresh state at rest for unit length `lmtu`: fibres at the length where the slack tendon carries no force.
 * @internal
 */
export function restingMuscle(spec: MuscleSpec, lmtu: number): MuscleState {
  return { activation: 0.01, lce: Math.max(spec.lopt * (1 - HILL_CONSTANTS.width), Math.min(spec.lopt * 1.2, lmtu - spec.lslack)), vce: 0, force: 0 };
}

/**
 * Advance one muscle by `dt` at unit length `lmtu` (m) under stimulation `stimulation` (0.01–1): first-order
 * activation, then the fibre velocity that balances tendon, contractile, parallel and buffer forces (Geyer & Herr 2010,
 * Appendix II), integrated for the new fibre length. Returns the tendon force, N.
 * @capability hill-muscle Hill-type muscle-tendon unit with tendon elasticity and activation dynamics (Geyer 2003)
 */
export function stepMuscle(spec: MuscleSpec, state: MuscleState, lmtu: number, stimulation: number, dt: number): number {
  const s = Math.max(0.01, Math.min(1, stimulation));
  state.activation += ((s - state.activation) * dt) / HILL_CONSTANTS.tau;
  const { width, tendonStrain } = HILL_CONSTANTS;
  const lse = lmtu - state.lce;
  const strain = (lse - spec.lslack) / spec.lslack;
  const fse = strain > 0 ? spec.fmax * (strain / tendonStrain) ** 2 : 0;
  const lmin = spec.lopt * (1 - width);
  const fbe = state.lce < lmin ? spec.fmax * ((lmin - state.lce) / (spec.lopt * width * 0.5)) ** 2 : 0;
  const stretch = state.lce > spec.lopt ? ((state.lce - spec.lopt) / (spec.lopt * width)) ** 2 : 0;
  const active = state.activation * forceLength(state.lce, spec.lopt);
  const fv = (fse + fbe) / (spec.fmax * (active + stretch));
  state.vce = inverseForceVelocity(fv) * spec.vmax * spec.lopt;
  state.lce = Math.max(lmin * 0.5, state.lce + state.vce * dt);
  state.force = fse;
  return fse;
}

/**
 * Metabolic power of a muscle, W (A. E. Minetti and R. McN. Alexander, "A theory of metabolic costs for bipedal
 * gaits", *J. Theor. Biol.* 186, 1997): `A·Fmax·vmax·φ(v/vmax)` with
 * `φ(x) = (0.054 + 0.506x + 2.46x²)/(1 − 1.13x + 12.8x² − 1.64x³)` while shortening, and the isometric rate while
 * lengthening.
 * @capability muscle-energetics metabolic power of a Hill muscle from activation and shortening speed (Minetti & Alexander 1997)
 */
export function muscleMetabolicPower(spec: MuscleSpec, state: MuscleState): number {
  const vmax = spec.vmax * spec.lopt;
  const x = Math.min(1, Math.max(0, -state.vce / vmax));
  const phi = (0.054 + 0.506 * x + 2.46 * x * x) / (1 - 1.13 * x + 12.8 * x * x - 1.64 * x * x * x);
  return state.activation * spec.fmax * vmax * phi;
}
