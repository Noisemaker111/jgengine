import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const skill = join(root, "skills", "jgengine-api", "SKILL.md");
const text = readFileSync(skill, "utf8");

const PKG_DIRS: Record<string, string> = {
  core: "packages/core/src",
  react: "packages/react/src",
  shell: "packages/shell/src",
  ws: "packages/ws/src",
  node: "packages/node/src",
  sql: "packages/sql/src",
  convex: "packages/convex/src",
  assets: "packages/assets/src",
};

const ALLOW_DOC_REFS = new Set(["@jgengine/core/CHANGELOG"]);

const INTERNAL_DOMAINS = new Set(["store", "assets"]);

function resolves(pkg: string, sub: string): boolean {
  const base = join(root, PKG_DIRS[pkg], sub);
  return (
    existsSync(base + ".ts") ||
    existsSync(base + ".tsx") ||
    existsSync(join(base, "index.ts")) ||
    (existsSync(base) && statSync(base).isDirectory()) ||
    existsSync(join(root, "packages", pkg, sub) + ".md")
  );
}

const badPaths: string[] = [];
const seen = new Set<string>();
for (const m of text.matchAll(/@jgengine\/(core|react|shell|ws|node|sql|convex|assets)\/[A-Za-z0-9_/]+/g)) {
  const ref = m[0];
  if (seen.has(ref) || ALLOW_DOC_REFS.has(ref)) continue;
  seen.add(ref);
  const [, pkg, ...rest] = ref.split("/");
  const scope = pkg;
  const sub = rest.join("/");
  if (!PKG_DIRS[scope]) continue;
  if (!resolves(scope, sub)) badPaths.push(ref);
}

const coreDomains = readdirSync(join(root, PKG_DIRS.core)).filter((n) =>
  statSync(join(root, PKG_DIRS.core, n)).isDirectory(),
);
const missingDomains = coreDomains.filter(
  (d) => !INTERNAL_DOMAINS.has(d) && !text.includes(`${d}/`),
);

const problems: string[] = [];
if (badPaths.length > 0) {
  problems.push(
    `Import paths referenced in the skill that do not resolve to source (${badPaths.length}):\n` +
      badPaths.map((p) => `  ${p}`).join("\n") +
      `\n  → a path was renamed/removed in packages, or the skill invented one. Fix the skill or the export.`,
  );
}
if (missingDomains.length > 0) {
  problems.push(
    `Public @jgengine/core domains never referenced in the skill (${missingDomains.length}):\n` +
      missingDomains.map((d) => `  ${d}/`).join("\n") +
      `\n  → a new engine domain landed with no skill coverage. Document it in skills/jgengine-api/SKILL.md,` +
      `\n    or add it to INTERNAL_DOMAINS in this script if it is genuinely internal.`,
  );
}

if (problems.length > 0) {
  console.error(`\ncheck-skill-sync: jgengine-api skill is out of sync with the code.\n\n${problems.join("\n\n")}\n`);
  process.exit(1);
}

console.log(
  `check-skill-sync: clean — ${seen.size} import paths resolve, ` +
    `${coreDomains.length - INTERNAL_DOMAINS.size} public core domains covered`,
);
