import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { readGlbMetrics, type GlbMetrics } from "./glbMetrics";

/** Per-model limits chosen by the game; equality passes and omitted limits only report. */
export interface AssetBudget {
  maxBytes?: number;
  maxTriangles?: number;
  maxTextureDimension?: number;
}

/** One model's measured inventory or actionable inspection/budget errors. */
export interface AssetBudgetEntry {
  file: string;
  metrics?: GlbMetrics;
  errors: readonly string[];
}

/** Deterministic offline report; an empty directory or any unreadable model fails. */
export interface AssetBudgetReport {
  ok: boolean;
  budget: AssetBudget;
  entries: readonly AssetBudgetEntry[];
  errors: readonly string[];
}

/**
 * Read a GLB plus local resources under `resourceRoot`; remote URLs and symlink escapes fail without fetching.
 * @capability asset-budgets inspect a GLB and its local external resources without network access
 */
export function readGlbFileMetrics(file: string, resourceRoot = dirname(file)): GlbMetrics {
  const root = realpathSync(resourceRoot);
  const modelPath = relative(root, realpathSync(file));
  if (modelPath === ".." || modelPath.startsWith(`..${sep}`) || isAbsolute(modelPath)) {
    throw new Error("model escapes resource root");
  }
  return readGlbMetrics(readFileSync(file), (uri) => {
    if (/^[a-z][a-z\d+.-]*:/i.test(uri) || uri.startsWith("/") || /[\\?#]/.test(uri))
      throw new Error(`external resource must be a local relative URI: ${uri}`);
    const decoded = decodeURIComponent(uri);
    if (isAbsolute(decoded) || decoded.includes("\\"))
      throw new Error(`external resource must be a local relative URI: ${uri}`);
    const full = realpathSync(resolve(dirname(file), decoded));
    const path = relative(root, full);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
      throw new Error(`external resource escapes resource root: ${uri}`);
    return readFileSync(full);
  });
}

/**
 * Check measured per-model bytes, stored triangles, and maximum image dimension against caller-owned limits.
 * @capability asset-budgets enforce game-owned per-model byte, triangle, and texture-dimension limits
 */
export function checkAssetBudget(metrics: GlbMetrics, budget: AssetBudget): string[] {
  const errors: string[] = [];
  const limits = [
    ["byteLength", "maxBytes"],
    ["triangles", "maxTriangles"],
    ["maxTextureDimension", "maxTextureDimension"],
  ] as const;
  for (const [metric, limit] of limits) {
    const maximum = budget[limit];
    if (maximum === undefined) continue;
    if (!Number.isSafeInteger(maximum) || maximum < 0)
      throw new Error(`${limit} must be a non-negative safe integer`);
    if (metrics[metric] > maximum)
      errors.push(`${metric} ${metrics[metric]} exceeds ${limit} ${maximum}`);
  }
  return errors;
}

/**
 * Scan a file or directory recursively for GLBs without changing their bytes or the catalog.
 * Paths are relative to the scanned directory, sorted lexically; unknown/custom asset folders work equally.
 * @capability asset-budgets fail CI on local or imported GLB byte, triangle, and texture-size regressions
 */
export function createAssetBudgetReport(
  target: string,
  budget: AssetBudget = {},
): AssetBudgetReport {
  checkAssetBudget(
    {
      glbBytes: 0,
      byteLength: 0,
      triangles: 0,
      primitives: 0,
      textures: [],
      maxTextureDimension: 0,
    },
    budget,
  );
  const absolute = resolve(target);
  const directory = statSync(absolute).isDirectory();
  const root = directory ? absolute : dirname(absolute);
  const files: string[] = [];
  const scanErrors: string[] = [];
  const scan = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = resolve(folder, entry.name);
      if (entry.isDirectory()) scan(full);
      else if ((entry.isFile() || entry.isSymbolicLink()) && /\.glb$/i.test(entry.name))
        files.push(full);
      else if (entry.isSymbolicLink() && statSync(full).isDirectory()) {
        scanErrors.push(
          `${relative(root, full).split(sep).join("/")}: symlink directories cannot be scanned`,
        );
      }
    }
  };
  if (directory) scan(absolute);
  else if (/\.glb$/i.test(absolute)) files.push(absolute);
  const entries = files
    .map((file) => ({ file, path: relative(root, file).split(sep).join("/") }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ file, path }): AssetBudgetEntry => {
      try {
        const metrics = readGlbFileMetrics(file, root);
        return {
          file: path,
          metrics,
          errors: checkAssetBudget(metrics, budget),
        };
      } catch (error) {
        return {
          file: path,
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    });
  const errors = [
    ...scanErrors.sort(),
    ...entries.flatMap((entry) => entry.errors.map((error) => `${entry.file}: ${error}`)),
  ];
  if (entries.length === 0)
    errors.push("no GLB files found; provision or import assets before checking budgets");
  return { ok: errors.length === 0, budget: { ...budget }, entries, errors };
}
