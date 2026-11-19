// @skill jgengine-gameplay
export interface RemainsStack {
  item: string;
  count: number;
}

export interface Remains<T = undefined> {
  id: string;
  owner: string;
  at: readonly [number, number, number];
  contents: readonly RemainsStack[];
  leftAt: number;
  until: number;
  data?: T | undefined;
}

export interface RemainsOptions {
  /** Seconds remains last before they fall apart with whatever is still in them. */
  lastsSeconds: number;
}

export interface RemainsSnapshot<T = undefined> {
  seq: number;
  remains: Remains<T>[];
}

export interface RemainsLeaveInput<T = undefined> {
  owner: string;
  at: readonly [number, number, number];
  contents: readonly RemainsStack[];
  now: number;
  /** The payload to keep with the remains; a plain field leaves it out. */
  data?: T | undefined;
}

export interface RemainsField<T = undefined> {
  /** Leave remains holding `contents` (empty stacks are dropped) and `data`. Nothing to hold leaves nothing: returns null. */
  leave(input: RemainsLeaveInput<T>): Remains<T> | null;
  list(): readonly Remains<T>[];
  nearest(at: readonly [number, number, number], reach: number, owner?: string): Remains<T> | null;
  take(id: string, accept: (stack: RemainsStack) => number): RemainsStack[];
  expire(now: number): Remains<T>[];
  snapshot(): RemainsSnapshot<T>;
  restore(snapshot: RemainsSnapshot<T>): void;
  reset(): void;
}

/** @capability remains-field leave what a fallen player carried where they fell, take it back stack by stack, lose it when the remains fall apart */
export function createRemainsField<T = undefined>(options: RemainsOptions): RemainsField<T> {
  let seq = 0;
  let remains: Remains<T>[] = [];
  const merge = (stacks: readonly RemainsStack[]): RemainsStack[] => {
    const totals = new Map<string, number>();
    for (const stack of stacks) if (stack.count > 0) totals.set(stack.item, (totals.get(stack.item) ?? 0) + stack.count);
    return [...totals].map(([item, count]) => ({ item, count }));
  };
  return {
    leave({ owner, at, contents, now, data }) {
      const held = merge(contents);
      if (held.length === 0) return null;
      seq += 1;
      const left: Remains<T> = { id: `remains_${seq}`, owner, at: [at[0], at[1], at[2]], contents: held, leftAt: now, until: now + options.lastsSeconds, data };
      remains.push(left);
      return left;
    },
    list: () => remains,
    nearest(at, reach, owner) {
      let best: Remains<T> | null = null;
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
