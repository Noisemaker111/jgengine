export type ColorHex = string;

function parseHex(hex: ColorHex): [number, number, number] {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (match === null) return [0, 0, 0];
  const value = parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function redmean(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

const REDMEAN_MAX = redmean([0, 0, 0], [255, 255, 255]);

export function colorDistance(a: ColorHex, b: ColorHex): number {
  const distance = redmean(parseHex(a), parseHex(b));
  return REDMEAN_MAX === 0 ? 0 : Math.min(1, distance / REDMEAN_MAX);
}

export function concealmentScore(entityColors: readonly ColorHex[], backgroundColors: readonly ColorHex[]): number {
  if (entityColors.length === 0 || backgroundColors.length === 0) return 0;
  let total = 0;
  for (const entityColor of entityColors) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const backgroundColor of backgroundColors) {
      const distance = colorDistance(entityColor, backgroundColor);
      if (distance < nearest) nearest = distance;
    }
    total += nearest;
  }
  return 1 - total / entityColors.length;
}

export interface ConcealmentTarget {
  id: string;
  entityColors: readonly ColorHex[];
  backgroundColors: readonly ColorHex[];
}

export interface ConcealmentSample {
  id: string;
  score: number;
  concealed: boolean;
  dwellSeconds: number;
}

export interface ConcealmentSensor {
  tick(targets: readonly ConcealmentTarget[], dt: number): ConcealmentSample[];
  reset(id?: string): void;
}

export function createConcealmentSensor(config?: { threshold?: number }): ConcealmentSensor {
  const threshold = config?.threshold ?? 0.7;
  const dwell = new Map<string, number>();

  return {
    tick(targets, dt) {
      const seen = new Set<string>();
      const samples: ConcealmentSample[] = [];
      for (const target of targets) {
        seen.add(target.id);
        const score = concealmentScore(target.entityColors, target.backgroundColors);
        const concealed = score >= threshold;
        const nextDwell = concealed ? (dwell.get(target.id) ?? 0) + dt : 0;
        dwell.set(target.id, nextDwell);
        samples.push({ id: target.id, score, concealed, dwellSeconds: nextDwell });
      }
      for (const id of dwell.keys()) {
        if (!seen.has(id)) dwell.delete(id);
      }
      return samples;
    },
    reset(id) {
      if (id === undefined) dwell.clear();
      else dwell.delete(id);
    },
  };
}
