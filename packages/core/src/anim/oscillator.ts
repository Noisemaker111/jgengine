/** @internal */
export function sawWave(time: number, period: number): number {
  if (!(period > 0)) return 0;
  const phase = ((time % period) + period) % period;
  return phase / period;
}

/** @internal */
export function triangleWave(time: number, period: number): number {
  const up = sawWave(time, period);
  return up < 0.5 ? up * 2 : 2 - up * 2;
}

/** @internal */
export function pingPong(value: number, length: number): number {
  if (!(length > 0)) return 0;
  const t = ((value % (length * 2)) + length * 2) % (length * 2);
  return t <= length ? t : length * 2 - t;
}
