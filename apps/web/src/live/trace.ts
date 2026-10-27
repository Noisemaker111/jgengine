/**
 * What a demo is doing right now, as short tags ("throttle", "save"). A demo calls `hit` every frame a
 * thing happens; the code panels beside it light the lines that do that thing.
 */
export interface Trace {
  hit(tag: string): void;
  /** Tags hit within the last `holdMs`. */
  lit(now: number): ReadonlySet<string>;
}

export function createTrace(holdMs = 220): Trace {
  const lastHit = new Map<string, number>();
  return {
    hit(tag) {
      lastHit.set(tag, performance.now());
    },
    lit(now) {
      const out = new Set<string>();
      for (const [tag, at] of lastHit) if (now - at <= holdMs) out.add(tag);
      return out;
    },
  };
}

/** For each tag, bits of text that pick out the lines doing that thing. */
export type TraceLines = Readonly<Record<string, readonly string[]>>;

/** Indexes of the lines in `code` that match any lit tag. */
export function litLines(code: string, lines: TraceLines, lit: ReadonlySet<string>): Set<number> {
  const out = new Set<number>();
  if (lit.size === 0) return out;
  const rows = code.split("\n");
  for (const tag of lit) {
    for (const needle of lines[tag] ?? []) {
      rows.forEach((row, i) => {
        if (row.includes(needle)) out.add(i);
      });
    }
  }
  return out;
}
