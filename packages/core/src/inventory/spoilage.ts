/** How one item goes off: a unit spoils every `seconds` it is carried, turning into `into` (or nothing). */
export interface SpoilRule {
  seconds: number;
  into: string | null;
}

/** One carried stack, keyed by where it sits (e.g. `"bag:3"`), so a timer follows its slot. */
export interface SpoilingStack {
  key: string;
  itemId: string;
  count: number;
}

/** Units of one stack that went off this tick: take `count` of `itemId` from `key`, give `count` of `into`. */
export interface SpoiledUnits {
  key: string;
  itemId: string;
  into: string | null;
  count: number;
}

/** The spoil timers of every perishable stack carried, advanced together; `snapshot`/`restore` keep them across a save. */
export interface Spoilage {
  /** Advance every listed stack by `dt` seconds; stacks no longer listed lose their timers. */
  tick(dt: number, stacks: readonly SpoilingStack[]): SpoiledUnits[];
  /** Seconds until the next unit of the stack at `key` spoils; `null` when it never does. */
  left(stack: SpoilingStack): number | null;
  snapshot(): Record<string, number>;
  restore(timers: Readonly<Record<string, number>>): void;
}

/**
 * Perishables in an inventory, as ARK keeps them: each stack runs one timer, and every time it runs out
 * one unit spoils and the timer starts again, so a big stack lasts longer than a small one. A slot that
 * changes item starts a fresh timer.
 */
export function createSpoilage(rules: Readonly<Record<string, SpoilRule>>): Spoilage {
  const timers = new Map<string, number>();
  const timerKey = (stack: SpoilingStack): string => `${stack.key}|${stack.itemId}`;
  return {
    tick(dt, stacks) {
      const spoiled: SpoiledUnits[] = [];
      const live = new Set<string>();
      for (const stack of stacks) {
        const rule = rules[stack.itemId];
        if (rule === undefined || stack.count <= 0 || rule.seconds <= 0) continue;
        const key = timerKey(stack);
        live.add(key);
        let elapsed = (timers.get(key) ?? 0) + Math.max(0, dt);
        const count = Math.min(stack.count, Math.floor(elapsed / rule.seconds));
        elapsed -= count * rule.seconds;
        if (count >= stack.count) timers.delete(key);
        else timers.set(key, elapsed);
        if (count > 0) spoiled.push({ key: stack.key, itemId: stack.itemId, into: rule.into, count });
      }
      for (const key of [...timers.keys()]) if (!live.has(key)) timers.delete(key);
      return spoiled;
    },
    left(stack) {
      const rule = rules[stack.itemId];
      if (rule === undefined || rule.seconds <= 0) return null;
      return rule.seconds - (timers.get(timerKey(stack)) ?? 0);
    },
    snapshot: () => Object.fromEntries(timers),
    restore(saved) {
      timers.clear();
      for (const [key, elapsed] of Object.entries(saved)) if (Number.isFinite(elapsed)) timers.set(key, elapsed);
    },
  };
}
