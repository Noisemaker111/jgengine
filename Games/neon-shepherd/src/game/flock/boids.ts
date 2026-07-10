export interface CreaturePos {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  alive: boolean;
  straggler: boolean;
}

export type HerdMode = "idle" | "follow" | "gather" | "hold";

export interface FlockTuning {
  maxSpeed: number;
  gatherSpeed: number;
  accel: number;
  separationRadius: number;
  separationStrength: number;
  cohesionRadius: number;
  cohesionStrength: number;
  trustRadius: number;
  holdRingRadius: number;
  wanderRadius: number;
  wanderFreq: number;
}

export const DEFAULT_FLOCK_TUNING: FlockTuning = {
  maxSpeed: 5.2,
  gatherSpeed: 8.5,
  accel: 10,
  separationRadius: 1.1,
  separationStrength: 6,
  cohesionRadius: 4,
  cohesionStrength: 1.4,
  trustRadius: 9,
  holdRingRadius: 2.4,
  wanderRadius: 0.6,
  wanderFreq: 0.6,
};

function clampMag(x: number, z: number, max: number): [number, number] {
  const m = Math.hypot(x, z);
  if (m <= max || m === 0) return [x, z];
  const scale = max / m;
  return [x * scale, z * scale];
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export function holdRingTarget(
  anchor: { x: number; z: number },
  index: number,
  total: number,
  radius: number,
): { x: number; z: number } {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  return { x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius };
}

export function wanderTarget(
  base: { x: number; z: number },
  id: string,
  t: number,
  tuning: FlockTuning,
): { x: number; z: number } {
  const phase = hashId(id) * Math.PI * 2;
  return {
    x: base.x + Math.cos(phase + t * tuning.wanderFreq) * tuning.wanderRadius,
    z: base.z + Math.sin(phase + t * tuning.wanderFreq) * tuning.wanderRadius,
  };
}

export interface StepFlockInput {
  creatures: readonly CreaturePos[];
  shepherd: { x: number; z: number };
  mode: HerdMode;
  holdAnchor: { x: number; z: number } | null;
  strayBase: ReadonlyMap<string, { x: number; z: number }>;
  dt: number;
  t: number;
  tuning: FlockTuning;
}

export function stepFlock(input: StepFlockInput): CreaturePos[] {
  const { creatures, shepherd, mode, holdAnchor, dt, t, tuning } = input;
  const alive = creatures.filter((creature) => creature.alive);

  return creatures.map((creature) => {
    if (!creature.alive) return creature;

    let straggler = creature.straggler;
    let target = shepherd;
    let speedCap = tuning.maxSpeed;

    if (mode === "hold" && holdAnchor !== null) {
      const index = alive.findIndex((c) => c.id === creature.id);
      target = holdRingTarget(holdAnchor, index, alive.length, tuning.holdRingRadius);
      straggler = false;
    } else if (mode === "gather") {
      target = shepherd;
      straggler = false;
      speedCap = tuning.gatherSpeed;
    } else if (mode === "follow") {
      const dist = Math.hypot(creature.x - shepherd.x, creature.z - shepherd.z);
      if (dist > tuning.trustRadius) {
        straggler = true;
        const base = input.strayBase.get(creature.id) ?? { x: creature.x, z: creature.z };
        target = wanderTarget(base, creature.id, t, tuning);
        speedCap = tuning.maxSpeed * 0.35;
      } else {
        straggler = false;
      }
    } else {
      target = { x: creature.x, z: creature.z };
      speedCap = 0;
    }

    let ax = target.x - creature.x;
    let az = target.z - creature.z;
    const seekMag = Math.hypot(ax, az);
    if (seekMag > 1e-6) {
      ax /= seekMag;
      az /= seekMag;
    }

    let sepX = 0;
    let sepZ = 0;
    let cohX = 0;
    let cohZ = 0;
    let cohCount = 0;
    for (const other of alive) {
      if (other.id === creature.id) continue;
      const dx = creature.x - other.x;
      const dz = creature.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < tuning.separationRadius) {
        const push = (tuning.separationRadius - d) / tuning.separationRadius;
        sepX += (dx / d) * push;
        sepZ += (dz / d) * push;
      }
      if (d < tuning.cohesionRadius) {
        cohX += other.x;
        cohZ += other.z;
        cohCount += 1;
      }
    }
    if (cohCount > 0 && mode !== "hold") {
      cohX = cohX / cohCount - creature.x;
      cohZ = cohZ / cohCount - creature.z;
      const cohMag = Math.hypot(cohX, cohZ);
      if (cohMag > 1e-6) {
        cohX /= cohMag;
        cohZ /= cohMag;
      }
    } else {
      cohX = 0;
      cohZ = 0;
    }

    const desiredX = ax + sepX * tuning.separationStrength + cohX * tuning.cohesionStrength;
    const desiredZ = az + sepZ * tuning.separationStrength + cohZ * tuning.cohesionStrength;
    const [dvx, dvz] = clampMag(desiredX, desiredZ, 1);
    let vx = creature.vx + (dvx * speedCap - creature.vx) * Math.min(1, tuning.accel * dt);
    let vz = creature.vz + (dvz * speedCap - creature.vz) * Math.min(1, tuning.accel * dt);
    [vx, vz] = clampMag(vx, vz, Math.max(speedCap, 0.0001));

    return {
      ...creature,
      x: creature.x + vx * dt,
      z: creature.z + vz * dt,
      vx,
      vz,
      straggler,
    };
  });
}
