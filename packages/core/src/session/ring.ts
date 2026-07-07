export type RingPoint = [number, number];

export interface RingPhase {
  startTime: number;
  shrinkDuration: number;
  fromRadius: number;
  toRadius: number;
  damagePerSecond: number;
  center?: RingPoint;
}

export interface RingConfig {
  center: RingPoint;
  phases: readonly RingPhase[];
}

export interface RingSample {
  center: RingPoint;
  radius: number;
  damagePerSecond: number;
  phase: number;
  shrinking: boolean;
}

export interface RingHit {
  id: string;
  damage: number;
  distanceOutside: number;
}

export interface Ring {
  at(time: number): RingSample;
  isOutside(time: number, position: RingPoint): boolean;
  distanceOutside(time: number, position: RingPoint): number;
  damageOutside(time: number, dt: number, positions: Iterable<{ id: string; position: RingPoint }>): RingHit[];
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function lerpPoint(from: RingPoint, to: RingPoint, t: number): RingPoint {
  return [lerp(from[0], to[0], t), lerp(from[1], to[1], t)];
}

function distance(a: RingPoint, b: RingPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function ringSampleAt(config: RingConfig, time: number): RingSample {
  const phases = config.phases;
  if (phases.length === 0) {
    return { center: config.center, radius: 0, damagePerSecond: 0, phase: -1, shrinking: false };
  }
  const first = phases[0]!;
  if (time < first.startTime) {
    return {
      center: config.center,
      radius: first.fromRadius,
      damagePerSecond: 0,
      phase: -1,
      shrinking: false,
    };
  }

  let index = 0;
  for (let i = 0; i < phases.length; i += 1) {
    if (time >= phases[i]!.startTime) index = i;
    else break;
  }
  const phase = phases[index]!;
  const prevCenter = index === 0 ? config.center : centerAfter(config, index - 1);
  const target = phase.center ?? prevCenter;
  const elapsed = time - phase.startTime;

  if (elapsed < phase.shrinkDuration && phase.shrinkDuration > 0) {
    const t = elapsed / phase.shrinkDuration;
    return {
      center: lerpPoint(prevCenter, target, t),
      radius: lerp(phase.fromRadius, phase.toRadius, t),
      damagePerSecond: phase.damagePerSecond,
      phase: index,
      shrinking: true,
    };
  }
  return {
    center: target,
    radius: phase.toRadius,
    damagePerSecond: phase.damagePerSecond,
    phase: index,
    shrinking: false,
  };
}

function centerAfter(config: RingConfig, index: number): RingPoint {
  let center = config.center;
  for (let i = 0; i <= index; i += 1) {
    const phase = config.phases[i]!;
    if (phase.center !== undefined) center = phase.center;
  }
  return center;
}

export function createRing(config: RingConfig): Ring {
  return {
    at: (time) => ringSampleAt(config, time),
    isOutside: (time, position) => {
      const sample = ringSampleAt(config, time);
      return distance(position, sample.center) > sample.radius;
    },
    distanceOutside: (time, position) => {
      const sample = ringSampleAt(config, time);
      return Math.max(0, distance(position, sample.center) - sample.radius);
    },
    damageOutside: (time, dt, positions) => {
      const sample = ringSampleAt(config, time);
      const hits: RingHit[] = [];
      if (dt <= 0 || sample.damagePerSecond <= 0) return hits;
      for (const { id, position } of positions) {
        const distanceOutside = distance(position, sample.center) - sample.radius;
        if (distanceOutside > 0) {
          hits.push({ id, damage: sample.damagePerSecond * dt, distanceOutside });
        }
      }
      return hits;
    },
  };
}
