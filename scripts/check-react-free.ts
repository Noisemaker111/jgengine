// React is gone from the engine and the games. UI is written against the engine's own runtime
// (`@jgengine/core/ui/jsx`), which draws through the DOM or through Rune. This fails on any import of
// `react`, `react-dom` or a subpath of either (type-only ones too), and on any package.json that
// names `react`, `react-dom`, their type packages or the Vite React plugin.
//
// Allowed, by name: the website (`apps/web`) and the two example hosts (`examples/next-host`,
// `examples/tanstack-host`), which are React apps that show the engine inside one.
// `packages/convex` and LLMville may name React in manifests for their hook libraries, but their
// source uses the engine runtime. `@jgengine/react` is the engine's own UI package (`packages/ui`,
// published under its original npm name), not React, so it is allowed everywhere.
// The root package.json keeps the catalog entries the framework hosts use.
//
//   bun run check react-free
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

const REACT_SPECIFIER = /^react(?:-dom)?(?:\/|$)/;
const REACT_PACKAGE = /^(?:react|react-dom|@types\/react|@types\/react-dom|@vitejs\/plugin-react)$/;
/** Folders that may use React, each for the reason in the header. */
export const REACT_ALLOWED = ["apps/web/", "examples/next-host/", "examples/tanstack-host/"];
const REACT_HOOK_MANIFESTS = new Set(["packages/convex/package.json", "games/llmville/package.json"]);
/** Source roots. `scripts/` is left out: its tests and the port script hold import lines as strings. */
const SOURCE_ROOTS = ["packages", "games", "apps", "registry", "examples"];
const SOURCE_FILE = /\.(tsx?|jsx?|mjs|cjs)$/;

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

const IMPORT_SPECIFIER = /\b(?:import|export)\s+(?:type\s+)?[^;"']*?\s+from\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/g;

/** The React modules `source` imports. */
export function reactImports(source: string): string[] {
  const found: string[] = [];
  for (const match of withoutComments(source).matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined && REACT_SPECIFIER.test(specifier)) found.push(`import of ${specifier}`);
  }
  return found;
}

/** The React packages a package.json names in any dependency field. */
export function reactDependencies(packageJson: string): string[] {
  const parsed: unknown = JSON.parse(packageJson);
  if (typeof parsed !== "object" || parsed === null) return [];
  const found: string[] = [];
  for (const [field, value] of Object.entries(parsed)) {
    if (!/dependencies$/i.test(field) && field !== "peerDependenciesMeta") continue;
    if (typeof value !== "object" || value === null) continue;
    for (const name of Object.keys(value)) if (REACT_PACKAGE.test(name)) found.push(`${field}: ${name}`);
  }
  return found;
}

export interface ReactViolation {
  file: string;
  what: string;
}

/** Scan the tracked and untracked files under `root` for React outside the allowed folders. */
export function scanReactFree(root: string): { files: number; violations: ReactViolation[] } {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0) throw new Error(`git ls-files: ${listed.stderr}`);
  const violations: ReactViolation[] = [];
  let files = 0;
  for (const file of listed.stdout.split("\n")) {
    if (file.length === 0 || file === "package.json") continue;
    const isManifest = /(^|\/)package\.json$/.test(file);
    const isSource = SOURCE_FILE.test(file) && SOURCE_ROOTS.some((dir) => file.startsWith(`${dir}/`));
    if (!isManifest && !isSource) continue;
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    files += 1;
    const host = REACT_ALLOWED.some((dir) => file.startsWith(dir));
    for (const what of isManifest ? reactDependencies(source) : reactImports(source)) {
      if (host || (isManifest && REACT_HOOK_MANIFESTS.has(file))) continue;
      violations.push({ file, what });
    }
  }
  return { files, violations };
}

const USAGE: Usage = {
  summary: "fail when a source file outside the React hosts imports react or react-dom, or a package.json there names a React package",
  usage: "bun run check react-free",
  flags: [],
  example: "bun run check react-free",
  exits: ["0 clean", "1 something outside the allowed folders still uses React"],
};

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("check:react-free", USAGE, argv)) return 0;
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { files, violations } = scanReactFree(root);
  if (violations.length === 0) {
    console.log(`react-free ok: ${files} files scanned, no react or react-dom import or dependency outside ${REACT_ALLOWED.join(", ")}`);
    return 0;
  }
  console.error("check:react-free failed:");
  for (const violation of violations) {
    console.error(`  ${violation.file}: ${violation.what} — write UI against @jgengine/core/ui/jsx (bun scripts/port-react-ui.ts rewrites the imports)`);
  }
  return 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
