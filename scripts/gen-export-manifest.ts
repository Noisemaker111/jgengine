import { readFileSync, writeFileSync } from "node:fs";
import { scanStalePackages } from "./distStaleness";
import { computeManifest, manifestPath, publishedPackages, repoRoot, serializeManifest } from "./exportManifest";

// Wildcard subpaths are computed from built dist, so generating on a stale/partial
// dist silently omits new subpaths. Warn loudly (advisory only — drift is gated
// separately on PRs) naming packages that need a build. The shared staleness
// signal consults each package's tsconfig.build.json include/exclude, so
// build-excluded raw-data sources (editor mcp/*, jgengine recipes/snippets/*) do
// not false-positive on a fully-built tree.
const staleForManifest = scanStalePackages(repoRoot, publishedPackages);
if (staleForManifest.length > 0) {
  const names = staleForManifest.map(({ pkg, staleness }) => `${pkg} (${staleness.kind})`).join(", ");
  console.warn(
    `\n⚠ export-manifest: ${staleForManifest.length} package(s) have stale/incomplete dist — wildcard subpaths may be omitted: ${names}.\n` +
      "  Run `bun run agent:bootstrap` (or `bun run build`) for a complete dist before trusting this manifest.\n",
  );
}

const check = process.argv.includes("--check");
const next = serializeManifest(computeManifest());

if (check) {
  let current = "";
  try {
    current = readFileSync(manifestPath, "utf8");
  } catch {
    current = "";
  }
  if (current !== next) {
    console.error(
      "export-manifest.json is out of date. The set of importable public subpaths drifted.\n" +
        "Run `bun run gen:export-manifest` and review the diff — a new subpath is a new public API.",
    );
    process.exit(1);
  }
  console.log("export-manifest.json is up to date");
} else {
  writeFileSync(manifestPath, next);
  console.log(`wrote ${manifestPath}`);
}
