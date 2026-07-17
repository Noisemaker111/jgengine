import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Integrity gate for the skill *recipe layer* — the connected, goal-oriented
 * walkthroughs under `.claude/skills/<skill>/recipes/*.md` that show how
 * primitives compose into a running game.
 *
 * A recipe is only useful if it stays honest, so this enforces two invariants:
 *
 *  1. Every `@jgengine/*` import statement resolves to a real published subpath
 *     (the reviewed `scripts/export-manifest.json`). A recipe can never point an
 *     agent at an export that does not exist or has been renamed.
 *  2. No recipe references `Games/*`. Recipes are self-contained — an agent must
 *     be able to build from the recipe alone, never by reading a sibling game.
 *
 * The recipe layer is organized by *composition seam* (what connects to what),
 * never by genre — a hybrid game is just a different composition of the same
 * primitives, so recipes describe joints, not game kinds.
 */

const root = process.cwd();
const skillsRoot = join(root, ".claude", "skills");

function rel(path: string): string {
  return path.replace(root + "/", "").replaceAll("\\", "/");
}

// --- valid published import specifiers, from the reviewed export manifest ---
const manifest = JSON.parse(readFileSync(join(root, "scripts", "export-manifest.json"), "utf8")) as Record<
  string,
  string[]
>;
const validSpecifiers = new Set<string>();
for (const [pkg, subpaths] of Object.entries(manifest)) {
  for (const sub of subpaths) {
    validSpecifiers.add(sub === "." ? pkg : pkg + sub.replace(/^\./, ""));
  }
}

// --- collect recipe files ---------------------------------------------------
function recipeFiles(): string[] {
  const out: string[] = [];
  for (const skill of readdirSync(skillsRoot)) {
    const recipesDir = join(skillsRoot, skill, "recipes");
    let entries: string[];
    try {
      entries = readdirSync(recipesDir);
    } catch {
      continue; // skill has no recipes/ dir
    }
    for (const entry of entries) {
      const full = join(recipesDir, entry);
      if (entry.endsWith(".md") && statSync(full).isFile()) out.push(full);
    }
  }
  return out;
}

const problems: string[] = [];
const files = recipeFiles();

const IMPORT_SPECIFIER = /(?:from|import)\s+["'](@jgengine\/[^"']+)["']/g;

for (const file of files) {
  const text = readFileSync(file, "utf8");

  for (const [lineNo, line] of text.split("\n").entries()) {
    if (line.includes("Games/")) {
      problems.push(
        `${rel(file)}:${lineNo + 1}: references Games/* — recipes must be self-contained (build from the recipe alone, never a sibling game)`,
      );
    }
    for (const match of line.matchAll(IMPORT_SPECIFIER)) {
      const spec = match[1]!;
      if (!validSpecifiers.has(spec)) {
        problems.push(
          `${rel(file)}:${lineNo + 1}: import "${spec}" is not a published subpath (check scripts/export-manifest.json; regenerate with bun run gen:export-manifest)`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(
    `\ncheck-recipes: ${problems.length} issue(s) in the skill recipe layer:\n` +
      problems.map((p) => `  ${p}`).join("\n") +
      `\n\nRecipes live at .claude/skills/<skill>/recipes/*.md and show how primitives\n` +
      `compose into a running game. Every @jgengine import must resolve to a real\n` +
      `published subpath, and no recipe may reference Games/* — an agent builds from\n` +
      `the recipe alone.\n`,
  );
  process.exit(1);
}

console.log(`check-recipes: clean — ${files.length} recipe(s) resolve against the published surface, no Games/* references`);
