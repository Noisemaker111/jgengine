/**
 * A runner as the spring-mass model of R. Blickhan ("The spring-mass model for running and hopping", *J. Biomech.* 22,
 * 1989) and T. A. McMahon and G. C. Cheng (*J. Biomech.* 23, 1990): a point mass on a massless linear leg spring.
 */
export interface SpringMassRunner {
  /** Body mass, kg. */
  mass: number;
  /** Hip height standing (leg length), m. */
  legLength: number;
  /** Leg spring stiffness, N/m. */
  stiffness: number;
  /** Stride frequency at a running speed, Hz. */
  strideFrequency(speed: number): number;
}

/**
 * An 80 kg, 1.80 m man: leg length 0.94 m; leg stiffness 11 kN/m for 70 kg scaled with body mass (C. T. Farley,
 * J. Glasheen and T. A. McMahon, *J. Exp. Biol.* 185, 1993: human leg stiffness near-constant across running speeds);
 * stride frequency rising slowly with speed, 1.35 Hz at 3 m/s to 1.55 Hz at 6 m/s, fitted to P. R. Cavanagh and
 * R. Kram, *Med. Sci. Sports Exerc.* 21 (1989) and P. G. Weyand et al., *J. Appl. Physiol.* 89 (2000).
 */
export const RECREATIONAL_RUNNER: SpringMassRunner = {
  mass: 80,
  legLength: 0.94,
  stiffness: (11000 * 80) / 70,
  strideFrequency: (speed) => 1.35 + 0.0667 * Math.max(0, speed - 3),
};

/** A steady spring-mass running step from {@link springMassStep}. */
export interface SpringMassStep {
  speed: number;
  /** Leg angle from vertical at touchdown, rad. */
  touchdownAngle: number;
  /** Ground contact per step, s. */
  contactTime: number;
  /** Flight per step, s. */
  flightTime: number;
  /** Contact over stride time for one foot. */
  dutyFactor: number;
  /** Highest vertical ground force, body weights (one hump: running has no heel-strike double peak in this model). */
  peakForce: number;
  /** Leg compression at mid-stance, m. */
  legCompression: number;
  /** Centre-of-mass drop from touchdown to mid-stance, m. */
  verticalExcursion: number;
  /** Stride length (two steps), m. */
  strideLength: number;
  /** Peak vertical force over vertical excursion, kN/m. */
  verticalStiffness: number;
}

interface Stance {
  time: number;
  vy: number;
  vx: number;
  dx: number;
  peak: number;
  compression: number;
  drop: number;
}

function stance(r: SpringMassRunner, angle: number, vx0: number, vy0: number): Stance {
  const g = 9.81;
  const dt = 5e-5;
  let x = -r.legLength * Math.sin(angle);
  let y = r.legLength * Math.cos(angle);
  let vx = vx0;
  let vy = -vy0;
  const y0 = y;
  const x0 = x;
  let t = 0;
  let peak = 0;
  let compression = 0;
  let low = y;
  for (;;) {
    const l = Math.hypot(x, y);
    if ((l >= r.legLength && t > 0) || y <= 0 || t > 1) break;
    const f = r.stiffness * (r.legLength - l);
    vx += ((f * x) / l / r.mass) * dt;
    vy += ((f * y) / l / r.mass - g) * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    peak = Math.max(peak, (f * y) / l);
    compression = Math.max(compression, r.legLength - l);
    low = Math.min(low, y);
  }
  return { time: t, vy, vx, dx: x - x0, peak: peak / (r.mass * g), compression, drop: y0 - low };
}

/**
 * Steady running at `speed` (m/s): the touchdown angle that makes the stance symmetric (no net horizontal impulse) and the step time that matches
 * the runner's stride frequency, solved by bisection. Contact time, duty factor and peak force follow from the spring.
 * @capability spring-mass-running steady human running from the spring-mass model: contact time, duty factor, peak force
 */
export function springMassStep(runner: SpringMassRunner, speed: number): SpringMassStep {
  const g = 9.81;
  const stepTime = 1 / (2 * runner.strideFrequency(speed));
  // For a vertical touchdown speed, the angle with takeoff vertical speed equal to touchdown's.
  const symmetricAngle = (vx: number, vy: number) => {
    let lo = 0.01;
    let hi = 0.9;
    for (let i = 0; i < 30; i++) {
      const mid = 0.5 * (lo + hi);
      const s = stance(runner, mid, vx, vy);
      // Too steep a touchdown (small angle) vaults over the foot and leaves faster than it landed.
      if (s.vx > vx) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  let vy = 0.5;
  let vx = speed;
  let angle = 0.3;
  let s = stance(runner, angle, vx, vy);
  for (let outer = 0; outer < 20; outer++) {
    angle = symmetricAngle(vx, vy);
    s = stance(runner, angle, vx, vy);
    const flight = (2 * vy) / g;
    // Match the step period with the flight, and the mean speed with the touchdown horizontal speed.
    const period = s.time + flight;
    vy = Math.max(0.01, vy + 0.5 * (stepTime - period) * g * 0.5);
    const mean = (s.dx + vx * flight) / (s.time + flight);
    vx += speed - mean;
  }
  const flight = (2 * vy) / g;
  const step = s.time + flight;
  return {
    speed,
    touchdownAngle: angle,
    contactTime: s.time,
    flightTime: flight,
    dutyFactor: s.time / (2 * step),
    peakForce: s.peak,
    legCompression: s.compression,
    verticalExcursion: s.drop,
    strideLength: 2 * speed * step,
    verticalStiffness: (s.peak * runner.mass * g) / Math.max(1e-6, s.drop) / 1000,
  };
}
