/** Sawtooth ramp: rises 0→1 over each `period` then resets, for looping sweeps and scrolls.
 * @internal
 */
export function sawWave(time: number, period: number): number {
  if (!(period > 0)) return 0;
  const phase = ((time % period) + period) % period;
  return phase / period;
}

/** Triangle wave: ramps 0→1→0 across each `period`, for patrols, searchlights, and pulsing glows.
 * @internal
 */
export function triangleWave(time: number, period: number): number {
  const up = sawWave(time, period);
  return up < 0.5 ? up * 2 : 2 - up * 2;
}

/** Ping-pong a value across `[0, length]`, bouncing at each edge — the index/position analog of {@link triangleWave}.
 * @internal
 */
export function pingPong(value: number, length: number): number {
  if (!(length > 0)) return 0;
  const t = ((value % (length * 2)) + length * 2) % (length * 2);
  return t <= length ? t : length * 2 - t;
}
