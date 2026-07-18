import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MODEL_EXT, assetIdFromRel, safeAssetFilename } from "./assetNaming";
import type { EditorManifestAsset } from "./editorHostPlugin";

/**
 * A durable catalog entry the editor writes into a promoted game's `src/game/assets.ts` — the
 * `extras` literal `buildCatalog` consumes. Mirrors `@jgengine/assets`' `CatalogExtra`, but `label`
 * is required here because the source literal always carries a human-facing name.
 * @internal
 */
export interface PromotedExtra {
  id: string;
  url: string;
  label: string;
}

/**
 * True when `dir` is an already-promoted game project: one whose assets resolve through a typed
 * `src/game/assets.ts` catalog rather than a scanned model folder.
 * @internal
 */
export function isPromotedProject(dir: string): boolean {
  return existsSync(join(dir, "src", "game", "assets.ts"));
}

/** Scans forward from `open` (index of `{` or `[`) to its matching close, respecting string literals. */
function matchBracketSpan(source: string, open: number): number {
  const openCh = source[open];
  const closeCh = openCh === "{" ? "}" : "]";
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote !== null) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("promotedAssetCatalog: unbalanced brackets in assets.ts");
}

/** Serializes one extras entry as a `{ id, url, label }` object literal with stable key order. */
function serializeEntry(extra: PromotedExtra): string {
  return `{ id: ${JSON.stringify(extra.id)}, url: ${JSON.stringify(extra.url)}, label: ${JSON.stringify(extra.label)} }`;
}

/**
 * Adds or replaces one `extras` entry in a promoted game's `src/game/assets.ts` and returns the
 * rewritten text. PURE and deterministic — it does not touch the filesystem.
 *
 * A bounded, non-AST transform: it locates the single `buildCatalog({ ... })` call by brace-depth
 * scan, then upserts an id-keyed entry into that call's `extras: [ ... ]` array (creating the array
 * when absent, collapsing it back to no `extras` when it would become empty). Re-import of the same
 * id replaces its entry in place, so the transform is idempotent and never duplicates an id. If the
 * source has zero or more than one `buildCatalog(` call it THROWS, so the caller falls back to the
 * legacy folder-scan import rather than risk corrupting the file.
 * @internal
 */
export function upsertCatalogExtra(source: string, extra: PromotedExtra): string {
  const callRe = /\bbuildCatalog\(\s*\{/g;
  const matches = [...source.matchAll(callRe)];
  if (matches.length !== 1) {
    throw new Error(
      `promotedAssetCatalog: expected exactly one buildCatalog({...}) call, found ${matches.length}`,
    );
  }
  const match = matches[0];
  // Brace of the options object literal is the last char of the matched `buildCatalog(\s*{`.
  const objOpen = match.index + match[0].length - 1;
  const objClose = matchBracketSpan(source, objOpen);
  const objBody = source.slice(objOpen, objClose + 1);

  // Detect indentation of the object's first inner line to keep emitted code consistent.
  const indentMatch = /\{\s*\n(\s+)\S/.exec(objBody);
  const indent = indentMatch ? indentMatch[1] : "  ";

  const extrasRe = /\bextras\s*:\s*\[/;
  const extrasMatch = extrasRe.exec(objBody);

  const entries = new Map<string, PromotedExtra>();

  if (extrasMatch) {
    const arrOpenInObj = objBody.indexOf("[", extrasMatch.index);
    const arrCloseInObj = matchBracketSpan(objBody, arrOpenInObj);
    const arrInner = objBody.slice(arrOpenInObj + 1, arrCloseInObj);
    // Parse each `{ ... }` object literal in the array via brace-depth scan + JSON.parse.
    let cursor = 0;
    while (cursor < arrInner.length) {
      const braceOpen = arrInner.indexOf("{", cursor);
      if (braceOpen === -1) break;
      const braceClose = matchBracketSpan(arrInner, braceOpen);
      const literal = arrInner.slice(braceOpen, braceClose + 1);
      const parsed = parseEntryLiteral(literal);
      entries.set(parsed.id, parsed);
      cursor = braceClose + 1;
    }
    entries.set(extra.id, extra);

    const arrOpenAbs = objOpen + arrOpenInObj;
    const arrCloseAbs = objOpen + arrCloseInObj;
    // Collapse an emptied array back to no `extras` for clean reversibility. Unreachable via a plain
    // import (we just added an entry), but keeps the transform's remove-symmetry intact.
    if (entries.size === 0) {
      return spliceOutExtras(source, objOpen + extrasMatch.index, arrCloseAbs);
    }
    const serialized = serializeArray([...entries.values()], indent);
    return source.slice(0, arrOpenAbs) + serialized + source.slice(arrCloseAbs + 1);
  }

  // No extras yet: splice a fresh `extras: [ <entry> ],` right after the opening `{`.
  entries.set(extra.id, extra);
  const serialized = serializeArray([...entries.values()], indent);
  const insertAt = objOpen + 1;
  const insertion = `\n${indent}extras: ${serialized},`;
  return source.slice(0, insertAt) + insertion + source.slice(insertAt);
}

/** Removes an `extras: [...]` declaration (and a trailing comma) so the object reverts cleanly. */
function spliceOutExtras(source: string, declStartAbs: number, arrCloseAbs: number): string {
  let declEndAbs = arrCloseAbs + 1;
  // Swallow a trailing comma after `]`.
  if (source[declEndAbs] === ",") declEndAbs++;
  // Swallow leading whitespace/newline before the declaration.
  let start = declStartAbs;
  while (start > 0 && /[ \t]/.test(source[start - 1])) start--;
  if (source[start - 1] === "\n") start--;
  return source.slice(0, start) + source.slice(declEndAbs);
}

/** Serializes an extras array literal with one entry per indented line. */
function serializeArray(entries: readonly PromotedExtra[], indent: string): string {
  if (entries.length === 0) return "[]";
  const inner = entries.map((e) => `${indent}  ${serializeEntry(e)},`).join("\n");
  return `[\n${inner}\n${indent}]`;
}

/** Parses a `{ id, url, label }` object literal (unquoted keys) into a PromotedExtra via JSON. */
function parseEntryLiteral(literal: string): PromotedExtra {
  // Quote bare identifier keys so JSON.parse accepts the source-literal form.
  const jsonish = literal.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
  const obj = JSON.parse(jsonish) as { id?: unknown; url?: unknown; label?: unknown };
  if (typeof obj.id !== "string" || typeof obj.url !== "string") {
    throw new Error("promotedAssetCatalog: malformed extras entry");
  }
  return {
    id: obj.id,
    url: obj.url,
    label: typeof obj.label === "string" ? obj.label : obj.id,
  };
}

/** Reads the `basePath` string literal from a promoted `assets.ts`, defaulting to `/models`. */
function readBasePath(source: string): string {
  const m = /\bbasePath\s*:\s*["'`]([^"'`]+)["'`]/.exec(source);
  return m ? m[1] : "/models";
}

/**
 * Persists an imported model into a promoted game's `public/` and registers a durable `extras`
 * entry in its `src/game/assets.ts`, so the shipped game resolves the asset through its typed
 * catalog. Copies the bytes under `public/<basePath>/imported/<safe>` and rewrites the catalog
 * source via {@link upsertCatalogExtra}. Returns the same `{ id, url, label }` shape the folder-scan
 * `importEditorAsset` returns — but the url is the shipped `public/` path, not the dev asset route.
 * @internal
 */
export function importPromotedAsset(
  dir: string,
  filename: string,
  bytes: Uint8Array,
): EditorManifestAsset {
  if (!MODEL_EXT.test(filename)) {
    throw new Error(`unsupported asset file (expected .glb/.gltf): ${filename}`);
  }
  const assetsTsPath = join(dir, "src", "game", "assets.ts");
  const source = readFileSync(assetsTsPath, "utf8");
  const basePath = readBasePath(source);
  const safe = safeAssetFilename(filename);

  const publicSub = basePath.replace(/^\/+/, "");
  const targetDir = join(dir, "public", publicSub, "imported");
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, safe), bytes);

  const url = `${basePath.replace(/\/+$/, "")}/imported/${safe}`;
  const id = assetIdFromRel(safe);
  const label = safe;

  const rewritten = upsertCatalogExtra(source, { id, url, label });
  writeFileSync(assetsTsPath, rewritten);

  return { id, url, label };
}
