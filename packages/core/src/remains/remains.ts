// @skill jgengine-gameplay
/** One stack held in remains: an item id and how many. */
export interface RemainsStack {
  item: string;
  count: number;
}

/** What someone left where they fell: whose it is, where, what it holds and until when it lasts. */
export interface Remains {
  id: string;
  owner: string;
  at: readonly [number, number, number];
  contents: readonly RemainsStack[];
  /** Clock time it was left at, and the time it falls apart. */
  leftAt: number;
  until: number;
}

/** {@link createRemainsField} knobs. */
export interface RemainsOptions {
  /** Seconds remains last before they fall apart with whatever is still in them. */
  lastsSeconds: number;
}

/** Everything a remains field holds, for a save. */
export interface RemainsSnapshot {
  seq: number;
  remains: Remains[];
}

/** The remains lying in a world: left on death, taken back from, and gone when they fall apart. */
export interface RemainsField {
  /** Leave remains holding `contents` (empty stacks are dropped). Nothing to hold leaves nothing: returns null. */
  leave(input: { owner: string; at: readonly [number, number, number]; contents: readonly RemainsStack[]; now: number }): Remains | null;
  /** Every remains still lying, oldest first. */
  list(): readonly Remains[];
  /** The closest remains within `reach` of `at` on the ground plane, optionally only `owner`'s. */
  nearest(at: readonly [number, number, number], reach: number, owner?: string): Remains | null;
  /**
   * Take from remains `id`: `accept` is offered each stack and returns how many it took. What it leaves stays in the
   * remains; remains left empty are gone. Returns what was taken.
   */
  take(id: string, accept: (stack: RemainsStack) => number): RemainsStack[];
  /** Remove remains that have fallen apart by `now`, and return them. */
  expire(now: number): Remains[];
  snapshot(): RemainsSnapshot;
  restore(snapshot: RemainsSnapshot): void;
  reset(): void;
}

/**
 * Remains: when someone dies, what they carried stays where they fell in one lootable heap (ARK's body and death
 * cache, a corpse run in any game). The owner, or anyone the game allows, walks back and takes it; after
 * `lastsSeconds` it falls apart and its contents are lost. Pure state on the game's clock; saving is a snapshot.
 *
 * @capability remains-field leave what a fallen player carried where they fell, take it back stack by stack, lose it when the remains fall apart
 */
export function createRemainsField(options: RemainsOptions): RemainsField {
  let seq = 0;
  let remains: Remains[] = [];
  const merge = (stacks: readonly RemainsStack[]): RemainsStack[] => {
    const totals = new Map<string, number>();
    for (const stack of stacks) if (stack.count > 0) totals.set(stack.item, (totals.get(stack.item) ?? 0) + stack.count);
    return [...totals].map(([item, count]) => ({ item, count }));
  };
  return {
    leave({ owner, at, contents, now }) {
      const held = merge(contents);
      if (held.length === 0) return null;
      seq += 1;
      const left: Remains = { id: `remains_${seq}`, owner, at: [at[0], at[1], at[2]], contents: held, leftAt: now, until: now + options.lastsSeconds };
      remains.push(left);
      return left;
    },
    list: () => remains,
    nearest(at, reach, owner) {
      let best: Remains | null = null;
      let bestDistance = reach;
      for (const entry of remains) {
        if (owner !== undefined && entry.owner !== owner) continue;
        const distance = Math.hypot(entry.at[0] - at[0], entry.at[2] - at[2]);
        if (distance <= bestDistance) {
          best = entry;
          bestDistance = distance;
        }
      }
      return best;
    },
    take(id, accept) {
      const index = remains.findIndex((entry) => entry.id === id);
      if (index < 0) return [];
      const entry = remains[index]!;
      const taken: RemainsStack[] = [];
      const left: RemainsStack[] = [];
      for (const stack of entry.contents) {
        const got = Math.max(0, Math.min(stack.count, Math.floor(accept(stack))));
        if (got > 0) taken.push({ item: stack.item, count: got });
        if (stack.count - got > 0) left.push({ item: stack.item, count: stack.count - got });
      }
      if (left.length === 0) remains.splice(index, 1);
      else remains[index] = { ...entry, contents: left };
      return taken;
    },
    expire(now) {
      const gone = remains.filter((entry) => entry.until <= now);
      if (gone.length > 0) remains = remains.filter((entry) => entry.until > now);
      return gone;
    },
    snapshot: () => ({ seq, remains: remains.map((entry) => ({ ...entry, at: [...entry.at] as [number, number, number], contents: entry.contents.map((stack) => ({ ...stack })) })) }),
    restore(snapshot) {
      seq = snapshot.seq;
      remains = snapshot.remains.map((entry) => ({ ...entry, at: [entry.at[0], entry.at[1], entry.at[2]], contents: merge(entry.contents) }));
    },
    reset() {
      seq = 0;
      remains = [];
    },
  };
}
