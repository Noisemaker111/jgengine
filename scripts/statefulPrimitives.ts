import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * #1575: a stateful primitive in `packages/*` must be able to hand its state back. Scale-by-default
 * (server host, save/load, replay, split-screen, tests) needs the state out of the closure; a
 * primitive that can only be constructed and ticked forces every consumer to shadow it.
 */

export const SCANNED_ROOTS = ["packages/core/src", "packages/react/src"] as const;

/** Hands the state to the caller. */
const STATE_OUT = /\n\s+(?:readonly\s+)?(snapshot|state|toJSON|serialize|save|export)\s*[(<]/;

/** Takes a caller-held state back. */
const STATE_IN = /\n\s+(?:readonly\s+)?(restore|reset|hydrate|load|adopt|setState)\w*\s*[(<]/;

/** Closure-local mutable state — what makes the handle stateful rather than a pure adapter. */
const MUTABLE_BODY = /\n\s{2}let\s|\n\s{2}const\s+\w+\s*(?::[^=]+)?=\s*(?:new (?:Map|Set)\b|\[\])/;

export interface StatefulPrimitive {
  key: string;
  factory: string;
  handle: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

function bodyOf(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/** Every exported `create*` factory that returns a method-bearing handle and closes over mutable state. */
export function findStatefulPrimitives(root: string): StatefulPrimitive[] {
  const found: StatefulPrimitive[] = [];
  for (const scanned of SCANNED_ROOTS) {
    for (const file of walk(join(root, scanned))) {
      const source = readFileSync(file, "utf8");
      const rel = relative(root, file).replace(/\\/g, "/");
      for (const match of source.matchAll(/export function (create[A-Z]\w*)[^)]*\)\s*:\s*([A-Z]\w*)[<\s]/g)) {
        const [, factory, handle] = match as unknown as [string, string, string];
        const declaration = source.match(new RegExp(`export interface ${handle}(?:<[^>]*>)?\\s*\\{`));
        if (declaration?.index === undefined) continue;
        const members = bodyOf(source, source.indexOf("{", declaration.index));
        if (!/\n\s+\w+\s*[(<]/.test(members)) continue;
        if (!MUTABLE_BODY.test(bodyOf(source, source.indexOf("{", match.index)))) continue;
        if (STATE_OUT.test(members) && STATE_IN.test(members)) continue;
        found.push({ key: `${rel}#${factory}`, factory, handle });
      }
    }
  }
  return found.sort((a, b) => a.key.localeCompare(b.key));
}
