export type Vec3 = readonly [number, number, number];

export interface FlowTube {
  readonly id: string;
  readonly fanId: string | null;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly radius: number;
  readonly coreRadius: number;
  readonly baseSpeed: number;
}

export interface FlowSample {
  readonly tubeId: string | null;
  readonly inTube: boolean;
  readonly inCore: boolean;
  readonly alongFraction: number;
  readonly radialDistance: number;
  readonly axialDir: Vec3;
  readonly radialDir: Vec3;
  readonly axialSpeed: number;
  readonly buffet: number;
}

const AMBIENT_FAN_POWER = 0.35;
const EDGE_SPEED_FLOOR = 0.15;

export const NO_FLOW: FlowSample = {
  tubeId: null,
  inTube: false,
  inCore: false,
  alongFraction: 0,
  radialDistance: Number.POSITIVE_INFINITY,
  axialDir: [0, 0, 1],
  radialDir: [0, 1, 0],
  axialSpeed: 0,
  buffet: 0,
};

const ZERO_SAMPLE: FlowSample = {
  tubeId: null,
  inTube: false,
  inCore: false,
  alongFraction: 0,
  radialDistance: Number.POSITIVE_INFINITY,
  axialDir: [0, 0, 1],
  radialDir: [0, 1, 0],
  axialSpeed: 0,
  buffet: 0,
};

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function sampleFlowTube(tube: FlowTube, fanPower: number, fanDirection: 1 | -1, position: Vec3): FlowSample {
  const d = sub(tube.to, tube.from);
  const len = length(d);
  if (len <= 1e-6) return ZERO_SAMPLE;
  const axis: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const w = sub(position, tube.from);
  const rawT = dot(w, axis) / len;
  if (rawT < 0 || rawT > 1) return { ...ZERO_SAMPLE, tubeId: tube.id, alongFraction: rawT };

  const closest: Vec3 = [tube.from[0] + axis[0] * rawT * len, tube.from[1] + axis[1] * rawT * len, tube.from[2] + axis[2] * rawT * len];
  const radialVec = sub(position, closest);
  const radialDistance = length(radialVec);
  if (radialDistance > tube.radius) return { ...ZERO_SAMPLE, tubeId: tube.id, alongFraction: rawT, radialDistance };

  const inCore = radialDistance <= tube.coreRadius;
  const edgeSpan = Math.max(1e-6, tube.radius - tube.coreRadius);
  const speedFactor = inCore ? 1 : 1 - (1 - EDGE_SPEED_FLOOR) * ((radialDistance - tube.coreRadius) / edgeSpan);
  const power = tube.fanId === null ? AMBIENT_FAN_POWER : fanPower;
  const direction = tube.fanId === null ? 1 : fanDirection;
  const axialSpeed = tube.baseSpeed * power * speedFactor * direction;
  const buffet = inCore ? 0 : Math.min(1, Math.max(0, (radialDistance - tube.coreRadius) / edgeSpan));
  const radialDir: Vec3 = radialDistance > 1e-6 ? [radialVec[0] / radialDistance, radialVec[1] / radialDistance, radialVec[2] / radialDistance] : [0, 1, 0];

  return {
    tubeId: tube.id,
    inTube: true,
    inCore,
    alongFraction: rawT,
    radialDistance,
    axialDir: axis,
    radialDir,
    axialSpeed,
    buffet,
  };
}

export function resolveActiveFlow(
  tubes: readonly FlowTube[],
  fanPowerOf: (fanId: string) => { power: number; direction: 1 | -1 },
  position: Vec3,
): FlowSample | null {
  let best: FlowSample | null = null;
  for (const tube of tubes) {
    const { power, direction } = tube.fanId === null ? { power: 0, direction: 1 as const } : fanPowerOf(tube.fanId);
    const sample = sampleFlowTube(tube, power, direction, position);
    if (!sample.inTube) continue;
    if (best === null || sample.radialDistance < best.radialDistance) best = sample;
  }
  return best;
}
