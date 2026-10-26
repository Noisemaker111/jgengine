import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LOCKSTEP_SDK_PACKAGES } from "./compatibility";

interface CatalogEntry {
  name: string;
  range: string;
  catalogSource: string;
  path: string[];
}

/** A workspace root's `@jgengine` catalog entries, read for `jgengine sync`. @internal */
export interface WorkspaceCatalog {
  root: string;
  file: string;
  before: string;
  entries: CatalogEntry[];
  overrides: Record<string, unknown>;
}

/** @internal */
export interface CatalogSyncPlan {
  file: string;
  before: string;
  after: string;
  changes: { name: string; catalogSource: string; from: string; to: string }[];
  preserved: { name: string; catalogSource: string; range: string; reason: string }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The `@jgengine` entries in a workspace root's Bun catalogs, or null when `rootDir` is no
 * workspace root or its catalogs pin no SDK package.
 * @internal
 */
export function readWorkspaceCatalog(rootDir: string): WorkspaceCatalog | null {
  const root = resolve(rootDir);
  {
    const file = join(root, "package.json");
    if (existsSync(file)) {
      const before = readFileSync(file, "utf8");
      let manifest: unknown;
      try { manifest = JSON.parse(before); }
      catch { throw new Error(`${file}: invalid JSON`); }
      if (!record(manifest)) throw new Error(`${file}: package.json must be an object`);
      // A plain workspaces array has no catalogs: each game pins its own SDK versions.
      if (record(manifest.workspaces)) {
        const workspaces = manifest.workspaces;
        const entries: CatalogEntry[] = [];
        const collect = (catalog: unknown, path: string[]) => {
          if (!record(catalog)) throw new Error(`${file}: malformed ${path.join(".")}`);
          for (const name of LOCKSTEP_SDK_PACKAGES) {
            if (!(name in catalog)) continue;
            const range = catalog[name];
            if (typeof range !== "string" || !/^[\^~]?\d+\.\d+\.\d+$/.test(range)) {
              throw new Error(`${file}: unsupported ${path.join(".")}.${name}; use an exact, ^, or ~ stable version`);
            }
            entries.push({ name, range, catalogSource: path.join("."), path: [...path, name] });
          }
        };
        if (workspaces.catalog !== undefined) collect(workspaces.catalog, ["workspaces", "catalog"]);
        if (workspaces.catalogs !== undefined) {
          if (!record(workspaces.catalogs)) throw new Error(`${file}: malformed workspaces.catalogs`);
          for (const [name, catalog] of Object.entries(workspaces.catalogs)) collect(catalog, ["workspaces", "catalogs", name]);
        }
        if (entries.length === 0) return null;
        if (manifest.overrides !== undefined && !record(manifest.overrides)) throw new Error(`${file}: overrides must be an object`);
        return { root, file, before, entries, overrides: manifest.overrides ?? {} };
      }
    }
  }
  return null;
}

function stringLocations(text: string): Map<string, { start: number; end: number }> {
  const tokens = [...text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)];
  const locations = new Map<string, { start: number; end: number }>();
  let index = 0;
  const visit = (path: string[]) => {
    const token = tokens[index++];
    if (token[0] === "{") {
      const keys = new Set<string>();
      while (tokens[index][0] !== "}") {
        const key = JSON.parse(tokens[index++][0]) as string;
        if (keys.has(key)) throw new Error(`duplicate JSON key at ${[...path, key].join(".")}`);
        keys.add(key);
        index += 1;
        visit([...path, key]);
        if (tokens[index][0] === ",") index += 1;
      }
      index += 1;
    } else if (token[0] === "[") {
      let item = 0;
      while (tokens[index][0] !== "]") {
        visit([...path, String(item++)]);
        if (tokens[index][0] === ",") index += 1;
      }
      index += 1;
    } else if (token[0].startsWith('"')) {
      locations.set(JSON.stringify(path), { start: token.index, end: token.index + token[0].length });
    }
  };
  visit([]);
  return locations;
}

/** @internal */
export function planCatalogSync(catalog: WorkspaceCatalog, target: string): CatalogSyncPlan {
  if (!/^\d+\.\d+\.\d+$/.test(target)) throw new Error("catalog target must be a stable x.y.z version");
  const locations = stringLocations(catalog.before);
  const edits: { start: number; end: number; value: string }[] = [];
  const changes: CatalogSyncPlan["changes"] = [];
  const preserved: CatalogSyncPlan["preserved"] = [];
  for (const entry of catalog.entries) {
    if (entry.name === "@jgengine/editor" && entry.name in catalog.overrides) {
      preserved.push({ name: entry.name, range: entry.range, catalogSource: entry.catalogSource, reason: "root editor override remains unchanged" });
      continue;
    }
    if (entry.name in catalog.overrides) {
      const override = catalog.overrides[entry.name];
      if (typeof override !== "string" || override.replace(/^[\^~]/, "") !== target) {
        throw new Error(`${catalog.file}: ${entry.name} override conflicts with ${target}; review the override first`);
      }
    }
    const current = entry.range.replace(/^[\^~]/, "").split(".").map(Number);
    const next = target.split(".").map(Number);
    const difference = current.map((value, index) => value - next[index]).find(value => value !== 0) ?? 0;
    if (difference > 0) throw new Error(`${entry.name}: ${entry.range} is newer than published target ${target}; refusing a downgrade; run a newer jgengine`);
    const prefix = /^[\^~]/.exec(entry.range)?.[0] ?? "";
    const to = prefix + target;
    if (to === entry.range) continue;
    const location = locations.get(JSON.stringify(entry.path));
    if (location === undefined) throw new Error(`${catalog.file}: missing JSON location for ${entry.catalogSource}.${entry.name}`);
    edits.push({ ...location, value: JSON.stringify(to) });
    changes.push({ name: entry.name, catalogSource: entry.catalogSource, from: entry.range, to });
  }
  let after = catalog.before;
  for (const edit of edits.sort((a, b) => b.start - a.start)) after = after.slice(0, edit.start) + edit.value + after.slice(edit.end);
  return { file: catalog.file, before: catalog.before, after, changes, preserved };
}

/** @internal */
export function applyCatalogSync(plan: CatalogSyncPlan): void {
  const unchanged = () => {
    if (readFileSync(plan.file, "utf8") !== plan.before) throw new Error(`${plan.file}: changed while planning; rerun jgengine sync`);
  };
  unchanged();
  if (plan.after === plan.before) return;
  const temporary = `${plan.file}.jgengine-sync-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, plan.after, { flag: "wx", mode: statSync(plan.file).mode });
    unchanged();
    renameSync(temporary, plan.file);
  } finally { rmSync(temporary, { force: true }); }
}
