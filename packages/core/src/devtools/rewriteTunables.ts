/** One changed tunable to write back into game source: which table, key path, and new value. */
export interface TunableDelta {
  table: string;
  key: string;
  value: unknown;
}

/** Renders a tunable value as TS source, or null when the value has no safe literal form. */
export function formatTunableLiteral(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      if (typeof item !== "number" || !Number.isFinite(item)) return null;
      parts.push(String(item));
    }
    return `[${parts.join(", ")}]`;
  }
  return null;
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[\w$]/.test(ch);
}

function skipWhitespaceAndComments(code: string, at: number): number {
  let i = at;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end < 0 ? code.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function skipString(code: string, at: number): number {
  const quote = code[at]!;
  let i = at + 1;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (quote === "`" && ch === "$" && code[i + 1] === "{") {
      const end = skipBalanced(code, i + 1);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    i += 1;
  }
  return -1;
}

const CLOSERS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

function skipBalanced(code: string, at: number): number {
  const open = code[at]!;
  const close = CLOSERS[open];
  if (close === undefined) return -1;
  let depth = 0;
  let i = at;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(code, i);
      if (i < 0) return -1;
      continue;
    }
    if (ch === "/" && (code[i + 1] === "/" || code[i + 1] === "*")) {
      i = skipWhitespaceAndComments(code, i);
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return -1;
}

function trimTrailingWhitespace(code: string, start: number, end: number): number {
  let i = end;
  while (i > start && /\s/.test(code[i - 1]!)) i -= 1;
  return i;
}

function scalarEnd(code: string, at: number): number {
  let i = at;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(code, i);
      if (i < 0) return -1;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      i = skipBalanced(code, i);
      if (i < 0) return -1;
      continue;
    }
    if (ch === "," || ch === "}" || ch === "]" || ch === ";" || ch === ")") {
      return trimTrailingWhitespace(code, at, i);
    }
    if (ch === "/" && (code[i + 1] === "/" || code[i + 1] === "*")) {
      return trimTrailingWhitespace(code, at, i);
    }
    i += 1;
  }
  return trimTrailingWhitespace(code, at, i);
}

interface ValueSpan {
  start: number;
  end: number;
}

function readPropertyName(code: string, at: number): { name: string; end: number } | null {
  const ch = code[at]!;
  if (ch === '"' || ch === "'") {
    const end = skipString(code, at);
    if (end < 0) return null;
    return { name: code.slice(at + 1, end - 1), end };
  }
  if (isIdentifierStart(ch) || /[0-9]/.test(ch)) {
    let i = at;
    while (i < code.length && (isIdentifierPart(code[i]!) || code[i] === ".")) i += 1;
    return { name: code.slice(at, i), end: i };
  }
  return null;
}

function findInObject(code: string, objStart: number, segment: string): ValueSpan | null {
  let i = objStart + 1;
  while (i < code.length) {
    i = skipWhitespaceAndComments(code, i);
    if (i >= code.length || code[i] === "}") return null;
    if (code[i] === ",") {
      i += 1;
      continue;
    }
    if (code.startsWith("...", i)) {
      const end = scalarEnd(code, i + 3);
      if (end < 0) return null;
      i = end;
      continue;
    }
    const prop = readPropertyName(code, i);
    if (prop === null) return null;
    let j = skipWhitespaceAndComments(code, prop.end);
    if (code[j] === "(") {
      const afterParams = skipBalanced(code, j);
      if (afterParams < 0) return null;
      j = skipWhitespaceAndComments(code, afterParams);
      if (code[j] !== "{") return null;
      const afterBody = skipBalanced(code, j);
      if (afterBody < 0) return null;
      i = afterBody;
      continue;
    }
    if (code[j] !== ":") {
      if (prop.name === segment) return null;
      i = j;
      continue;
    }
    const valueStart = skipWhitespaceAndComments(code, j + 1);
    const first = code[valueStart];
    const valueEnd =
      first === "{" || first === "[" || first === "("
        ? skipBalanced(code, valueStart)
        : scalarEnd(code, valueStart);
    if (valueEnd < 0) return null;
    if (prop.name === segment) return { start: valueStart, end: valueEnd };
    i = valueEnd;
  }
  return null;
}

function findInArray(code: string, arrStart: number, index: number): ValueSpan | null {
  let i = arrStart + 1;
  let at = 0;
  while (i < code.length) {
    i = skipWhitespaceAndComments(code, i);
    if (i >= code.length || code[i] === "]") return null;
    const first = code[i]!;
    const end =
      first === "{" || first === "[" || first === "("
        ? skipBalanced(code, i)
        : scalarEnd(code, i);
    if (end < 0) return null;
    if (at === index) return { start: i, end };
    at += 1;
    i = skipWhitespaceAndComments(code, end);
    if (code[i] === ",") i += 1;
  }
  return null;
}

function exportInitializerStart(code: string, exportName: string): number {
  const pattern = new RegExp(
    `export\\s+(?:const|let)\\s+${exportName.replace(/[$]/g, "\\$&")}\\b[^=;\\n]*=`,
  );
  const match = pattern.exec(code);
  if (match === null) return -1;
  return skipWhitespaceAndComments(code, match.index + match[0].length);
}

/**
 * Rewrites one tunable's literal inside TS source: `exportName` names the `export const/let`,
 * `path` descends object keys and array indices to the scalar, and `value` becomes the new
 * literal. Returns the updated source, or null when the target cannot be safely located.
 */
export function rewriteTunableExport(
  code: string,
  exportName: string,
  path: readonly string[],
  value: unknown,
): string | null {
  const literal = formatTunableLiteral(value);
  if (literal === null) return null;
  const start = exportInitializerStart(code, exportName);
  if (start < 0) return null;

  let span: ValueSpan;
  const first = code[start];
  if (path.length === 0) {
    const end =
      first === "{" || first === "[" || first === "("
        ? skipBalanced(code, start)
        : scalarEnd(code, start);
    if (end < 0) return null;
    span = { start, end };
  } else {
    let container: ValueSpan = { start, end: start };
    if (first !== "{" && first !== "[") return null;
    let cursor = start;
    for (const segment of path) {
      const ch = code[cursor];
      const found =
        ch === "{"
          ? findInObject(code, cursor, segment)
          : ch === "[" && /^\d+$/.test(segment)
            ? findInArray(code, cursor, Number(segment))
            : null;
      if (found === null) return null;
      container = found;
      cursor = found.start;
    }
    span = container;
  }
  return `${code.slice(0, span.start)}${literal}${code.slice(span.end)}`;
}
