/** One primitive listed under an intent in a skill's generated `capabilities.md`. */
export interface CapabilityExport {
  readonly symbol: string;
  readonly kind: string;
  readonly importLine: string;
}

/** An intent row: the thing a game needs, and the primitives that already do it. */
export interface Capability {
  readonly skill: string;
  readonly key: string;
  readonly summary: string;
  readonly exports: readonly CapabilityExport[];
}

const HEADING = /^## ([^\s]+) — (.+)$/;
const EXPORT_LINE = /^- `([^`]+)` \(([^)]+)\) · `([^`]+)`$/;

/** Parses the `scripts/gen-capability-index.ts` markdown format; unknown lines are skipped. */
export function parseCapabilityIndex(markdown: string, skill: string): Capability[] {
  const rows: Capability[] = [];
  let current: { key: string; summary: string; exports: CapabilityExport[] } | null = null;
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line);
    if (heading !== null) {
      if (current !== null) rows.push({ skill, ...current });
      current = { key: heading[1]!, summary: heading[2]!, exports: [] };
      continue;
    }
    const entry = EXPORT_LINE.exec(line);
    if (entry !== null && current !== null) {
      current.exports.push({ symbol: entry[1]!, kind: entry[2]!, importLine: entry[3]! });
    }
  }
  if (current !== null) rows.push({ skill, ...current });
  return rows.filter((row) => row.exports.length > 0);
}
