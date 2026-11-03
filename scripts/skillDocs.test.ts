import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Glob } from "bun";

// The skills ship to SDK users (`jgengine skills`, `npx skills`). These hold what breaks for them.
const root = join(import.meta.dir, "..");
const skillsRoot = join(root, ".claude", "skills");
const skillDirs = readdirSync(skillsRoot).filter((name) => existsSync(join(skillsRoot, name, "SKILL.md"))).sort();

describe("skill docs", () => {
  // Installers parse frontmatter as strict YAML and silently skip a skill that fails or is misnamed.
  test("every SKILL.md has YAML frontmatter whose name is its folder", () => {
    const problems: string[] = [];
    for (const name of skillDirs) {
      const raw = readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8");
      if (raw.charCodeAt(0) === 0xfeff) problems.push(`${name}: starts with a UTF-8 BOM`);
      const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
      if (frontmatter === undefined) {
        problems.push(`${name}: no frontmatter`);
        continue;
      }
      try {
        const fields = Bun.YAML.parse(frontmatter) as Record<string, unknown> | null;
        if (fields?.["name"] !== name) problems.push(`${name}: frontmatter name is ${JSON.stringify(fields?.["name"])}`);
      } catch (error) {
        problems.push(`${name}: frontmatter is not valid YAML (${(error as Error).message}); quote values containing ": "`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("every @jgengine/* path a hand-written skill doc names exists", () => {
    const allowed = new Set(["@jgengine/core/CHANGELOG", "@jgengine/react/dist", "@jgengine/shell/dist"]);
    const resolves = (pkg: string, sub: string): boolean => {
      const base = join(root, "packages", pkg, "src", sub);
      return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base, join(root, "packages", pkg, `${sub}.md`)].some(existsSync);
    };
    const missing = new Set<string>();
    for (const file of new Glob("**/*.md").scanSync({ cwd: skillsRoot, absolute: true })) {
      if (basename(file) === "api.md" || basename(file) === "capabilities.md") continue;
      for (const match of readFileSync(file, "utf8").matchAll(/@jgengine\/(core|react|shell|ws|node|sql|convex|assets|github|jgengine)\/[A-Za-z0-9_/]+(?:\.(?:view|draw))?(?:\.css)?/g)) {
        const ref = match[0];
        const [, pkg, ...rest] = ref.split("/");
        if (!allowed.has(ref) && pkg !== undefined && !resolves(pkg, rest.join("/"))) missing.add(ref);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
