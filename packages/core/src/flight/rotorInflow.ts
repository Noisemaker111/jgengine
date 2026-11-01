// @skill jgengine-world

/**
 * The rotor inflow effect: blade-element thrust and torque over the disc with momentum inflow, so thrust at a fixed
 * collective falls in a climb, rises in a descent (through the vortex ring state on Leishman's empirical curve), rises
 * with forward speed as the induced flow is blown away (translational lift), and rises near the ground
 * (Cheeseman–Bennett, fading with forward speed). Torque is induced and climb power plus Bailey's profile drag.
 * The collective lever `0..1` sets blade pitch through `collective`.
 */
export interface AircraftRotorInflow {
  /**
   * Multiplier on the effect: `0` off (the rotor block's `maxThrust` and `torque` laws, the simple model), `1` as
   * measured (default), past `1` the induced flow scales with the strength (a more heavily loaded disc); sane over `0..4`.
   */
  strength?: number;
  /** Blade count (default `4`, the Bo-105). */
  blades?: number;
  /** Blade chord, m (default `0.27`). */
  chord?: number;
  /** Linear twist root to tip, rad (default `−8°`). */
  twist?: number;
  /** Inner edge of the lifting blade, share of the radius (default `0.2`). */
  rootCutout?: number;
  /** Rated rotor speed, rad/s (default `44.5`, a 218.5 m/s tip on the Bo-105's 4.91 m blade). */
  ratedSpeed?: number;
  /** Section lift slope, per rad (default `6.0`, NACA 23012). */
  liftSlope?: number;
  /** Section zero-lift angle, rad (default `−1.2°`, NACA 23012). */
  zeroLift?: number;
  /** Profile drag polar `d0 + d1·α + d2·α²` at the mean blade angle (default Bailey's `[0.0087, −0.0216, 0.4]`). */
  profileDrag?: readonly [number, number, number];
  /** Blade pitch at 75% radius at the bottom and top of the collective lever, rad (default `0` and `16°`). */
  collective?: readonly [number, number];
  /** Prandtl tip loss: the share of the radius that lifts (default `0.97`). */
  tipLoss?: number;
  /** Induced power factor over ideal momentum theory (default `1.15`). */
  inducedPower?: number;
}

/** What the rotor does at one condition. */
export interface RotorInflowLoads {
  /** Thrust along the shaft, N. */
  thrust: number;
  /** Aerodynamic torque resisting rotation, N·m. */
  torque: number;
  /** Induced inflow ratio `v_i/ΩR`, the warm start for the next call. */
  inflow: number;
  /** Ground effect factor on the induced velocity, `≤ 1`. */
  groundEffect: number;
}

const DEG = Math.PI / 180;
const STATIONS = 12;

function vortexRing(climb: number): number {
  return 1 - 0.978 * climb - 1.193 * climb ** 2 - 1.494 * climb ** 3 - 0.57 * climb ** 4;
}

/**
 * Rotor thrust and torque at a collective lever `0..1`, rotor speed (share of rated), axial velocity through the disc
 * (m/s, positive climbing), edgewise speed (m/s), air density and hub height above the ground (m). `inflow` is the
 * previous induced inflow ratio; the solve relaxes from it until it settles, so calling every substep costs a step or two.
 * @capability aircraft-rotor-inflow blade-element rotor thrust and torque with momentum inflow, vortex ring and ground effect
 */
export function rotorInflowLoads(
  effect: AircraftRotorInflow,
  strength: number,
  radius: number,
  lever: number,
  speedShare: number,
  climb: number,
  edgewise: number,
  density: number,
  height: number,
  inflow: number,
  out: RotorInflowLoads,
): RotorInflowLoads {
  const blades = effect.blades ?? 4;
  const chord = effect.chord ?? 0.27;
  const twist = effect.twist ?? -8 * DEG;
  const root = effect.rootCutout ?? 0.2;
  const slope = effect.liftSlope ?? 6;
  const zero = effect.zeroLift ?? -1.2 * DEG;
  const [low, high] = effect.collective ?? [0, 16 * DEG];
  const tip = effect.tipLoss ?? 0.97;
  const kappa = effect.inducedPower ?? 1.15;
  const [d0, d1, d2] = effect.profileDrag ?? [0.0087, -0.0216, 0.4];
  const scale = Math.max(1, strength);
  const sigma = (blades * chord) / (Math.PI * radius);
  const tipSpeed = Math.max(1e-3, Math.max(0, speedShare) * (effect.ratedSpeed ?? 44.5) * radius);
  const theta = low + (high - low) * Math.max(0, Math.min(1, lever)) - zero;
  const mu = edgewise / tipSpeed;
  const lc = climb / tipSpeed;
  const dr = (tip - root) / STATIONS;
  // CT is linear in the inflow: CT = A − B·λ.
  let pitchIntegral = 0;
  let inflowIntegral = 0;
  for (let i = 0; i < STATIONS; i += 1) {
    const r = root + (i + 0.5) * dr;
    pitchIntegral += (theta + twist * (r - 0.75)) * (r * r + (mu * mu) / 2) * dr;
    inflowIntegral += r * dr;
  }
  const ctA = 0.5 * sigma * slope * pitchIntegral;
  const ctB = 0.5 * sigma * slope * inflowIntegral;
  const finite = Number.isFinite(height) && height > 0;
  let li = Number.isFinite(inflow) ? inflow : 0.05;
  let ct = 0;
  let ground = 1;
  for (let k = 0; k < 40; k += 1) {
    ground = finite ? Math.max(0.5, 1 - (radius / (4 * Math.max(height, 0.3 * radius))) ** 2 / (1 + (mu / Math.max(1e-3, Math.abs(li))) ** 2)) : 1;
    ct = ctA - ctB * (lc + ground * li * scale);
    const hover = Math.sqrt(Math.abs(ct) / 2);
    let total = Math.max(1e-4, Math.hypot(mu, lc + li));
    if (ct > 0 && hover > 1e-4) {
      const ratio = lc / hover;
      const clean = Math.max(0, 1 - (mu / hover) ** 2);
      if (ratio < 0 && ratio > -2 && clean > 0) total += clean * (ct / (2 * hover * vortexRing(ratio)) - total);
    }
    total = Math.max(0.3 * hover, total, 1e-4);
    const change = 0.5 * (ct / (2 * total) - li);
    li += change;
    if (Math.abs(change) < 1e-7) break;
  }
  ct = ctA - ctB * (lc + ground * li * scale);
  const meanAlpha = (6 * ct) / (sigma * slope);
  const cd = d0 + d1 * meanAlpha + d2 * meanAlpha * meanAlpha;
  const cp = ct * (lc + kappa * ground * li * scale) + ((sigma * cd) / 8) * (1 + 4.65 * mu * mu);
  const dynamic = density * Math.PI * radius * radius * tipSpeed * tipSpeed;
  out.thrust = ct * dynamic;
  out.torque = cp * dynamic * radius;
  out.inflow = li;
  out.groundEffect = ground;
  return out;
}
