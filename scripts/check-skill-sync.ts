import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

if (existsSync(join(root, "skills"))) {
  console.error(
    "check-skill-sync: a top-level skills/ directory exists. Agent skills live in .claude/skills/ — " +
      "that is the only place Claude Code auto-surfaces them; a top-level skills/ dir is invisible to sessions and rots.",
  );
  process.exit(1);
}

const skillsRoot = join(root, ".claude", "skills");
const requiredSkills = [
  "jgengine",
  "jgengine-foundation",
  "jgengine-world",
  "jgengine-procedural",
  "jgengine-combat",
  "jgengine-gameplay",
  "jgengine-multiplayer",
  "jgengine-ui",
  "jgengine-assets",
  "jgengine-verify",
];

for (const required of requiredSkills) {
  if (!existsSync(join(skillsRoot, required, "SKILL.md"))) {
    console.error(`check-skill-sync: missing .claude/skills/${required}/SKILL.md`);
    process.exit(1);
  }
  const frontmatter =
    readFileSync(join(skillsRoot, required, "SKILL.md"), "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  if (/disable-model-invocation:\s*true/.test(frontmatter)) {
    console.error(
      `check-skill-sync: .claude/skills/${required} must stay model-invocable — ` +
        "it is the route by which sessions discover the engine surface.",
    );
    process.exit(1);
  }
}

for (const name of readdirSync(skillsRoot)) {
  const skillPath = join(skillsRoot, name, "SKILL.md");
  if (!existsSync(skillPath)) continue;
  const frontmatter = readFileSync(skillPath, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  if (/disable-model-invocation:\s*true/.test(frontmatter)) continue;
  const description = (frontmatter.match(/^description:\s*>?-?\s*([\s\S]*?)(?=\n\S|$)/m)?.[1] ?? "")
    .replace(/\n\s+/g, " ")
    .trim();
  const words = description.split(/\s+/).filter(Boolean).length;
  if (words > 15) {
    console.error(
      `check-skill-sync: .claude/skills/${name} description is ${words} words (cap 15, aim ~10) — ` +
        "long descriptions never get invoked; lead with why, keep mechanics in the body (CLAUDE.md style rule).",
    );
    process.exit(1);
  }
}

const apiSkillDirs = readdirSync(skillsRoot)
  .filter((name) => name === "jgengine" || (name.startsWith("jgengine-") && name !== "jgengine-verify"))
  .sort();
const skillFiles = apiSkillDirs.flatMap((name) => {
  const dir = join(skillsRoot, name);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(dir, file));
});
const text = skillFiles.map((file) => readFileSync(file, "utf8")).join("\n");

const PKG_DIRS: Record<string, string> = {
  core: "packages/core/src",
  react: "packages/react/src",
  shell: "packages/shell/src",
  ws: "packages/ws/src",
  node: "packages/node/src",
  sql: "packages/sql/src",
  convex: "packages/convex/src",
  assets: "packages/assets/src",
  github: "packages/github/src",
  jgengine: "packages/jgengine/src",
};

const ALLOW_DOC_REFS = new Set(["@jgengine/core/CHANGELOG", "@jgengine/react/dist", "@jgengine/shell/dist"]);

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
for (const m of text.matchAll(/@jgengine\/(core|react|shell|ws|node|sql|convex|assets|github|jgengine)\/[A-Za-z0-9_/]+/g)) {
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
      `\n  → a new engine domain landed with no skill coverage. Document it in the matching .claude/skills/jgengine-* domain,` +
      `\n    or add it to INTERNAL_DOMAINS in this script if it is genuinely internal.`,
  );
}

if (problems.length > 0) {
  console.error(`\ncheck-skill-sync: JGengine API skills is out of sync with the code.\n\n${problems.join("\n\n")}\n`);
  process.exit(1);
}

console.log(
  `check-skill-sync: clean — ${seen.size} import paths resolve across ${apiSkillDirs.length} API skills, ` +
    `${coreDomains.length - INTERNAL_DOMAINS.size} public core domains covered ` +
    `(${skillFiles.length} markdown files)`,
);
