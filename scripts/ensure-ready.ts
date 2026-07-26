import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scanStalePackages } from "./distStaleness";

function run(label: string, cmd: string[], timeoutMs: number): void {
  console.log(`ensure-ready: ${label}`);
  const result = Bun.spawnSync(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  if (result.exitCode !== 0) {
    const reason = result.signalCode
      ? `was killed by ${result.signalCode} — likely hit the ${Math.round(timeoutMs / 1000)}s hard timeout`
      : `failed with exit code ${result.exitCode}`;
    console.error(`ensure-ready: '${cmd.join(" ")}' ${reason}`);
    process.exit(result.exitCode ?? 1);
  }
}

if (!existsSync(join(process.cwd(), "node_modules", ".bin", "tsgo"))) {
  run("node_modules incomplete (tsgo missing) — running bun install", ["bun", "install"], 300_000);
}

function workspacePatterns(): string[] {
  const workspaces = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).workspaces as
    | string[]
    | { packages: string[] };
  return Array.isArray(workspaces) ? workspaces : workspaces.packages;
}

function workspacePackages(): Map<string, string> {
  const patterns = workspacePatterns();
  const dirs: string[] = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const base = join(process.cwd(), pattern.slice(0, -2));
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(join(base, entry.name));
      }
    } else {
      dirs.push(join(process.cwd(), pattern));
    }
  }
  const packages = new Map<string, string>();
  for (const dir of dirs) {
    const manifest = join(dir, "package.json");
    if (!existsSync(manifest)) continue;
    const name = JSON.parse(readFileSync(manifest, "utf8")).name;
    if (typeof name === "string" && name.length > 0) packages.set(name, dir);
  }
  return packages;
}

type BrokenLink = { workspaceDir: string; dep: string; linkPath: string; reason: string };

function brokenWorkspaceLinks(packages: Map<string, string>): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const dir of packages.values()) {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const deps: Record<string, string> = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [dep, spec] of Object.entries(deps)) {
      if (!spec.startsWith("workspace:")) continue;
      const source = packages.get(dep);
      if (!source) continue;
      const candidates = [join(dir, "node_modules", dep), join(process.cwd(), "node_modules", dep)];
      const linkPath = candidates.find((candidate) => {
        try {
          lstatSync(candidate);
          return true;
        } catch {
          return false;
        }
      });
      if (linkPath === undefined) {
        broken.push({ workspaceDir: dir, dep, linkPath: candidates[0]!, reason: "not installed" });
      } else if (!existsSync(linkPath)) {
        broken.push({ workspaceDir: dir, dep, linkPath, reason: "dangling symlink" });
      } else if (realpathSync(linkPath) !== realpathSync(source)) {
        broken.push({ workspaceDir: dir, dep, linkPath, reason: `resolves to ${realpathSync(linkPath)} instead of ${source}` });
      }
    }
  }
  return broken;
}

function healWorkspaceLinks(): void {
  const packages = workspacePackages();
  const broken = brokenWorkspaceLinks(packages);
  if (broken.length === 0) return;
  for (const link of broken) {
    console.error(`ensure-ready: stale workspace link — ${link.workspaceDir} → ${link.dep} (${link.reason})`);
    rmSync(join(link.workspaceDir, "node_modules"), { recursive: true, force: true });
    rmSync(join(process.cwd(), "node_modules", link.dep), { recursive: true, force: true });
  }
  run("stale workspace links removed — running bun install to relink", ["bun", "install"], 300_000);
  const still = brokenWorkspaceLinks(packages);
  if (still.length > 0) {
    console.error(
      `ensure-ready: workspace links still broken after reinstall (${still
        .map((link) => `${link.workspaceDir} → ${link.dep}`)
        .join(", ")}) — run 'rm -rf node_modules && bun install' at the repo root`,
    );
    process.exit(1);
  }
}

healWorkspaceLinks();

if (process.argv.includes("--install-only")) process.exit(0);

// Shared staleness signal: a package needs a build when its dist is absent,
// partially emitted (an interrupted build left some src without a dist output),
// or older than its src. Consulting each package's tsconfig.build.json
// include/exclude — rather than a coarse newest-src-mtime > newest-dist-mtime
// scan — catches partial emits and avoids false positives on build-excluded
// raw-data sources (editor mcp/*, jgengine recipes/snippets/*), so every
// package (not just core) resolves to a fresh dist before check-types runs.
const stale = scanStalePackages(process.cwd());
if (stale.length > 0) {
  const detail = stale.map(({ pkg, staleness }) => `${pkg} (${staleness.kind})`).join(", ");
  run(
    `dist/ missing or stale for ${detail} (package exports point at dist/) — running bun run build`,
    ["bun", "run", "build"],
    600_000,
  );
}
