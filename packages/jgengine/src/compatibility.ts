import { dirname, join, resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { findWorkspaceRoot, readPackageJson, resolveDependencyRange } from "./pkg";

/** @internal */
export const LOCKSTEP_SDK_PACKAGES: readonly string[] = [
  "@jgengine/core", "@jgengine/rapier", "@jgengine/react", "@jgengine/ws", "@jgengine/node",
  "@jgengine/sql", "@jgengine/convex", "@jgengine/shell", "@jgengine/editor", "@jgengine/assets", "@jgengine/navbake",
];

/** @internal */
export function inspectInstalledPackageVersion(dir: string, name: string): { version: string | null; error?: string } {
  let current = resolve(dir);
  for (;;) {
    const file = join(current, "node_modules", name, "package.json");
    if (existsSync(file)) {
      const pkg = readPackageJson(file);
      if (pkg === null || typeof pkg.version !== "string" || pkg.version === "") return { version: null, error: `${file}: invalid installed package metadata` };
      return { version: pkg.version };
    }
    const parent = dirname(current);
    if (parent === current) return { version: null };
    current = parent;
  }
}

/** @internal */
export function installedPackageVersion(dir: string, name: string): string | null {
  return inspectInstalledPackageVersion(dir, name).version;
}

/** @internal */
export function installedSdkVersions(dir: string): { name: string; version: string }[] {
  const pkg = readPackageJson(join(dir, "package.json"));
  return Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies })
    .filter(name => name.startsWith("@jgengine/") && name !== "@jgengine/github")
    .flatMap(name => {
      const version = installedPackageVersion(dir, name);
      return version === null ? [] : [{ name, version }];
    });
}

/** @internal */
export interface InstalledSdkGraph {
  scope: { project: string; workspaceLeavesInspected: false; uninstalledCatalogPackages: string[] };
  nodes: { name: string; version: string | null; root: string }[];
  edges: { from: string; dependency: string; range: string; kind: "dependency" | "peer" | "optional"; to: string | null }[];
  issues: { kind: "identity-split" | "declaration-mismatch" | "missing" | "malformed" | "limit"; name: string; message: string }[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function installedPackageRoot(from: string, name: string): string | null {
  if (!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name)) return null;
  const anchor = join(realpathSync(from), "package.json");
  // Package identity does not require a root export; shell only exports subpaths.
  for (const path of createRequire(anchor).resolve.paths(name) ?? []) {
    const root = join(path, name);
    if (existsSync(join(root, "package.json"))) return realpathSync(root);
  }
  return null;
}

function sdkRangeMatches(range: string, version: string): boolean | null {
  const declared = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/.exec(range);
  const installed = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (declared === null || installed === null) return null;
  const [major, minor, patch] = declared.slice(2).map(Number);
  const [a, b, c] = installed.slice(1).map(Number);
  if (declared[1] === "") return a === major && b === minor && c === patch;
  if (a < major || a === major && (b < minor || b === minor && c < patch)) return false;
  if (declared[1] === "~") return a === major && b === minor;
  return major > 0 ? a === major : a === 0 && b === minor && (minor > 0 || c === patch);
}

/** Inspect direct consumers and their installed SDK dependency/peer identities without importing modules or scanning the filesystem. @internal */
export function inspectInstalledSdkGraph(dir: string, options: { maxPackages?: number } = {}): InstalledSdkGraph {
  const maximum = options.maxPackages ?? 256;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 256) throw new Error("SDK graph maxPackages must be between 1 and 256");
  const project = realpathSync(dir);
  const graph: InstalledSdkGraph = { scope: { project, workspaceLeavesInspected: false, uninstalledCatalogPackages: [] }, nodes: [], edges: [], issues: [] };
  const manifest = readPackageJson(join(project, "package.json"));
  if (!object(manifest)) return { ...graph, issues: [{ kind: "malformed", name: "package.json", message: `${project}/package.json is unreadable or malformed` }] };
  const canonical = new Map<string, string | null>();
  const queue = new Map<string, { name: string; root: string }>();
  const visited = new Set<string>();
  const issues = new Set<string>();
  const addIssue = (kind: InstalledSdkGraph["issues"][number]["kind"], name: string, message: string, identity?: string) => {
    const key = `${kind}:${identity ?? message}`;
    if (!issues.has(key)) { issues.add(key); graph.issues.push({ kind, name, message }); }
  };
  const canonicalRoot = (name: string): string | null => {
    if (!canonical.has(name)) canonical.set(name, installedPackageRoot(project, name));
    return canonical.get(name) ?? null;
  };
  const enqueue = (name: string, root: string) => {
    if (visited.has(root) || queue.has(root)) return;
    if (visited.size + queue.size >= maximum) {
      addIssue("limit", name, `SDK dependency inspection reached ${maximum} installed packages; ${root} was not inspected`);
      return;
    }
    queue.set(root, { name, root });
  };
  const fields = { dependencies: "dependency", peerDependencies: "peer", optionalDependencies: "optional" } as const;
  let directRequests = 0;
  const inspectEdges = (from: string, owner: string, data: Record<string, unknown>, direct: boolean) => {
    for (const [field, kind] of Object.entries(fields) as [keyof typeof fields, InstalledSdkGraph["edges"][number]["kind"]][]) {
      const dependencies = data[field];
      if (dependencies === undefined) continue;
      if (!object(dependencies)) { addIssue("malformed", owner, `${from}/package.json ${field} must be an object`); continue; }
      const entries = direct ? Object.entries(dependencies) : LOCKSTEP_SDK_PACKAGES.filter(name => name in dependencies).map(name => [name, dependencies[name]] as const);
      for (const [name, range] of entries) {
        if (direct && ++directRequests > maximum) {
          addIssue("limit", owner, `SDK dependency inspection reached ${maximum} direct declarations; remaining declarations were not inspected`);
          return;
        }
        const sdk = LOCKSTEP_SDK_PACKAGES.includes(name);
        if (!sdk && !direct) continue;
        if (typeof range !== "string") { if (sdk) addIssue("malformed", name, `${owner} (${from}) has invalid ${field}.${name}`); continue; }
        const target = installedPackageRoot(from, name);
        if (sdk) graph.edges.push({ from, dependency: name, range, kind, to: target });
        if (target === null) {
          const peers = data.peerDependenciesMeta;
          const peer = object(peers) ? peers[name] : undefined;
          const optional = kind === "optional" || kind === "peer" && object(peer) && peer.optional === true
            || kind === "dependency" && object(data.optionalDependencies) && name in data.optionalDependencies;
          if (sdk && !optional) addIssue("missing", name, `${owner} (${from}) ${field}.${name} ${range} has no installed package`);
          continue;
        }
        if (sdk) {
          const expected = canonicalRoot(name);
          if (expected !== null && expected !== target) {
            const actualVersion = readPackageJson(join(target, "package.json"))?.version ?? "unknown";
            const expectedVersion = readPackageJson(join(expected, "package.json"))?.version ?? "unknown";
            addIssue("identity-split", name, `${owner} (${from}) ${field}.${name} ${range} resolves ${name}@${actualVersion} at ${target}; project resolves ${name}@${expectedVersion} at ${expected}`, `${name}:${target}`);
          } else if (expected === null) canonical.set(name, target);
        }
        enqueue(name, target);
      }
    }
  };
  inspectEdges(project, String(manifest.name ?? "project"), manifest, true);
  if (object(manifest.devDependencies)) inspectEdges(project, "project", { dependencies: manifest.devDependencies }, true);
  const workspaces = manifest.workspaces;
  const catalogs = object(workspaces) ? [workspaces.catalog, ...(object(workspaces.catalogs) ? Object.values(workspaces.catalogs) : [])] : [];
  for (const catalog of catalogs) if (object(catalog)) {
    for (const name of LOCKSTEP_SDK_PACKAGES) if (name in catalog) {
      const root = canonicalRoot(name);
      if (root !== null) enqueue(name, root);
    }
  }
  const expectedDeclarations = new Map<string, string>();
  for (const dependencies of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, ...catalogs]) if (object(dependencies)) {
    for (const name of LOCKSTEP_SDK_PACKAGES) if (typeof dependencies[name] === "string") expectedDeclarations.set(name, dependencies[name]);
  }
  const workspaceRoot = findWorkspaceRoot(dir);
  const rootManifest = readPackageJson(join(workspaceRoot ?? project, "package.json")) as Record<string, unknown> | null;
  const shared = rootManifest?.workspaces;
  if (object(shared)) {
    const sharedCatalogs = [shared.catalog, ...(object(shared.catalogs) ? Object.values(shared.catalogs) : [])];
    for (const catalog of sharedCatalogs) if (object(catalog)) {
      for (const name of LOCKSTEP_SDK_PACKAGES) if (typeof catalog[name] === "string") {
        if (!expectedDeclarations.has(name)) expectedDeclarations.set(name, catalog[name]);
        if (canonicalRoot(name) === null && !graph.scope.uninstalledCatalogPackages.includes(name)) graph.scope.uninstalledCatalogPackages.push(name);
      }
    }
  }
  while (queue.size > 0) {
    const entry = queue.values().next().value!; queue.delete(entry.root); visited.add(entry.root);
    const data = readPackageJson(join(entry.root, "package.json"));
    const sdk = LOCKSTEP_SDK_PACKAGES.includes(entry.name);
    graph.nodes.push({ name: entry.name, version: data?.version ?? null, root: entry.root });
    if (!object(data) || sdk && (typeof data.version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(data.version) || data.name !== entry.name)) {
      addIssue("malformed", entry.name, `${entry.root}/package.json has invalid installed metadata for ${entry.name}`);
      continue;
    }
    inspectEdges(entry.root, String(data.name ?? entry.name), data, false);
  }
  for (const [name, declared] of expectedDeclarations) {
    const resolved = resolveDependencyRange(dir, name, declared);
    if (resolved.error !== undefined) { addIssue("malformed", name, resolved.error); continue; }
    const overrides = rootManifest?.overrides;
    const override = object(overrides) ? overrides[name] : undefined;
    const range = typeof override === "string" && sdkRangeMatches(override, "0.0.0") !== null ? override : resolved.range;
    const root = canonicalRoot(name);
    const version = root === null ? null : readPackageJson(join(root, "package.json"))?.version;
    if (range !== null && typeof version === "string" && sdkRangeMatches(range, version) === false) {
      addIssue("declaration-mismatch", name, `${name} declares ${declared}${declared === range ? "" : ` → ${range}`} but resolves ${version} at ${root}`);
    }
  }
  return graph;
}

/** @internal */
export function sdkMinorNewer(installed: string, supported: string): boolean {
  const a = /^(\d+)\.(\d+)\./.exec(installed);
  const b = /^(\d+)\.(\d+)\./.exec(supported);
  return a !== null && b !== null && (Number(a[1]) > Number(b[1]) || (a[1] === b[1] && Number(a[2]) > Number(b[2])));
}

/** @internal */
export function versionNewer(installed: string, incoming: string): boolean {
  const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(value);
  const a = parse(installed);
  const b = parse(incoming);
  if (a === null || b === null) throw new Error("invalid skill version metadata");
  for (let index = 1; index <= 3; index++) {
    if (Number(a[index]) !== Number(b[index])) return Number(a[index]) > Number(b[index]);
  }
  if (a[4] === b[4]) return false;
  if (a[4] === undefined) return true;
  if (b[4] === undefined) return false;
  const left = a[4].split(".");
  const right = b[4].split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const x = left[index];
    const y = right[index];
    if (x === y) continue;
    if (x === undefined) return false;
    if (y === undefined) return true;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    return numericX && numericY ? Number(x) > Number(y) : numericX !== numericY ? !numericX : x > y;
  }
  return false;
}
