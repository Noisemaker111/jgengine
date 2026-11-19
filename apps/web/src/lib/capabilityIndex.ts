export interface CapabilityExport {
  readonly symbol: string;
  readonly kind: string;
  readonly importLine: string;
}

export interface Capability {
  readonly skill: string;
  readonly key: string;
  readonly summary: string;
  readonly exports: readonly CapabilityExport[];
}

const COMPACT_ROW = /^- \*\*([^\s*]+)\*\* — (.+)$/;
const HEADING = /^## ([^\s]+) — (.+)$/;
const EXPORT_LINE = /^- `([^`]+)` \(([^)]+)\) · `([^`]+)`$/;

export function parseCapabilityIndex(markdown: string, skill: string): Capability[] {
  const compactRows: Capability[] = [];
  for (const raw of markdown.split("\n")) {
    const match = COMPACT_ROW.exec(raw.trimEnd());
    if (match === null) continue;
    const key = match[1]!;
    const rest = match[2]!;
    const splitAt = rest.indexOf(" · `import ");
    const summary = (splitAt === -1 ? rest : rest.slice(0, splitAt)).trim();
    const tail = splitAt === -1 ? "" : rest.slice(splitAt + 3);
    const exports: CapabilityExport[] = [];
    for (const imp of tail.matchAll(/`import \{([^}]+)\} from "([^"]+)"`/g)) {
      const mod = imp[2]!;
      for (const rawName of imp[1]!.split(",")) {
        const symbol = rawName.trim();
        if (symbol !== "") exports.push({ symbol, kind: "", importLine: `import { ${symbol} } from "${mod}"` });
      }
    }
    if (exports.length > 0) compactRows.push({ skill, key, summary, exports });
  }
  if (compactRows.length > 0) return compactRows;

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
