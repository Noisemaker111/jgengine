const rounded = (value: unknown): unknown => (typeof value === "number" ? Math.round(value * 100) / 100 : value);

/** Whether two reads of a fade's `watch` show the same thing: equal values, element by element for arrays. @internal */
export function sameWatched(previous: unknown, next: unknown): boolean {
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) return false;
    for (let index = 0; index < previous.length; index += 1) if (!sameWatched(previous[index], next[index])) return false;
    return true;
  }
  if (typeof previous === "object" && previous !== null && typeof next === "object" && next !== null) return JSON.stringify(previous, (_, value: unknown) => rounded(value)) === JSON.stringify(next, (_, value: unknown) => rounded(value));
  return Object.is(rounded(previous), rounded(next));
}

/**
 * The per-frame awake test of {@link HudFade} and {@link useHudAwake}: true for `idleMs` after a read
 * of `watch` differs from the last, and whenever `hold` says so. The first read starts awake.
 * @internal
 */
export function createHudAwakeClock(idleMs: number, now: () => number = () => performance.now()): { awake(watched: unknown, holding: boolean): boolean } {
  let seen: { value: unknown } | null = null;
  let changedAt = 0;
  return {
    awake(watched, holding) {
      const at = now();
      if (seen === null || !sameWatched(seen.value, watched)) {
        seen = { value: watched };
        changedAt = at;
      }
      return holding || at - changedAt < idleMs;
    },
  };
}
