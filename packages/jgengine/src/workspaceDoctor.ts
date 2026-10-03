import { lstatSync, opendirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inspectInstalledSdkGraph, type InstalledSdkGraph } from "./compatibility";

const BUDGETS = { maxPatterns: 64, maxDirectoryEntries: 4096, maxReadAttempts: 512, maxManifests: 256 } as const;
/** @internal */
export interface WorkspaceSdkReport {
  root: string;
  status: "pass" | "fail" | "incomplete";
  projects: { name: string; directory: string; manifest: string; graph: InstalledSdkGraph }[];
  coverage: {
    complete: boolean;
    patternsAttempted: number;
    directoryEntriesExamined: number;
    manifestReadAttempts: number;
    limits: { maxPatterns: number; maxDirectoryEntries: number; maxReadAttempts: number; maxManifests: number };
    patterns: { pattern: string; matched: number }[];
    errors: string[];
    exclusions: { path: string; reason: string }[];
  };
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

/** Inspect the root and its declared workspaces' installed SDK identities, with fixed traversal budgets and explicit coverage gaps. @internal */
export function inspectWorkspaceSdkInstall(directory: string, options: Partial<WorkspaceSdkReport["coverage"]["limits"]> = {}): WorkspaceSdkReport {
  const limits = { ...BUDGETS, ...options };
  for (const key of Object.keys(BUDGETS) as (keyof typeof BUDGETS)[]) {
    if (!Number.isInteger(limits[key]) || limits[key] < 1 || limits[key] > BUDGETS[key]) throw new Error(`${key} must be between 1 and ${BUDGETS[key]}`);
  }
  const report: WorkspaceSdkReport = {
    root: resolve(directory), status: "incomplete", projects: [],
    coverage: { complete: false, patternsAttempted: 0, directoryEntriesExamined: 0, manifestReadAttempts: 0, limits, patterns: [], errors: [], exclusions: [] },
  };
  const coverage = report.coverage;
  const fail = (message: string) => { if (!coverage.errors.includes(message)) coverage.errors.push(message); };
  try { report.root = realpathSync(report.root); }
  catch { fail(`workspace root does not exist: ${report.root}`); return report; }
  const seen = new Set<string>();
  const excluded = (path: string, reason: string) => { coverage.exclusions.push({ path, reason }); fail(`${path}: ${reason}`); };
  const readManifest = (candidate: string, required: boolean): { file: string; data: Record<string, unknown>; directory: string } | null => {
    if (coverage.manifestReadAttempts >= limits.maxReadAttempts) { fail(`manifest read-attempt budget ${limits.maxReadAttempts} reached; coverage is incomplete`); return null; }
    coverage.manifestReadAttempts++;
    let actual: string;
    try { actual = realpathSync(candidate); }
    catch { fail(`${candidate}: workspace directory is missing or unreadable`); return null; }
    if (!inside(report.root, actual)) { excluded(candidate, `workspace symlink escapes root to ${actual}`); return null; }
    try { if (!statSync(actual).isDirectory()) { if (required) fail(`${candidate}: workspace directory is not a directory`); return null; } }
    catch { fail(`${candidate}: workspace directory is unreadable`); return null; }
    const file = join(actual, "package.json");
    try { lstatSync(file); }
    catch (error) {
      if (required || !(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") fail(`${file}: workspace manifest is missing or unreadable`);
      return null;
    }
    let actualFile: string;
    try { actualFile = realpathSync(file); }
    catch { fail(`${file}: workspace manifest symlink is broken or unreadable`); return null; }
    if (!inside(report.root, actualFile)) { excluded(file, `workspace manifest symlink escapes root to ${actualFile}`); return null; }
    if (seen.has(actual)) return { file: actualFile, data: {}, directory: actual };
    if (seen.size >= limits.maxManifests) { fail(`manifest budget ${limits.maxManifests} reached; ${file} was not inspected`); return null; }
    try {
      if (statSync(actualFile).size > 1_048_576) throw new Error("manifest exceeds 1 MiB");
      const data: unknown = JSON.parse(readFileSync(actualFile, "utf8"));
      if (!object(data)) throw new Error("package.json must be an object");
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
        const deps = data[field];
        if (deps !== undefined && (!object(deps) || Object.values(deps).some(value => typeof value !== "string"))) throw new Error(`${field} must be an object of string ranges`);
      }
      seen.add(actual);
      const graph = inspectInstalledSdkGraph(actual);
      for (const issue of graph.issues) if (issue.kind === "limit") fail(`${actual}: ${issue.message}`);
      report.projects.push({ name: typeof data.name === "string" ? data.name : basename(actual), directory: actual, manifest: actualFile, graph });
      return { file: actualFile, data, directory: actual };
    } catch (error) { fail(`${file}: ${error instanceof Error ? error.message : String(error)}`); return null; }
  };
  const root = readManifest(report.root, true);
  if (root === null) return report;
  const workspaces = root.data.workspaces;
  const patterns = Array.isArray(workspaces) ? workspaces : object(workspaces) ? workspaces.packages : undefined;
  if (!Array.isArray(patterns) || !patterns.every(pattern => typeof pattern === "string")) { fail(`${root.file}: workspaces must be an array or an object with a packages string array`); return report; }
  for (const pattern of patterns as string[]) {
    if (coverage.patternsAttempted >= limits.maxPatterns) { fail(`workspace pattern budget ${limits.maxPatterns} reached; coverage is incomplete`); break; }
    coverage.patternsAttempted++;
    const segments = pattern.split("/");
    const wildcard = segments.at(-1) === "*";
    if (!pattern || isAbsolute(pattern) || /^[a-z]:/i.test(pattern) || pattern.includes("\\") || segments.some(segment => segment === ".." || segment === "" || segment === "node_modules")
      || /[?\[\]{}!]/.test(pattern) || segments.some((segment, index) => segment.includes("*") && !(wildcard && index === segments.length - 1))) {
      fail(`unsupported workspace pattern ${JSON.stringify(pattern)}; use safe relative literal directories or a terminal directory/* (including *)`);
      continue;
    }
    const item = { pattern, matched: 0 };coverage.patterns.push(item);
    if (!wildcard) {
      const matched = readManifest(resolve(report.root, pattern), true);
      if (matched !== null) item.matched++;
      continue;
    }
    const logicalBase = resolve(report.root, ...segments.slice(0, -1));
    let base: string;
    try { base = realpathSync(logicalBase); }
    catch { fail(`${logicalBase}: wildcard directory is missing or unreadable`); continue; }
    if (!inside(report.root, base)) { excluded(logicalBase, `workspace wildcard symlink escapes root to ${base}`); continue; }
    try {
      const entries = opendirSync(base);
      try {
        for (;;) {
          if (coverage.directoryEntriesExamined >= limits.maxDirectoryEntries) { fail(`directory-entry budget ${limits.maxDirectoryEntries} reached; coverage is incomplete`); break; }
          const entry = entries.readSync();if (entry === null) break;
          coverage.directoryEntriesExamined++;
          if (entry.name === "node_modules" || entry.name.startsWith(".") || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
          if (coverage.manifestReadAttempts >= limits.maxReadAttempts) { fail(`manifest read-attempt budget ${limits.maxReadAttempts} reached; coverage is incomplete`); break; }
          const matched = readManifest(join(base, entry.name), false);
          if (matched !== null) item.matched++;
        }
      } finally { entries.closeSync(); }
    } catch (error) { fail(`${logicalBase}: wildcard enumeration failed: ${error instanceof Error ? error.message : String(error)}`); }
    if (item.matched === 0) fail(`workspace pattern ${JSON.stringify(pattern)} matched no readable package manifests; coverage is incomplete`);
  }
  coverage.complete = coverage.errors.length === 0;
  report.status = !coverage.complete ? "incomplete" : report.projects.some(project => project.graph.issues.length > 0) ? "fail" : "pass";
  return report;
}

/** @internal */
export function runWorkspaceDoctor(argv: string[]): number {
  const json = argv.includes("--json");
  let directory: string | undefined;
  for (const arg of argv) {
    if (arg === "--workspace" || arg === "--json") continue;
    if (arg === "--help") { console.log("jgengine doctor --workspace [root] [--json] — installed SDK identities only"); return 0; }
    if (arg.startsWith("-") || directory !== undefined) { console.error(`error: unsupported workspace doctor argument ${arg}`); return 1; }
    directory = arg;
  }
  const report = inspectWorkspaceSdkInstall(directory ?? process.cwd());
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`jgengine doctor --workspace — installed SDK identities only\nRoot: ${report.root}`);
    for (const project of report.projects) {
      console.log(`  ${project.graph.issues.length === 0 ? "✓" : "✗"} ${relative(report.root, project.directory) || "."} (${project.name})`);
      for (const issue of project.graph.issues) console.log(`      ${issue.kind}: ${issue.message}`);
      if (project.graph.scope.uninstalledCatalogPackages.length > 0) console.log(`      Catalog packages without a project install: ${project.graph.scope.uninstalledCatalogPackages.join(", ")}`);
    }
    for (const error of report.coverage.errors) console.log(`  Coverage: ${error}`);
    console.log(`Coverage: ${report.coverage.complete ? "complete" : "incomplete"}, ${report.projects.length} manifests, ${report.coverage.directoryEntriesExamined} directory entries, ${report.coverage.manifestReadAttempts} read attempts`);
    console.log(`Installed SDK identity checks: ${report.status.toUpperCase()}. No files changed; install has not run.`);
  }
  return report.status === "pass" ? 0 : 1;
}
