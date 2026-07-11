import { DROP_BASE, DROP_CAP, SHOTS_PER_DROP } from "./constants";

/** The ceiling descends one row on every SHOTS_PER_DROP-th settled shot. */
export function willCompress(totalShots: number): boolean {
  return totalShots > 0 && totalShots % SHOTS_PER_DROP === 0;
}

export function shotsUntilCompress(totalShots: number): number {
  const into = totalShots % SHOTS_PER_DROP;
  return into === 0 ? SHOTS_PER_DROP : SHOTS_PER_DROP - into;
}

/** Score for a single disconnected-drop event: 20, 40, 80 … per bubble, capped. */
export function dropScore(count: number): number {
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += Math.min(DROP_BASE * Math.pow(2, i), DROP_CAP);
  }
  return total;
}
